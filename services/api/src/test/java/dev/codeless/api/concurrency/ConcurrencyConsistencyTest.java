package dev.codeless.api.concurrency;

import static org.assertj.core.api.Assertions.assertThat;

import dev.codeless.api.agent.AgentJournal;
import dev.codeless.api.agent.AgentRunStore;
import dev.codeless.api.concurrency.ConcurrencyHarness.Res;
import dev.codeless.api.concurrency.ConcurrencyHarness.Session;
import dev.codeless.api.data.ArtifactRepository;
import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.deploy.DeploymentGateway;
import dev.codeless.api.deploy.DeploymentRecords;
import dev.codeless.api.deploy.PublicationService;
import dev.codeless.api.recovery.RunnerCleanup;
import dev.codeless.api.tasks.TaskQueueService;
import dev.codeless.api.tasks.TaskScheduler;
import dev.codeless.api.tasks.TaskStageRunner.StageResult;
import dev.codeless.api.tools.FileToolService;
import dev.codeless.api.versions.SnapshotStore;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInfo;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;

/**
 * D20-A concurrency, idempotency and version consistency over real HTTP (embedded Tomcat), real PostgreSQL and the
 * production queue, lease scheduler, file tools, version store, READY commit, convergence, publication worker and
 * deployment ledger. Fixtures: stage runner (no model/build/browser) and hosting, both named in {@link ConcurrencyHarness}.
 * <ul>
 *   <li>D20-A-01: duplicate submissions to one application, two users racing, cancel racing the READY commit.</li>
 *   <li>D20-A-02: publishing an old version while edits, READY commits and restores change the application.</li>
 *   <li>D20-A-03: {@link ConsistencyAudit} after every test over every row, plus a negative control.</li>
 *   <li>D20-A-04: owner reads that must be one snapshot, placed exactly between two statements by {@link StatementGate};
 *   READY commits and drafts whose freeze outlasts the lease, paused inside the store by {@link ConcurrencyHarness.StoreGate}.</li>
 * </ul>
 * Own PostgreSQL (the queue is global to a database) and own roots; the context is closed after the class.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "CODELESS_DEMO_PASSWORD=" + ConcurrencyConsistencyTest.DEMO_PASSWORD,
        "CODELESS_ADMIN_PASSWORD=" + ConcurrencyConsistencyTest.ADMIN_PASSWORD,
        "codeless.deploy.worker-enabled=false",
        "codeless.tasks.enabled=false",
        "codeless.recovery.sweep-enabled=false",
        "spring.datasource.hikari.maximum-pool-size=40"
})
@Import(ConcurrencyConsistencyTest.Fixtures.class)
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ConcurrencyConsistencyTest {
    static final String DEMO_PASSWORD = "demo-password-for-test-only";
    static final String ADMIN_PASSWORD = "admin-password-for-test-only";
    static final Path ROOT = Path.of("target", "d20a-concurrency", UUID.randomUUID().toString()).toAbsolutePath().normalize();
    static final StatementGate GATE = new StatementGate();
    static final ConcurrencyHarness.StoreGate STORE = ConcurrencyHarness.StoreGate.fromEnvironment();
    static final ConcurrencyHarness.Hosting HOSTING = new ConcurrencyHarness.Hosting();
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("codeless_d20a_test").withUsername("codeless_test").withPassword("local-test-only");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("CODELESS_DATABASE_URL", () -> "jdbc:postgresql://127.0.0.1:1/must_not_connect");
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("codeless.agent.private-root", () -> ROOT.resolve("agent").toString());
        registry.add("codeless.versions.root", () -> ROOT.resolve("versions").toString());
        registry.add("codeless.deploy.root", () -> ROOT.resolve("deployments").toString());
        registry.add("codeless.model.audit-root", () -> ROOT.resolve("model-calls").toString());
        registry.add("codeless.admin.audit-root", () -> ROOT.resolve("admin-audit").toString());
        registry.add("CODELESS_FILE_WORKSPACE_ROOT", () -> ROOT.resolve("workspaces").toString());
        registry.add("CODELESS_FILE_AUDIT_ROOT", () -> ROOT.resolve("file-audit").toString());
    }

    @TestConfiguration
    static class Fixtures {
        @Bean @Primary DeploymentGateway fixtureHosting() {
            return HOSTING;
        }

        @Bean static BeanPostProcessor statementGate() {
            return new BeanPostProcessor() {
                @Override public Object postProcessAfterInitialization(Object bean, String name) {
                    return bean instanceof DataSource source && !Proxy.isProxyClass(bean.getClass()) ? GATE.wrap(source) : bean;
                }
            };
        }

        @Bean static BeanPostProcessor storeGate() {
            return new BeanPostProcessor() {
                @Override public Object postProcessAfterInitialization(Object bean, String name) {
                    return bean instanceof SnapshotStore store && !Proxy.isProxyClass(bean.getClass()) ? STORE.wrap(store) : bean;
                }
            };
        }
    }

    record Account(UUID id, String email, String password) {}

    @Value("${local.server.port}") int port;
    @Autowired JdbcClient jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired PlatformRepository repository;
    @Autowired TaskQueueService queue;
    @Autowired FileToolService files;
    @Autowired SnapshotStore snapshots;
    @Autowired PublicationService publications;
    @Autowired DeploymentRecords records;
    @Autowired ArtifactRepository artifacts;
    @Autowired RunnerCleanup cleanup;
    @Autowired BCryptPasswordEncoder encoder;

    ConcurrencyHarness.Http http;
    ConcurrencyHarness.StageRunner runner;
    /** A second API instance: its own service object and ledger monitor over the same private volume and database. */
    PublicationService secondInstance;
    List<TaskScheduler> schedulers;
    Account alice, bob;
    Session aliceTab1, aliceTab2, bobTab, admin;
    final Set<UUID> quarantined = ConcurrentHashMap.newKeySet();
    /** Every violation an earlier audit already failed a test for; see {@link #audit}. */
    final Set<String> reported = ConcurrentHashMap.newKeySet();
    final Map<String, Object> audits = new LinkedHashMap<>();

    @BeforeAll
    void fixtures() throws Exception {
        http = new ConcurrencyHarness.Http(port);
        var store = new AgentRunStore(jdbc, transactions, new AgentJournal(ROOT.resolve("agent/journal")), snapshots);
        runner = new ConcurrencyHarness.StageRunner(store, files, snapshots, jdbc, Files.createDirectories(ROOT.resolve("scratch")));
        secondInstance = new PublicationService(jdbc, artifacts, snapshots, new DeploymentRecords(ROOT.resolve("deployments")), HOSTING, transactions);
        schedulers = List.of(new TaskScheduler(queue, runner, cleanup, 3000), new TaskScheduler(queue, runner, cleanup, 3000),
                new TaskScheduler(queue, runner, cleanup, 3000));
        alice = account("alice");
        bob = account("bob");
        aliceTab1 = http.login(alice.email(), alice.password());
        aliceTab2 = http.login(alice.email(), alice.password());
        bobTab = http.login(bob.email(), bob.password());
        admin = http.login("admin@codeless.local", ADMIN_PASSWORD);
    }

    @BeforeEach
    void reset() {
        HOSTING.reset();
        GATE.reset();
        STORE.reset();
    }

    /**
     * D20-A-03 after every test: every row of the suite's database and every bound ledger/served location must agree.
     * Each audit checks everything, but a violation fails only the test after which it first appears, so one defect is
     * reported once, at its source, instead of failing every later test (the D20-B review run failed six tests for one).
     */
    @AfterEach
    void audit(TestInfo test) throws Exception {
        GATE.reset();
        STORE.reset();
        HOSTING.open();
        int left = queuedOrRunning();
        var report = ConsistencyAudit.run(jdbc, transactions, snapshots, records, HOSTING, Set.copyOf(quarantined));
        var fresh = report.violations().stream().filter(violation -> !reported.contains(violation)).toList();
        reported.addAll(report.violations());
        audits.put(test.getTestMethod().orElseThrow().getName(), ConcurrencyHarness.ordered("checked", report.checked(),
                "violations", report.violations(), "firstReportedHere", fresh, "queuedOrRunningLeft", left));
        ConcurrencyHarness.evidence("D20-A-03-audit", Map.of("invariants", INVARIANTS, "afterEachTest", audits));
        assertThat(left).as("a test left work in the queue").isZero();
        assertThat(fresh).as("consistency audit after %s (all violations: %s)", test.getDisplayName(), report.violations()).isEmpty();
    }

    static final Map<String, String> INVARIANTS = new TreeMap<>(Map.ofEntries(
            Map.entry("E1", "task events are exactly 1..event_sequence"),
            Map.entry("E2", "first event is STAGE_STARTED/PLAN"),
            Map.entry("E3", "READY/FAILED has exactly one terminal event, last, matching status; FAILED has a code"),
            Map.entry("E4", "terminal tasks are FINISHED and unleased; nonterminal tasks stay queued or running"),
            Map.entry("E5", "stage changes follow PLAN->GENERATE->VERIFY->(REPAIR->GENERATE)*->READY|FAILED"),
            Map.entry("V1", "VERIFIED has its own SUCCEEDED/exit 0 build and a frozen outcome with that build and artifact digest"),
            Map.entry("V2", "FAILED never has a usable VERIFIED outcome and has its frozen FAILED report"),
            Map.entry("V3", "DRAFT has no frozen outcome and no terminal source task"),
            Map.entry("V4", "source task exists and belongs to the same application"),
            Map.entry("V5", "READY task has exactly one VERIFIED version named by its READY event; others none"),
            Map.entry("V6", "latest pointer is a VERIFIED version of the same application"),
            Map.entry("P1", "ledger binding equals SQL row, version, build and artifact digest"),
            Map.entry("P2", "SQL publication status agrees with the ledger phase"),
            Map.entry("P3", "each publication reached hosting at most once, exactly when the ledger says PUBLISHING; no location overwritten"),
            Map.entry("P4", "bytes served at the publication's own location hash to the bound digest and equal the frozen artifact"),
            Map.entry("P5", "requester owns the application"),
            Map.entry("X1", "served page carries only its owner's marker")));

    // ---------------------------------------------------------------- D20-A-01 duplicate tasks in one application

    @Test @Order(1)
    void d20a01DuplicateSubmissionsToOneApplicationRunOnceEachInOrder() throws Exception {
        UUID app = application(aliceTab1, "D20A duplicates");
        UUID base = ready(aliceTab1, app, "D20A duplicates base");
        String key = "d20a-dup-" + UUID.randomUUID();
        var keyed = parallel(12, i -> http.post(i % 2 == 0 ? aliceTab1 : aliceTab2, "/api/v0/tasks",
                Map.of("applicationId", app.toString(), "prompt", "D20A same key same prompt"), key));
        var keyedIds = new HashSet<String>();
        for (Res r : keyed) {
            assertThat(r.status()).as(r.body()).isEqualTo(202);
            keyedIds.add(r.json().path("id").asText());
        }
        assertThat(keyedIds).hasSize(1);
        var unkeyed = parallel(5, i -> http.post(aliceTab2, "/api/v0/tasks",
                Map.of("applicationId", app.toString(), "prompt", "D20A unkeyed duplicate " + i), null));
        unkeyed.forEach(r -> assertThat(r.status()).as(r.body()).isEqualTo(202));
        // While ordinary tasks are queued, an edit is refused; a changed prompt under the same key is a conflict.
        Res edit = http.post(aliceTab1, "/api/v0/applications/" + app + "/edits",
                Map.of("baseVersionId", base.toString(), "prompt", "D20A edit while queued", "source", Map.of("type", "CHAT")), null);
        Res conflicting = http.post(aliceTab1, "/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "D20A changed prompt"), key);
        assertThat(edit.status()).isEqualTo(409);
        assertThat(edit.json().path("code").asText()).isEqualTo("EDIT_TASK_ACTIVE");
        assertThat(conflicting.status()).isEqualTo(409);
        assertThat(conflicting.json().path("code").asText()).isEqualTo("IDEMPOTENCY_CONFLICT");

        List<UUID> created = jdbc.sql("SELECT id FROM generation_tasks WHERE application_id=? AND queue_state='QUEUED' ORDER BY created_at, id")
                .param(app).query(UUID.class).list();
        assertThat(created).hasSize(6);
        runAll();
        // Each task ran each stage exactly once, never two of this application at a time, in submission order.
        for (UUID task : created) {
            for (TaskStatus stage : List.of(TaskStatus.PLAN, TaskStatus.GENERATE, TaskStatus.VERIFY))
                assertThat(runner.executions(task, stage)).as("%s %s", task, stage).isEqualTo(1);
            assertThat(status(task)).isEqualTo("READY");
        }
        assertThat(runner.maxRunningPerApplication.get(app)).isEqualTo(1);
        assertThat(runner.planOrder.stream().filter(created::contains).toList()).isEqualTo(created);
        UUID last = versionOf(created.getLast());
        assertThat(latest(app)).isEqualTo(last);
        var numbers = jdbc.sql("SELECT number FROM application_versions WHERE application_id=? ORDER BY number").param(app).query(Integer.class).list();
        assertThat(numbers).isEqualTo(Stream.iterate(1, n -> n + 1).limit(numbers.size()).toList());
        Res replay = http.post(aliceTab2, "/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "D20A same key same prompt"), key);
        assertThat(replay.json().path("id").asText()).isEqualTo(keyedIds.iterator().next());
        assertThat(replay.json().path("status").asText()).isEqualTo("READY");

        // Same instant: six same-key edit clicks and six ordinary submissions on the idle application. Whichever takes
        // the application lock first decides; an edit and an ordinary task are never active together.
        String editKey = "d20a-edit-" + UUID.randomUUID();
        var mixed = parallel(12, i -> i % 2 == 0
                ? http.post(aliceTab1, "/api/v0/applications/" + app + "/edits", Map.of("baseVersionId", last.toString(),
                        "prompt", "D20A racing edit", "source", Map.of("type", "CHAT")), editKey)
                : http.post(aliceTab2, "/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "D20A racing generation " + i), null));
        var editIds = new HashSet<String>();
        int editAccepted = 0, generationAccepted = 0;
        for (int i = 0; i < mixed.size(); i++) {
            Res r = mixed.get(i);
            if (r.status() == 202) {
                if (i % 2 == 0) { editAccepted++; editIds.add(r.json().path("task").path("id").asText()); } else generationAccepted++;
            } else {
                assertThat(r.status()).as(r.body()).isEqualTo(409);
                assertThat(r.json().path("code").asText()).isEqualTo("EDIT_TASK_ACTIVE");
            }
        }
        String winner = editAccepted > 0 ? "EDIT" : "GENERATION";
        assertThat(editAccepted == 6 && generationAccepted == 0 || editAccepted == 0 && generationAccepted == 6)
                .as("edits %s, generations %s", editAccepted, generationAccepted).isTrue();
        assertThat(editIds.size()).isLessThanOrEqualTo(1);
        int active = count("SELECT count(*) FROM generation_tasks WHERE application_id=? AND queue_state IN ('QUEUED','RUNNING')", app);
        assertThat(active).isEqualTo(winner.equals("EDIT") ? 1 : 6);
        runAll();
        assertThat(runner.maxRunningPerApplication.get(app)).isEqualTo(1);

        ConcurrencyHarness.evidence("D20-A-01-duplicate-tasks", ConcurrencyHarness.ordered(
                "sameKeyRequests", 12, "sameKeyTaskIds", keyedIds, "unkeyedRequests", 5, "queuedTasks", created.size(),
                "editWhileQueued", Map.of("status", edit.status(), "code", "EDIT_TASK_ACTIVE"),
                "changedPromptSameKey", Map.of("status", conflicting.status(), "code", "IDEMPOTENCY_CONFLICT"),
                "schedulerInstances", schedulers.size(), "stageExecutionsPerTask", 1, "maxRunningInApplication", 1,
                "executionOrderEqualsSubmissionOrder", true, "versionNumbers", numbers, "latestIsLastSubmitted", last,
                "replayAfterReady", replay.json().path("status").asText(),
                "editVersusGeneration", Map.of("sameKeyEditClicks", 6, "generationSubmissions", 6, "winner", winner,
                        "editsAccepted", editAccepted, "editTaskIds", editIds, "generationsAccepted", generationAccepted,
                        "activeAfterRace", active, "otherSideRejectedWith", "409 EDIT_TASK_ACTIVE")));
    }

    // ---------------------------------------------------------------- D20-A-T2 cancel racing the READY commit

    @Test @Order(2)
    void d20aT2CancelRacingTheReadyCommitNeverOverwritesTheSuccessfulVersion() throws Exception {
        UUID app = application(aliceTab1, "D20A cancel race");
        UUID previous = ready(aliceTab1, app, "D20A cancel race base");
        var rounds = new ArrayList<Map<String, Object>>();
        int cancelWins = 0, commitWins = 0;
        for (int round = 0; round < 16; round++) {
            boolean edit = round % 2 == 0;
            Res accepted = edit
                    ? http.post(aliceTab1, "/api/v0/applications/" + app + "/edits", Map.of("baseVersionId", previous.toString(),
                            "prompt", "D20A edit round " + round, "source", Map.of("type", "CHAT")), null)
                    : http.post(aliceTab1, "/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "D20A generation round " + round), null);
            assertThat(accepted.status()).as(accepted.body()).isEqualTo(202);
            UUID task = UUID.fromString((edit ? accepted.json().path("task") : accepted.json()).path("id").asText());
            var claim = standAtReadyCommit(task);
            UUID candidate = UUID.fromString(runner.drafts.get(task).path("versionId").asText());
            String previousTree = tree(ROOT.resolve("versions").resolve(previous.toString()));
            // Round 0: cancel strictly first; round 1: commit strictly first; then both released by one latch, the
            // in-process commit offset by 0..21 ms so that it meets the HTTP cancels at different points.
            String order = round == 0 ? "CANCEL_FIRST" : round == 1 ? "COMMIT_FIRST" : "SIMULTANEOUS";
            long commitDelayMs = round < 2 ? 0 : (round - 2) * 3L / 2;
            var start = new CountDownLatch(1);
            var outcomes = new ConcurrentHashMap<String, Object>();
            try (ExecutorService pool = Executors.newFixedThreadPool(4)) {
                Callable<Object> commit = () -> {
                    start.await();
                    if (commitDelayMs > 0) Thread.sleep(commitDelayMs);
                    try {
                        return runner.advance(queue, claim, new StageResult(TaskStatus.READY, "race", null), EventType.STAGE_COMPLETED).status().name();
                    } catch (RuntimeException rejected) {
                        return "REJECTED:" + rejected.getMessage();
                    }
                };
                List<Callable<Res>> cancels = List.of(
                        () -> { start.await(); return http.post(aliceTab1, "/api/v0/tasks/" + task + "/cancel", null, null); },
                        () -> { start.await(); return http.post(aliceTab2, "/api/v0/tasks/" + task + "/cancel", null, null); },
                        () -> { start.await(); return http.post(admin, "/api/v0/admin/tasks/" + task + "/cancel", Map.of("reason", "D20A race " + task), null); });
                Future<Object> committed;
                List<Future<Res>> cancelled = new ArrayList<>();
                if (order.equals("CANCEL_FIRST")) {
                    start.countDown();
                    cancelled.add(pool.submit(cancels.get(0)));
                    cancelled.getFirst().get(30, TimeUnit.SECONDS);
                    committed = pool.submit(commit);
                    committed.get(30, TimeUnit.SECONDS);
                    cancelled.add(pool.submit(cancels.get(1)));
                    cancelled.add(pool.submit(cancels.get(2)));
                } else if (order.equals("COMMIT_FIRST")) {
                    start.countDown();
                    committed = pool.submit(commit);
                    committed.get(30, TimeUnit.SECONDS);
                    for (var cancel : cancels) cancelled.add(pool.submit(cancel));
                } else {
                    committed = pool.submit(commit);
                    for (var cancel : cancels) cancelled.add(pool.submit(cancel));
                    start.countDown();
                }
                outcomes.put("commit", committed.get(30, TimeUnit.SECONDS));
                var statuses = new ArrayList<String>();
                for (var future : cancelled) {
                    Res r = future.get(30, TimeUnit.SECONDS);
                    assertThat(r.status()).as("cancel never errors: %s", r.body()).isEqualTo(200);
                    JsonNode view = r.json().has("task") ? r.json().path("task") : r.json();
                    statuses.add(text(view.path("status")) + "/" + text(view.path("failureCode")));
                }
                outcomes.put("cancelResponses", statuses);
            }
            String status = status(task);
            String versionStatus = versionStatus(candidate);
            int failedEvents = count("SELECT count(*) FROM task_events WHERE task_id=? AND type='TASK_FAILED'", task);
            int candidateBuilds = count("SELECT count(*) FROM builds WHERE version_id=?", candidate);
            if (status.equals("READY")) {
                commitWins++;
                assertThat(outcomes.get("commit")).isEqualTo("READY");
                assertThat(versionStatus).isEqualTo("VERIFIED");
                assertThat(latest(app)).isEqualTo(candidate);
                assertThat(failedEvents).isZero();
                assertThat(candidateBuilds).isEqualTo(1);
                assertThat((List<?>) outcomes.get("cancelResponses")).allMatch(s -> s.equals("READY/"));
                previous = candidate;
            } else {
                cancelWins++;
                assertThat(status).isEqualTo("FAILED");
                assertThat(failureCode(task)).isEqualTo("CANCELLED");
                assertThat((String) outcomes.get("commit")).startsWith("REJECTED:");
                assertThat(versionStatus).isEqualTo("FAILED");
                assertThat(snapshots.outcome(candidate, sourceDigest(candidate), "FAILED").report().path("failureCode").asText()).isEqualTo("CANCELLED");
                assertThat(latest(app)).as("cancel must not move the successful pointer").isEqualTo(previous);
                assertThat(versionStatus(previous)).isEqualTo("VERIFIED");
                assertThat(tree(ROOT.resolve("versions").resolve(previous.toString()))).isEqualTo(previousTree);
                assertThat(failedEvents).isEqualTo(1);
                assertThat(candidateBuilds).isZero();
                assertThat((List<?>) outcomes.get("cancelResponses")).allMatch(s -> s.equals("FAILED/CANCELLED"));
                // The stale worker retries its commit: refused, nothing moves.
                Object late;
                try {
                    late = runner.advance(queue, claim, new StageResult(TaskStatus.READY, "late", null), EventType.STAGE_COMPLETED).status().name();
                } catch (RuntimeException rejected) {
                    late = "REJECTED:" + rejected.getMessage();
                }
                assertThat((String) late).startsWith("REJECTED:");
                assertThat(latest(app)).isEqualTo(previous);
                outcomes.put("lateCommit", late);
            }
            // The surviving successful version is still publishable right after the race.
            Res publish = http.post(aliceTab1, "/api/v0/publications", Map.of("applicationId", app.toString(), "versionId", previous.toString(),
                    "artifactDigest", artifactDigest(previous)), "d20a-t2-" + UUID.randomUUID());
            assertThat(publish.status()).as(publish.body()).isEqualTo(202);
            var row = new LinkedHashMap<String, Object>();
            row.put("round", round);
            row.put("kind", edit ? "EDIT" : "GENERATION");
            row.put("order", order);
            row.put("commitDelayMs", commitDelayMs);
            row.put("task", task);
            row.put("winner", status.equals("READY") ? "READY_COMMIT" : "CANCEL");
            row.put("taskStatus", status + "/" + failureCode(task));
            row.put("candidateVersion", Map.of("id", candidate, "status", versionStatus, "builds", candidateBuilds));
            row.put("latestAfter", latest(app));
            row.put("taskFailedEvents", failedEvents);
            row.putAll(outcomes);
            rounds.add(row);
        }
        processAll();
        assertThat(cancelWins).isPositive();
        assertThat(commitWins).isPositive();
        ConcurrencyHarness.evidence("D20-A-T2", Map.of("rounds", rounds, "cancelWins", cancelWins, "commitWins", commitWins,
                "cancellersPerRound", "owner tab 1, owner tab 2, administrator", "readyCommit", "AgentRunStore.complete (production)",
                "fixture", "stage runner and runner result are explicit fixtures; queue, lease, commit, convergence and HTTP are production"));
    }

    @Test @Order(3)
    void d20aT2CancellingQueuedOrRunningFollowUpsLeavesTheSuccessfulVersionUsable() throws Exception {
        UUID app = application(aliceTab2, "D20A follow-up cancel");
        UUID good = ready(aliceTab2, app, "D20A follow-up base");
        String goodDigest = artifactDigest(good);
        String goodTree = tree(ROOT.resolve("versions").resolve(good.toString()));
        var results = new ArrayList<Map<String, Object>>();
        // Each phase twice: still queued, and held by a production scheduler at the start of PLAN, GENERATE and VERIFY
        // (the DRAFT already exists at VERIFY). The cancel lands while the worker is inside that stage.
        List<TaskStatus> phases = List.of(TaskStatus.PLAN, TaskStatus.GENERATE, TaskStatus.VERIFY);
        for (int round = 0; round < 8; round++) {
            TaskStatus held = round % 4 == 0 ? null : phases.get(round % 4 - 1);
            Res accepted = http.post(aliceTab2, "/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "D20A follow-up " + round), null);
            UUID task = UUID.fromString(accepted.json().path("id").asText());
            UUID before = latest(app);
            var errors = new CopyOnWriteArrayList<Throwable>();
            Thread worker = null;
            ConcurrencyHarness.Hold hold = null;
            if (held != null) {
                hold = runner.hold(task, held);
                worker = ConcurrencyHarness.worker("d20a-followup", schedulers.get(round % 3), () -> isTerminal(task), errors);
                assertThat(hold.entered.await(30, TimeUnit.SECONDS)).as("worker reached %s", held).isTrue();
            }
            Res cancel = http.post(aliceTab2, "/api/v0/tasks/" + task + "/cancel", null, null);
            if (hold != null) hold.release.countDown();
            if (worker == null) worker = ConcurrencyHarness.worker("d20a-followup", schedulers.get(round % 3), () -> isTerminal(task), errors);
            worker.join(60_000);
            schedulers.get(round % 3).tick(); // a later tick never resumes a cancelled task
            assertThat(errors).isEmpty();
            assertThat(cancel.status()).isEqualTo(200);
            assertThat(cancel.json().path("status").asText()).isEqualTo("FAILED");
            assertThat(status(task) + "/" + failureCode(task)).isEqualTo("FAILED/CANCELLED");
            assertThat(latest(app)).isEqualTo(before);
            List<String> versions = jdbc.sql("SELECT status FROM application_versions WHERE source_task_id=?").param(task).query(String.class).list();
            assertThat(versions).isEqualTo(held == TaskStatus.VERIFY ? List.of("FAILED") : List.of());
            var executed = new LinkedHashMap<String, Integer>();
            for (TaskStatus stage : phases) executed.put(stage.name(), runner.executions(task, stage));
            // Nothing after the held stage ever starts once the cancel committed.
            int heldIndex = held == null ? -1 : phases.indexOf(held);
            for (int i = 0; i < phases.size(); i++)
                assertThat(executed.get(phases.get(i).name())).as("%s executions", phases.get(i)).isEqualTo(i <= heldIndex ? 1 : 0);
            assertThat(versionStatus(good)).isEqualTo("VERIFIED");
            assertThat(artifactDigest(good)).isEqualTo(goodDigest);
            assertThat(tree(ROOT.resolve("versions").resolve(good.toString()))).isEqualTo(goodTree);
            results.add(ConcurrencyHarness.ordered("round", round, "cancelledWhile", held == null ? "QUEUED" : "RUNNING " + held, "task", task,
                    "final", status(task) + "/" + failureCode(task), "cancelResponse", cancel.json().path("status").asText(),
                    "stagesExecuted", executed, "versionsFromTask", versions, "latestAfter", latest(app)));
        }
        ConcurrencyHarness.evidence("D20-A-T2-follow-ups", Map.of("rounds", results, "originalVersion", good,
                "originalStillVerifiedAndLatest", latest(app).equals(good), "originalDigestUnchanged", goodDigest, "originalTreeUnchanged", true));
    }

    // ---------------------------------------------------------------- D20-A-T3 two users

    @Test @Order(4)
    void d20aT3TwoUsersRacingWithIdenticalKeysShareNoData() throws Exception {
        String taskKey = "d20a-shared-task-key";
        String publicationKey = "d20a-shared-publication-key-0001";
        Map<Account, List<Session>> sessions = Map.of(alice, List.of(aliceTab1, aliceTab2), bob, List.of(bobTab));
        var apps = new ConcurrentHashMap<Account, List<UUID>>();
        var tasks = new ConcurrentHashMap<Account, Set<String>>();
        var bodies = new ConcurrentHashMap<Account, List<String>>();
        var start = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            var futures = new ArrayList<Future<?>>();
            for (Account user : List.of(alice, bob)) {
                futures.add(pool.submit(() -> {
                    start.await();
                    var mine = new ArrayList<UUID>();
                    var seen = new CopyOnWriteArrayList<String>();
                    for (int a = 0; a < 2; a++) mine.add(application(sessions.get(user).getFirst(), "D20A " + user.email() + " app " + a));
                    var ids = ConcurrentHashMap.<String>newKeySet();
                    for (UUID app : mine) {
                        var duplicates = parallel(4, i -> http.post(sessions.get(user).get(i % sessions.get(user).size()), "/api/v0/tasks",
                                Map.of("applicationId", app.toString(), "prompt", "D20A shared prompt"), taskKey));
                        for (Res r : duplicates) {
                            assertThat(r.status()).as(r.body()).isEqualTo(202);
                            ids.add(r.json().path("id").asText());
                            seen.add(r.body());
                        }
                        Res extra = http.post(sessions.get(user).getFirst(), "/api/v0/tasks",
                                Map.of("applicationId", app.toString(), "prompt", "D20A second task of " + user.email()), null);
                        ids.add(extra.json().path("id").asText());
                        seen.add(extra.body());
                    }
                    apps.put(user, mine);
                    tasks.put(user, ids);
                    bodies.put(user, seen);
                    return null;
                }));
            }
            start.countDown();
            for (var future : futures) future.get(120, TimeUnit.SECONDS);
        }
        runAll();
        assertThat(tasks.get(alice)).hasSize(4);
        assertThat(tasks.get(bob)).hasSize(4);
        assertThat(intersection(tasks.get(alice), tasks.get(bob))).isEmpty();
        // Every task must commit before its version is used; a failure names each task's own end state.
        var outcomes = new TreeMap<String, String>();
        Stream.of(alice, bob).flatMap(user -> tasks.get(user).stream())
                .forEach(task -> outcomes.put(task, status(UUID.fromString(task)) + "/" + failureCode(UUID.fromString(task))));
        assertThat(outcomes.values()).as("T3 tasks (status/failure code): %s", outcomes).allMatch("READY/"::equals);

        // Same publication key from both users at the same moment, three clicks each, then two worker instances.
        var publicationIds = new ConcurrentHashMap<Account, Set<String>>();
        var publicationStart = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newFixedThreadPool(8)) {
            var futures = new ArrayList<Future<?>>();
            for (Account user : List.of(alice, bob)) {
                UUID app = apps.get(user).getFirst();
                UUID version = latest(app);
                String digest = artifactDigest(version);
                for (int i = 0; i < 3; i++) {
                    Session session = sessions.get(user).get(i % sessions.get(user).size());
                    futures.add(pool.submit(() -> {
                        publicationStart.await();
                        Res r = http.post(session, "/api/v0/publications", Map.of("applicationId", app.toString(),
                                "versionId", version.toString(), "artifactDigest", digest), publicationKey);
                        assertThat(r.status()).as(r.body()).isEqualTo(202);
                        publicationIds.computeIfAbsent(user, k -> ConcurrentHashMap.newKeySet()).add(r.json().path("id").asText());
                        bodies.get(user).add(r.body());
                        return null;
                    }));
                }
            }
            publicationStart.countDown();
            for (var future : futures) future.get(60, TimeUnit.SECONDS);
        }
        assertThat(publicationIds.get(alice)).hasSize(1);
        assertThat(publicationIds.get(bob)).hasSize(1);
        assertThat(intersection(publicationIds.get(alice), publicationIds.get(bob))).isEmpty();
        processAll();

        var crossReads = new LinkedHashMap<String, Integer>();
        var isolation = new LinkedHashMap<String, Object>();
        for (Account user : List.of(alice, bob)) {
            Account other = user == alice ? bob : alice;
            Session session = sessions.get(user).getFirst();
            Set<String> foreign = identifiers(other, apps.get(other));
            for (String body : bodies.get(user))
                for (String id : foreign) assertThat(body).as("%s saw %s", user.email(), id).doesNotContain(id);
            for (UUID app : apps.get(user)) {
                for (String route : List.of("/api/v0/applications/" + app + "/versions?size=100", "/api/v0/applications/" + app + "/publications")) {
                    Res own = http.get(session, route);
                    assertThat(own.status()).isEqualTo(200);
                    for (String id : foreign) assertThat(own.body()).doesNotContain(id);
                    Res cross = http.get(sessions.get(other).getFirst(), route);
                    assertThat(cross.status()).isEqualTo(404);
                    crossReads.put(other.email() + " GET " + route.replace(app.toString(), "{" + user.email() + " app}"), cross.status());
                }
            }
            String publication = publicationIds.get(user).iterator().next();
            Res cross = http.get(sessions.get(other).getFirst(), "/api/v0/publications/" + publication + "/deployment");
            assertThat(cross.status()).isEqualTo(404);
            var served = HOSTING.served.get(ConcurrencyHarness.Hosting.location(UUID.fromString(publication)));
            assertThat(served).as("served location of %s", publication).isNotNull();
            String html = new String(served.get("index.html"), java.nio.charset.StandardCharsets.UTF_8);
            assertThat(html).contains("data-owner=\"" + user.id() + "\"").doesNotContain(other.id().toString());
            for (String task : tasks.get(user)) {
                UUID owner = jdbc.sql("SELECT a.owner_id FROM generation_tasks t JOIN applications a ON a.id=t.application_id WHERE t.id=?")
                        .param(UUID.fromString(task)).query(UUID.class).single();
                assertThat(owner).isEqualTo(user.id());
                UUID version = versionOf(UUID.fromString(task));
                assertThat(snapshots.readSource(version, sourceDigest(version), ConcurrencyHarness.PAGE))
                        .contains("data-owner=\"" + user.id() + "\"").doesNotContain(other.id().toString());
            }
            isolation.put(user.email(), Map.of("applications", apps.get(user), "tasks", tasks.get(user), "publication", publication,
                    "hostingCalls", HOSTING.calls(UUID.fromString(publication)), "hostedOwnerMarker", user.id()));
        }
        ConcurrencyHarness.evidence("D20-A-T3", Map.of("sameTaskKey", taskKey, "samePublicationKey", publicationKey,
                "users", isolation, "crossUserReads", crossReads, "responseBodiesScanned",
                bodies.values().stream().mapToInt(List::size).sum(), "foreignIdentifiersFound", 0,
                "schedulerInstances", schedulers.size(), "publicationWorkerInstances", 2));
    }

    // ---------------------------------------------------------------- D20-A-T1 one logical publication per request

    @Test @Order(5)
    void d20aT1EveryPublicationRequestIsOneLogicalPublicationHostedOnce() throws Exception {
        UUID app = application(aliceTab1, "D20A exactly once");
        UUID other = application(aliceTab1, "D20A exactly once other");
        UUID version = ready(aliceTab1, app, "D20A exactly once base");
        UUID otherVersion = ready(aliceTab1, other, "D20A exactly once other base");
        String digest = artifactDigest(version);
        String key = "d20a-t1-" + UUID.randomUUID();
        Map<String, Object> body = Map.of("applicationId", app.toString(), "versionId", version.toString(), "artifactDigest", digest);
        var clicks = parallel(12, i -> http.post(i % 2 == 0 ? aliceTab1 : aliceTab2, "/api/v0/publications", body, key));
        var ids = new HashSet<String>();
        clicks.forEach(r -> { assertThat(r.status()).as(r.body()).isEqualTo(202); ids.add(r.json().path("id").asText()); });
        assertThat(ids).hasSize(1);
        UUID id = UUID.fromString(ids.iterator().next());

        // Instance 1 is inside hosting; duplicates, competing workers on both instances and a worker tick arrive meanwhile.
        CountDownLatch inside = HOSTING.hold(Set.of(id));
        var during = new ArrayList<Object>();
        try (ExecutorService pool = Executors.newFixedThreadPool(10)) {
            Future<?> first = pool.submit(() -> publications.process(id));
            assertThat(inside.await(20, TimeUnit.SECONDS)).isTrue();
            var duplicates = parallel(6, i -> http.post(aliceTab2, "/api/v0/publications", body, key));
            var competitors = new ArrayList<Future<?>>();
            for (int i = 0; i < 4; i++) {
                PublicationService instance = i % 2 == 0 ? publications : secondInstance;
                competitors.add(pool.submit(() -> instance.process(id)));
            }
            competitors.add(pool.submit(() -> jdbc.sql("SELECT id FROM publications WHERE status='REQUESTED' ORDER BY created_at LIMIT 10")
                    .query(UUID.class).list().forEach(secondInstance::process)));
            for (var competitor : competitors) competitor.get(30, TimeUnit.SECONDS);
            for (Res r : duplicates) {
                assertThat(r.status()).isEqualTo(202);
                assertThat(r.json().path("id").asText()).isEqualTo(id.toString());
                during.add(r.json().path("status").asText());
            }
            assertThat(HOSTING.calls(id)).isEqualTo(1);
            HOSTING.open();
            first.get(30, TimeUnit.SECONDS);
        }
        assertThat(publicationStatus(id)).isEqualTo("PUBLISHED");
        for (int i = 0; i < 3; i++) { publications.process(id); secondInstance.process(id); }
        var replay = parallel(4, i -> http.post(aliceTab1, "/api/v0/publications", body, key));
        replay.forEach(r -> assertThat(r.json().path("status").asText()).isEqualTo("PUBLISHED"));
        assertThat(HOSTING.calls(id)).isEqualTo(1);
        assertThat(records.events(id).stream().map(DeploymentRecords.Event::phase).toList())
                .containsExactly("PREPARING", "PUBLISHING", "PROBING", "SUCCEEDED");

        // The same key for another application of the same owner is a conflict, while distinct keys race in.
        Res crossApp = http.post(aliceTab1, "/api/v0/publications", Map.of("applicationId", other.toString(),
                "versionId", otherVersion.toString(), "artifactDigest", artifactDigest(otherVersion)), key);
        assertThat(crossApp.status()).isEqualTo(409);
        assertThat(crossApp.json().path("code").asText()).isEqualTo("PUBLICATION_IDEMPOTENCY_CONFLICT");
        var keys = Stream.generate(() -> "d20a-t1-" + UUID.randomUUID()).limit(5).toList();
        var distinct = parallel(10, i -> http.post(i % 2 == 0 ? aliceTab1 : aliceTab2, "/api/v0/publications", body, keys.get(i / 2)));
        var distinctIds = new LinkedHashMap<String, String>();
        for (int i = 0; i < distinct.size(); i++) {
            assertThat(distinct.get(i).status()).isEqualTo(202);
            String previous = distinctIds.putIfAbsent(keys.get(i / 2), distinct.get(i).json().path("id").asText());
            if (previous != null) assertThat(distinct.get(i).json().path("id").asText()).isEqualTo(previous);
        }
        assertThat(new HashSet<>(distinctIds.values())).hasSize(5);
        try (ExecutorService pool = Executors.newFixedThreadPool(6)) {
            var workers = new ArrayList<Future<?>>();
            for (int w = 0; w < 6; w++) {
                PublicationService instance = w % 2 == 0 ? publications : secondInstance;
                workers.add(pool.submit(() -> jdbc.sql("SELECT id FROM publications WHERE status='REQUESTED' ORDER BY created_at LIMIT 10")
                        .query(UUID.class).list().forEach(instance::process)));
            }
            for (var worker : workers) worker.get(60, TimeUnit.SECONDS);
        }
        for (String each : distinctIds.values()) {
            assertThat(HOSTING.calls(UUID.fromString(each))).isEqualTo(1);
            assertThat(publicationStatus(UUID.fromString(each))).isEqualTo("PUBLISHED");
        }

        // A failed attempt is one logical publication too: replaying its key returns it and never hosts again.
        HOSTING.mode = "UNAVAILABLE";
        String failedKey = "d20a-t1-" + UUID.randomUUID();
        UUID failed = UUID.fromString(http.post(aliceTab1, "/api/v0/publications", body, failedKey).json().path("id").asText());
        publications.process(failed);
        secondInstance.process(failed);
        HOSTING.mode = "PASS";
        Res failedReplay = http.post(aliceTab2, "/api/v0/publications", body, failedKey);
        assertThat(failedReplay.json().path("id").asText()).isEqualTo(failed.toString());
        assertThat(failedReplay.json().path("status").asText()).isEqualTo("FAILED");
        publications.process(failed);
        assertThat(HOSTING.calls(failed)).isEqualTo(1);
        String retryKey = "d20a-t1-" + UUID.randomUUID();
        UUID retry = UUID.fromString(http.post(aliceTab1, "/api/v0/publications", body, retryKey).json().path("id").asText());
        publications.process(retry);
        assertThat(publicationStatus(retry)).isEqualTo("PUBLISHED");
        Res listing = http.get(aliceTab1, "/api/v0/applications/" + app + "/publications");
        int rows = count("SELECT count(*) FROM publications WHERE application_id=?", app);
        assertThat(rows).isEqualTo(1 + 5 + 2);

        ConcurrencyHarness.evidence("D20-A-T1", Map.of(
                "firstKey", Map.of("clicks", 12, "duplicatesWhileHosting", 6, "duplicateStatusesWhileHosting", during,
                        "competingProcessCalls", 4, "workerTicks", 1, "replaysAfter", 4, "logicalIds", ids, "hostingCalls", HOSTING.calls(id),
                        "ledger", records.events(id).stream().map(DeploymentRecords.Event::phase).toList()),
                "sameKeyOtherApplication", Map.of("status", crossApp.status(), "code", "PUBLICATION_IDEMPOTENCY_CONFLICT"),
                "distinctKeys", Map.of("keys", 5, "requests", 10, "workers", 6, "instances", 2, "hostingCallsEach", 1),
                "failedAttempt", Map.of("id", failed, "replayStatus", "FAILED", "hostingCalls", HOSTING.calls(failed)),
                "explicitRetryNewKey", Map.of("id", retry, "status", publicationStatus(retry)),
                "publicationRowsForApplication", rows, "latestSuccessful", listing.json().path("latestSuccessful").path("id").asText(),
                "hosting", "explicit fixture, not public hosting"));
    }

    // ---------------------------------------------------------------- D20-A-02 / T4 publishing an old version

    @Test @Order(6)
    void d20aT4PublishingAnOldVersionDuringEditsKeepsItsFixedHash() throws Exception {
        UUID app = application(aliceTab1, "D20A fixed hash");
        UUID v1 = ready(aliceTab1, app, "D20A fixed hash v1");
        String v1Digest = artifactDigest(v1), v1Source = sourceDigest(v1);
        String v1Tree = tree(ROOT.resolve("versions").resolve(v1.toString()));
        UUID edit1 = editTask(aliceTab1, app, v1, "D20A fixed hash edit 1");
        var claim1 = standAtReadyCommit(edit1);
        UUID v2 = UUID.fromString(runner.drafts.get(edit1).path("versionId").asText());

        // Old-version publish clicks, the edit's READY commit and stale-digest requests all start together.
        var start = new CountDownLatch(1);
        var v1Publications = new CopyOnWriteArrayList<UUID>();
        Map<String, Integer> stale = new ConcurrentHashMap<>();
        try (ExecutorService pool = Executors.newFixedThreadPool(8)) {
            var futures = new ArrayList<Future<?>>();
            for (int i = 0; i < 4; i++) {
                Session session = i % 2 == 0 ? aliceTab1 : aliceTab2;
                futures.add(pool.submit(() -> {
                    start.await();
                    Res r = http.post(session, "/api/v0/publications", Map.of("applicationId", app.toString(), "versionId", v1.toString(),
                            "artifactDigest", v1Digest), "d20a-t4-" + UUID.randomUUID());
                    assertThat(r.status()).as(r.body()).isEqualTo(202);
                    v1Publications.add(UUID.fromString(r.json().path("id").asText()));
                    return null;
                }));
            }
            futures.add(pool.submit(() -> {
                start.await();
                return runner.advance(queue, claim1, new StageResult(TaskStatus.READY, "edit 1", null), EventType.STAGE_COMPLETED);
            }));
            futures.add(pool.submit(() -> {
                start.await();
                Res r = http.post(aliceTab2, "/api/v0/publications", Map.of("applicationId", app.toString(), "versionId", v1.toString(),
                        "artifactDigest", "sha256:" + "0".repeat(64)), "d20a-t4-stale-" + UUID.randomUUID());
                stale.put("v1WithForeignDigest", r.status());
                return null;
            }));
            start.countDown();
            for (var future : futures) future.get(60, TimeUnit.SECONDS);
        }
        assertThat(latest(app)).isEqualTo(v2);
        String v2Digest = artifactDigest(v2);
        Res v1WithV2Digest = http.post(aliceTab1, "/api/v0/publications", Map.of("applicationId", app.toString(), "versionId", v1.toString(),
                "artifactDigest", v2Digest), "d20a-t4-stale-" + UUID.randomUUID());
        stale.put("v1WithV2Digest", v1WithV2Digest.status());
        assertThat(v1WithV2Digest.json().path("code").asText()).isEqualTo("PUBLICATION_ARTIFACT_MISMATCH");
        assertThat(stale).containsOnlyKeys("v1WithForeignDigest", "v1WithV2Digest").allSatisfy((k, v) -> assertThat(v).isEqualTo(409));

        // Workers on both instances hold inside hosting while a second edit commits and restores flip the pointer.
        CountDownLatch inside = HOSTING.hold(Set.copyOf(v1Publications));
        var pointer = new ArrayList<UUID>();
        UUID v3;
        UUID v2Publication;
        try (ExecutorService pool = Executors.newFixedThreadPool(4)) {
            var workers = new ArrayList<Future<?>>();
            for (int i = 0; i < 4; i++) {
                UUID publication = v1Publications.get(i);
                PublicationService instance = i % 2 == 0 ? publications : secondInstance;
                workers.add(pool.submit(() -> instance.process(publication)));
            }
            assertThat(inside.await(30, TimeUnit.SECONDS)).isTrue();
            UUID edit2 = editTask(aliceTab2, app, v2, "D20A fixed hash edit 2");
            var claim2 = standAtReadyCommit(edit2);
            v3 = UUID.fromString(runner.drafts.get(edit2).path("versionId").asText());
            runner.advance(queue, claim2, new StageResult(TaskStatus.READY, "edit 2", null), EventType.STAGE_COMPLETED);
            pointer.add(latest(app));
            assertThat(restore(app, v1, v3).status()).isEqualTo(200);
            pointer.add(latest(app));
            v2Publication = UUID.fromString(http.post(aliceTab1, "/api/v0/publications", Map.of("applicationId", app.toString(),
                    "versionId", v2.toString(), "artifactDigest", v2Digest), "d20a-t4-v2-" + UUID.randomUUID()).json().path("id").asText());
            assertThat(restore(app, v3, v1).status()).isEqualTo(200);
            pointer.add(latest(app));
            HOSTING.open();
            for (var worker : workers) worker.get(60, TimeUnit.SECONDS);
        }
        publications.process(v2Publication);
        assertThat(pointer).containsExactly(v3, v1, v3);
        assertThat(Set.of(v1Digest, v2Digest, artifactDigest(v3))).hasSize(3);

        var bound = new ArrayList<Map<String, Object>>();
        for (UUID publication : v1Publications) {
            assertThat(publicationStatus(publication)).isEqualTo("PUBLISHED");
            var payload = HOSTING.payloads.get(publication);
            String location = ConcurrencyHarness.Hosting.location(publication);
            assertThat(jdbc.sql("SELECT url FROM publications WHERE id=?").param(publication).query(String.class).single()).isEqualTo(location);
            var served = HOSTING.served.get(location);
            assertThat(served).as("served location of %s", publication).isNotNull();
            assertThat(payload.versionId()).isEqualTo(v1);
            assertThat(payload.artifactDigest()).isEqualTo(v1Digest);
            assertThat(ConcurrencyHarness.manifestDigest(served)).isEqualTo(v1Digest);
            Res deployment = http.get(aliceTab1, "/api/v0/publications/" + publication + "/deployment");
            assertThat(deployment.json().path("artifactDigest").asText()).isEqualTo(v1Digest);
            assertThat(deployment.json().path("sourceDigest").asText()).isEqualTo(v1Source);
            assertThat(deployment.json().path("phase").asText()).isEqualTo("SUCCEEDED");
            bound.add(Map.of("publication", publication, "version", payload.versionId(), "boundDigest", payload.artifactDigest(),
                    "servedBytesDigest", ConcurrencyHarness.manifestDigest(served), "phase", "SUCCEEDED"));
        }
        assertThat(HOSTING.payloads.get(v2Publication).artifactDigest()).isEqualTo(v2Digest);
        assertThat(tree(ROOT.resolve("versions").resolve(v1.toString()))).isEqualTo(v1Tree);
        Res snapshot = http.get(aliceTab1, "/api/v0/versions/" + v1 + "/snapshot");
        assertThat(snapshot.json().path("validation").path("artifactDigest").asText()).isEqualTo(v1Digest);

        ConcurrencyHarness.evidence("D20-A-T4", Map.of("oldVersion", Map.of("id", v1, "artifactDigest", v1Digest, "sourceDigest", v1Source),
                "concurrentChanges", Map.of("edit1ReadyCommit", v2, "edit2ReadyCommit", v3, "pointerDuringHosting", pointer),
                "versionDigests", Map.of("v1", v1Digest, "v2", v2Digest, "v3", artifactDigest(v3)),
                "oldVersionPublications", bound, "newerVersionPublication", Map.of("id", v2Publication, "digest", v2Digest),
                "staleDigestRequests", stale, "oldVersionTreeUnchanged", true, "workersHeldInsideHosting", 4, "instances", 2));
    }

    // ---------------------------------------------------------------- D20-A-04 owner reads are one snapshot

    @Test @Order(7)
    void d20a04VersionListIsOneSnapshotWhileVersionsCommit() throws Exception {
        UUID app = application(aliceTab1, "D20A version list snapshot");
        UUID v1 = ready(aliceTab1, app, "D20A list base");
        Res created = http.post(aliceTab1, "/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "D20A list candidate"), null);
        UUID task = UUID.fromString(created.json().path("id").asText());
        var claim = standAtReadyCommit(task);
        UUID candidate = UUID.fromString(runner.drafts.get(task).path("versionId").asText());

        // 1) The READY commit lands after the page of versions was read and before the latest pointer is read.
        JsonNode readyRace = gatedRead(aliceTab1, "/api/v0/applications/" + app + "/versions?size=100", "ORDER BY number DESC LIMIT", StatementGate.When.AFTER,
                () -> runner.advance(queue, claim, new StageResult(TaskStatus.READY, "gated", null), EventType.STAGE_COMPLETED));
        String latestInResponse = readyRace.path("latestReadyVersionId").asText();
        JsonNode latestItem = item(readyRace.path("items"), latestInResponse);
        // 2) A new DRAFT lands after the page was read and before the total is counted.
        Res next = http.post(aliceTab1, "/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "D20A list draft"), null);
        UUID nextTask = UUID.fromString(next.json().path("id").asText());
        var nextClaim = queue.claim(Duration.ofSeconds(60)).orElseThrow();
        assertThat(nextClaim.taskId()).isEqualTo(nextTask);
        runner.advance(queue, nextClaim, runner.execute(nextClaim, TaskStatus.PLAN), EventType.STAGE_STARTED);
        JsonNode draftRace = gatedRead(aliceTab1, "/api/v0/applications/" + app + "/versions?size=100", "ORDER BY number DESC LIMIT", StatementGate.When.AFTER,
                () -> runner.generate(nextClaim));
        queue.cancel(alice.id(), nextTask);

        var evidence = new LinkedHashMap<String, Object>();
        evidence.put("readyCommitBetweenStatements", Map.of("latestReadyVersionId", latestInResponse,
                "statusOfThatVersionInSameResponse", latestItem == null ? "ABSENT" : latestItem.path("status").asText(),
                "items", statuses(readyRace.path("items")), "total", readyRace.path("total").asInt()));
        evidence.put("draftInsertBetweenStatements", Map.of("items", draftRace.path("items").size(), "total", draftRace.path("total").asInt()));
        evidence.put("committed", Map.of("previous", v1, "candidate", candidate, "latestAfter", latest(app)));
        ConcurrencyHarness.evidence("D20-A-04-version-list-snapshot", evidence);
        assertThat(latestItem).as("latest pointer must be a version listed in the same response").isNotNull();
        assertThat(latestItem.path("status").asText()).as("latest pointer shown as %s in the same response", latestItem.path("status").asText())
                .isEqualTo("VERIFIED");
        assertThat(readyRace.path("total").asInt()).isEqualTo(readyRace.path("items").size());
        assertThat(draftRace.path("total").asInt()).as("total and page from one snapshot").isEqualTo(draftRace.path("items").size());
    }

    @Test @Order(8)
    void d20a04PublicationListAndDeploymentAreOneSnapshotWhileAWorkerCommits() throws Exception {
        UUID app = application(aliceTab2, "D20A publication snapshot");
        UUID version = ready(aliceTab2, app, "D20A publication snapshot base");
        Map<String, Object> body = Map.of("applicationId", app.toString(), "versionId", version.toString(), "artifactDigest", artifactDigest(version));
        UUID first = UUID.fromString(http.post(aliceTab2, "/api/v0/publications", body, "d20a-04-" + UUID.randomUUID()).json().path("id").asText());
        // The worker commits PUBLISHED after the rows were read and before latestSuccessful is read.
        JsonNode list = gatedRead(aliceTab1, "/api/v0/applications/" + app + "/publications", "status='PUBLISHED' ORDER BY published_at DESC",
                StatementGate.When.BEFORE, () -> { publications.process(first); return null; });
        JsonNode listed = item(list.path("items"), first.toString());
        UUID second = UUID.fromString(http.post(aliceTab2, "/api/v0/publications", body, "d20a-04-" + UUID.randomUUID()).json().path("id").asText());
        JsonNode deployment = gatedRead(aliceTab1, "/api/v0/publications/" + second + "/deployment", "status='PUBLISHED' ORDER BY published_at DESC",
                StatementGate.When.BEFORE, () -> { secondInstance.process(second); return null; });

        var evidence = new LinkedHashMap<String, Object>();
        evidence.put("listWhileWorkerCommits", Map.of("itemStatus", listed.path("status").asText(),
                "latestSuccessful", list.path("latestSuccessful").isNull() ? "null" : list.path("latestSuccessful").path("id").asText(), "publication", first));
        evidence.put("deploymentWhileWorkerCommits", Map.of("publicationStatus", deployment.path("publication").path("status").asText(),
                "phase", deployment.path("phase").asText(), "latestSuccessful", deployment.path("latestSuccessful").isNull() ? "null"
                        : deployment.path("latestSuccessful").path("id").asText(), "publication", second));
        evidence.put("committedAfter", Map.of("first", publicationStatus(first), "second", publicationStatus(second)));
        ConcurrencyHarness.evidence("D20-A-04-publication-snapshot", evidence);
        boolean listSaysPublished = list.path("latestSuccessful").path("id").asText().equals(first.toString());
        assertThat(listed.path("status").asText()).as("same response lists the publication as %s but latestSuccessful=%s",
                listed.path("status").asText(), listSaysPublished).isEqualTo(listSaysPublished ? "PUBLISHED" : "REQUESTED");
        boolean deploymentSaysPublished = deployment.path("latestSuccessful").path("id").asText().equals(second.toString());
        assertThat(deployment.path("publication").path("status").asText()).isEqualTo(deploymentSaysPublished ? "PUBLISHED" : "REQUESTED");
    }

    // ---------------------------------------------------------------- D20-A-03 negative control

    @Test @Order(9)
    void d20a03AuditRejectsInjectedInconsistencies() throws Exception {
        UUID app = application(aliceTab1, "D20A audit negative control");
        quarantined.add(app);
        UUID version = ready(aliceTab1, app, "D20A audit control base");
        Map<String, Object> body = Map.of("applicationId", app.toString(), "versionId", version.toString(), "artifactDigest", artifactDigest(version));
        UUID hosted = UUID.fromString(http.post(aliceTab1, "/api/v0/publications", body, "d20a-03-" + UUID.randomUUID()).json().path("id").asText());
        publications.process(hosted);
        UUID vanished = UUID.fromString(http.post(aliceTab1, "/api/v0/publications", body, "d20a-03-" + UUID.randomUUID()).json().path("id").asText());
        publications.process(vanished);
        UUID pending = UUID.fromString(http.post(aliceTab1, "/api/v0/publications", body, "d20a-03-" + UUID.randomUUID()).json().path("id").asText());
        UUID readyTask = jdbc.sql("SELECT source_task_id FROM application_versions WHERE id=?").param(version).query(UUID.class).single();
        // Whatever other applications already carry (nothing in a passing run) must be all that is left once the control
        // application is excluded; an earlier test's leftover then fails that test's own audit, not this control.
        var baseline = ConsistencyAudit.run(jdbc, transactions, snapshots, records, HOSTING, Set.of(app)).violations();
        // E1: a gap in the event sequence.
        jdbc.sql("INSERT INTO task_events(id,task_id,sequence,type,stage,message) SELECT ?,id,event_sequence+2,'TOOL_RESULT','READY','injected' FROM generation_tasks WHERE id=?")
                .params(UUID.randomUUID(), readyTask).update();
        jdbc.sql("UPDATE generation_tasks SET event_sequence=event_sequence+2 WHERE id=?").param(readyTask).update();
        // V3: a FAILED task whose DRAFT bypassed convergence.
        UUID failing = UUID.fromString(http.post(aliceTab1, "/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "D20A injected"), null)
                .json().path("id").asText());
        var claim = queue.claim(Duration.ofSeconds(60)).orElseThrow();
        assertThat(claim.taskId()).isEqualTo(failing);
        runner.advance(queue, claim, runner.execute(claim, TaskStatus.PLAN), EventType.STAGE_STARTED);
        runner.generate(claim);
        jdbc.sql("UPDATE generation_tasks SET status='FAILED',failure_code='INJECTED',queue_state='FINISHED',lease_token=NULL,lease_expires_at=NULL,event_sequence=event_sequence+1 WHERE id=?")
                .param(failing).update();
        jdbc.sql("INSERT INTO task_events(id,task_id,sequence,type,stage,message) SELECT ?,id,event_sequence,'TASK_FAILED','FAILED','injected' FROM generation_tasks WHERE id=?")
                .params(UUID.randomUUID(), failing).update();
        // P2/P3: the ledger claims success that SQL never committed and hosting never saw.
        var ledger = new DeploymentRecords(ROOT.resolve("deployments"));
        for (String phase : List.of("PUBLISHING", "PROBING", "SUCCEEDED")) ledger.append(pending, phase, null);
        // P4: one location now serves bytes that are not the frozen artifact, another serves nothing at all. Only the
        // served map changes; the request payloads that once reached the gateway stay exactly as they were.
        String hostedAt = ConcurrencyHarness.Hosting.location(hosted), vanishedAt = ConcurrencyHarness.Hosting.location(vanished);
        var original = HOSTING.served.get(hostedAt);
        var tampered = new LinkedHashMap<>(original);
        tampered.put("assets/app.js", "tampered".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        HOSTING.served.put(hostedAt, tampered);
        var removed = HOSTING.served.remove(vanishedAt);

        var report = ConsistencyAudit.run(jdbc, transactions, snapshots, records, HOSTING, Set.of());
        var clean = ConsistencyAudit.run(jdbc, transactions, snapshots, records, HOSTING, Set.of(app));
        HOSTING.served.put(hostedAt, original);
        HOSTING.served.put(vanishedAt, removed);
        var expected = List.of(List.of("E1", "task " + readyTask), List.of("V3", failing.toString()), List.of("P2", "publication " + pending),
                List.of("P3", "publication " + pending), List.of("P4", "publication " + hosted), List.of("P4", "publication " + vanished));
        ConcurrencyHarness.evidence("D20-A-03-negative-control", Map.of("injected", expected, "violations", report.violations(),
                "violationsWithControlApplicationExcluded", clean.violations(), "violationsBeforeInjection", baseline));
        expected.forEach(pair -> assertThat(report.violations())
                .as("audit must report %s for %s", pair.get(0), pair.get(1)).anyMatch(v -> v.startsWith(pair.get(0)) && v.contains(pair.get(1))));
        assertThat(clean.violations()).as("outside the control application").containsExactlyInAnyOrderElementsOf(baseline);
    }

    // ---------------------------------------------------------------- D20-A-04 freezes that outlast the lease (D20-B review)

    /**
     * The D20-B review run: on a slow volume the READY commit's VERIFIED freeze outlasted the 3 s lease. The heartbeat
     * renews with an UPDATE of the row the commit holds, so it waited; the commit then failed its own lease check and
     * rolled back behind the frozen outcome, and expiry recovery failed the version (SQL FAILED, store VERIFIED). Here
     * the freeze is paused until the committed lease has visibly run out and a second instance has tried to recover
     * the task; the commit must still land exactly once and leave SQL and the store agreeing.
     */
    @Test @Order(10)
    void d20a04ReadyCommitWhoseFreezeOutlastsTheLeaseCommitsOnce() throws Exception {
        UUID app = application(aliceTab1, "D20A slow READY commit");
        UUID task = submit(aliceTab1, app, "D20A slow READY commit");
        var pause = STORE.hold(call -> {
            JsonNode draft = runner.drafts.get(task);
            return "freezeOutcome".equals(call.method()) && "VERIFIED".equals(call.status()) && draft != null
                    && call.version().toString().equals(draft.path("versionId").asText());
        });
        var observed = new LinkedHashMap<String, Object>();
        try (ExecutorService pool = Executors.newSingleThreadExecutor()) {
            Future<?> tick = pool.submit(() -> {
                schedulers.get(0).tick();
                return null;
            });
            try {
                assertThat(pause.entered.await(60, TimeUnit.SECONDS)).as("READY commit reached its outcome freeze").isTrue();
                // The commit holds the task row, so the heartbeat cannot renew it: the committed lease runs out.
                observed.put("leaseExpiredWhileFreezeHeld", waitUntil(() -> leaseExpired(task), 15_000));
                schedulers.get(1).tick(); // a second instance's expiry recovery skips the row the commit holds
                observed.put("committedStateDuringFreeze", status(task) + "/" + failureCode(task));
            } finally {
                pause.release.countDown();
            }
            tick.get(60, TimeUnit.SECONDS);
        }
        schedulers.get(1).tick(); // and once the commit is in, there is nothing left to recover
        UUID version = UUID.fromString(runner.drafts.get(task).path("versionId").asText());
        observed.put("final", status(task) + "/" + failureCode(task));
        observed.put("versionStatus", versionStatus(version));
        observed.put("verifiedOutcomeReadable", readable(version, "VERIFIED"));
        observed.put("latestIsThisVersion", version.equals(latest(app)));
        observed.put("verifyExecutions", runner.executions(task, TaskStatus.VERIFY));
        ConcurrencyHarness.evidence("D20-A-04-ready-commit-outlasting-lease", ConcurrencyHarness.ordered("task", task, "version", version,
                "leaseMs", 3000, "observed", observed, "fixture", "stage runner fixture; scheduler, lease, READY commit, store and recovery are production"));
        assertThat(observed.get("leaseExpiredWhileFreezeHeld")).as("the lease ran out while the commit held the row").isEqualTo(true);
        assertThat(observed.get("committedStateDuringFreeze")).isEqualTo("VERIFY/");
        assertThat(observed.get("final")).as("observed %s", observed).isEqualTo("READY/");
        assertThat(observed.get("versionStatus")).isEqualTo("VERIFIED");
        assertThat(observed.get("verifiedOutcomeReadable")).isEqualTo(true);
        assertThat(observed.get("latestIsThisVersion")).isEqualTo(true);
        assertThat(observed.get("verifyExecutions")).isEqualTo(1);
    }

    /**
     * The same starvation one stage earlier: the draft froze its source while holding the task row, so a slow freeze
     * let the lease run out and the draft's own lease check then refused a live worker (FAILED/INTERRUPTED instead of
     * READY). The source freeze is paused past the lease that was current when it began and past a recovery attempt
     * by a second instance; the heartbeat must keep the lease alive meanwhile.
     */
    @Test @Order(11)
    void d20a04DraftWhoseSourceFreezeOutlastsTheLeaseKeepsTheLiveWorkersTask() throws Exception {
        UUID app = application(aliceTab1, "D20A slow draft");
        UUID task = submit(aliceTab1, app, "D20A slow draft");
        var pause = STORE.hold(call -> "freezeSource".equals(call.method()) && call.input().toString().contains(task.toString()));
        var observed = new LinkedHashMap<String, Object>();
        try (ExecutorService pool = Executors.newSingleThreadExecutor()) {
            Future<?> tick = pool.submit(() -> {
                schedulers.get(0).tick();
                return null;
            });
            try {
                assertThat(pause.entered.await(60, TimeUnit.SECONDS)).as("draft reached its source freeze").isTrue();
                long leaseAtFreeze = leaseExpiryMillis(task);
                observed.put("heldPastTheLeaseAtFreeze", waitUntil(() -> dbMillis() > leaseAtFreeze + 1000, 15_000));
                schedulers.get(1).tick(); // a second instance's expiry recovery
                observed.put("committedStateDuringFreeze", status(task) + "/" + failureCode(task));
                observed.put("leaseRenewedDuringFreeze", leaseExpiryMillis(task) > leaseAtFreeze);
            } finally {
                pause.release.countDown();
            }
            tick.get(60, TimeUnit.SECONDS);
        }
        schedulers.get(1).tick();
        observed.put("final", status(task) + "/" + failureCode(task));
        observed.put("generateExecutions", runner.executions(task, TaskStatus.GENERATE));
        observed.put("versionsFromTask", count("SELECT count(*) FROM application_versions WHERE source_task_id=?", task));
        ConcurrencyHarness.evidence("D20-A-04-draft-freeze-outlasting-lease", ConcurrencyHarness.ordered("task", task, "leaseMs", 3000,
                "observed", observed, "fixture", "stage runner fixture; scheduler, heartbeat, lease, draft commit, store and recovery are production"));
        assertThat(observed.get("heldPastTheLeaseAtFreeze")).isEqualTo(true);
        assertThat(observed.get("committedStateDuringFreeze")).isEqualTo("GENERATE/");
        assertThat(observed.get("leaseRenewedDuringFreeze")).as("observed %s", observed).isEqualTo(true);
        assertThat(observed.get("final")).as("observed %s", observed).isEqualTo("READY/");
        assertThat(observed.get("generateExecutions")).isEqualTo(1);
        assertThat(observed.get("versionsFromTask")).isEqualTo(1);
    }

    // ---------------------------------------------------------------- helpers

    private Account account(String label) {
        UUID id = UUID.randomUUID();
        String email = "d20a-" + label + "-" + id.toString().substring(0, 8) + "@d20a.test";
        String password = "D20A-" + label + "-" + UUID.randomUUID();
        repository.createUser(id, email, "D20A " + label);
        jdbc.sql("INSERT INTO auth_credentials(user_id, password_hash, role) VALUES (?, ?, 'USER')").params(id, encoder.encode(password)).update();
        return new Account(id, email, password);
    }

    private UUID application(Session session, String name) throws Exception {
        Res created = http.post(session, "/api/v0/applications", Map.of("name", name, "dataMode", "LOCAL_STORAGE"), null);
        assertThat(created.status()).as(created.body()).isEqualTo(201);
        return UUID.fromString(created.json().path("id").asText());
    }

    /** Submits a generation over HTTP and runs it to READY on a production scheduler; returns the new latest version. */
    private UUID ready(Session session, UUID app, String prompt) throws Exception {
        Res created = http.post(session, "/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", prompt), null);
        assertThat(created.status()).as(created.body()).isEqualTo(202);
        UUID task = UUID.fromString(created.json().path("id").asText());
        schedulers.getFirst().tick();
        assertThat(status(task)).isEqualTo("READY");
        return latest(app);
    }

    /** Submits a generation over HTTP and leaves it queued. */
    private UUID submit(Session session, UUID app, String prompt) throws Exception {
        Res created = http.post(session, "/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", prompt), null);
        assertThat(created.status()).as(created.body()).isEqualTo(202);
        return UUID.fromString(created.json().path("id").asText());
    }

    /** Whether the committed lease of {@code task} has run out, as any other connection sees it. */
    private boolean leaseExpired(UUID task) {
        return jdbc.sql("SELECT coalesce(lease_expires_at <= clock_timestamp(), false) FROM generation_tasks WHERE id=?")
                .param(task).query(Boolean.class).single();
    }

    private long leaseExpiryMillis(UUID task) {
        return jdbc.sql("SELECT (extract(epoch FROM lease_expires_at) * 1000)::bigint FROM generation_tasks WHERE id=?")
                .param(task).query(Long.class).single();
    }

    private long dbMillis() {
        return jdbc.sql("SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint").query(Long.class).single();
    }

    private static boolean waitUntil(java.util.function.BooleanSupplier condition, long millis) throws InterruptedException {
        long until = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(millis);
        while (System.nanoTime() < until) {
            if (condition.getAsBoolean()) return true;
            Thread.sleep(50);
        }
        return condition.getAsBoolean();
    }

    private boolean readable(UUID version, String status) {
        try {
            snapshots.outcome(version, sourceDigest(version), status);
            return true;
        } catch (RuntimeException absentOrOther) {
            return false;
        }
    }

    private UUID editTask(Session session, UUID app, UUID base, String prompt) throws Exception {
        Res accepted = http.post(session, "/api/v0/applications/" + app + "/edits",
                Map.of("baseVersionId", base.toString(), "prompt", prompt, "source", Map.of("type", "CHAT")), null);
        assertThat(accepted.status()).as(accepted.body()).isEqualTo(202);
        return UUID.fromString(accepted.json().path("task").path("id").asText());
    }

    /** Claims {@code task} and runs PLAN, GENERATE and VERIFY, stopping right before the READY commit. */
    private TaskQueueService.Claim standAtReadyCommit(UUID task) {
        var claim = queue.claim(Duration.ofSeconds(60)).orElseThrow();
        assertThat(claim.taskId()).isEqualTo(task);
        TaskStatus stage = TaskStatus.PLAN;
        while (true) {
            StageResult result = runner.execute(claim, stage);
            assertThat(result.next()).as("fixture stage %s: %s", stage, result.failureCode()).isNotEqualTo(TaskStatus.FAILED);
            if (result.next() == TaskStatus.READY) return claim;
            stage = runner.advance(queue, claim, result, EventType.STAGE_STARTED).status();
        }
    }

    /** Runs every queued task on three production schedulers at once until the queue is empty. */
    private void runAll() throws Exception {
        var errors = new CopyOnWriteArrayList<Throwable>();
        var threads = new ArrayList<Thread>();
        for (int i = 0; i < schedulers.size(); i++)
            threads.add(ConcurrencyHarness.worker("d20a-scheduler-" + i, schedulers.get(i), () -> queuedOrRunning() == 0, errors));
        for (Thread thread : threads) thread.join(120_000);
        assertThat(errors).isEmpty();
        assertThat(queuedOrRunning()).isZero();
    }

    private void processAll() {
        for (UUID id : jdbc.sql("SELECT id FROM publications WHERE status='REQUESTED' ORDER BY created_at").query(UUID.class).list())
            publications.process(id);
    }

    /** Issues a GET that pauses at the armed statement, runs {@code between} while it waits, then returns its body. */
    private JsonNode gatedRead(Session session, String path, String marker, StatementGate.When when, Callable<?> between) throws Exception {
        var gate = GATE.arm(marker, when);
        try (ExecutorService pool = Executors.newSingleThreadExecutor()) {
            Future<Res> read = pool.submit(() -> http.get(session, path));
            assertThat(gate.awaitEntered(20)).as("statement gate reached for %s", path).isTrue();
            between.call();
            gate.release();
            Res response = read.get(30, TimeUnit.SECONDS);
            assertThat(response.status()).as(response.body()).isEqualTo(200);
            return response.json();
        } finally {
            GATE.reset();
        }
    }

    private Res restore(UUID app, UUID target, UUID expected) throws Exception {
        return http.post(aliceTab1, "/api/v0/applications/" + app + "/versions/" + target + "/restore",
                Map.of("expectedCurrentVersionId", expected.toString()), null);
    }

    private <T> List<T> parallel(int n, Indexed<T> call) throws Exception {
        var start = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newFixedThreadPool(n)) {
            var futures = new ArrayList<Future<T>>();
            for (int i = 0; i < n; i++) {
                int index = i;
                futures.add(pool.submit(() -> { start.await(); return call.apply(index); }));
            }
            start.countDown();
            var results = new ArrayList<T>();
            for (var future : futures) results.add(future.get(90, TimeUnit.SECONDS));
            return results;
        }
    }

    @FunctionalInterface interface Indexed<T> { T apply(int index) throws Exception; }

    private int queuedOrRunning() {
        return count("SELECT count(*) FROM generation_tasks WHERE queue_state IN ('QUEUED','RUNNING')");
    }

    private boolean isTerminal(UUID task) {
        return Set.of("READY", "FAILED").contains(status(task)) && count("SELECT count(*) FROM generation_tasks WHERE id=? AND queue_state='FINISHED'", task) == 1;
    }

    private int count(String sql, Object... params) {
        return jdbc.sql(sql).params(params).query(Integer.class).single();
    }

    private String status(UUID task) {
        return jdbc.sql("SELECT status FROM generation_tasks WHERE id=?").param(task).query(String.class).single();
    }

    private String failureCode(UUID task) {
        return jdbc.sql("SELECT coalesce(failure_code,'') FROM generation_tasks WHERE id=?").param(task).query(String.class).single();
    }

    private UUID latest(UUID app) {
        return jdbc.sql("SELECT latest_ready_version_id FROM applications WHERE id=?").param(app).query(UUID.class).optional().orElse(null);
    }

    private UUID versionOf(UUID task) {
        return jdbc.sql("SELECT id FROM application_versions WHERE source_task_id=? AND status='VERIFIED'").param(task).query(UUID.class).single();
    }

    private String versionStatus(UUID version) {
        return jdbc.sql("SELECT status FROM application_versions WHERE id=?").param(version).query(String.class).single();
    }

    private String sourceDigest(UUID version) {
        return jdbc.sql("SELECT source_digest FROM application_versions WHERE id=?").param(version).query(String.class).single();
    }

    private String artifactDigest(UUID version) throws Exception {
        Res snapshot = http.get(aliceTab1, "/api/v0/versions/" + version + "/snapshot");
        if (snapshot.status() == 404) snapshot = http.get(bobTab, "/api/v0/versions/" + version + "/snapshot");
        assertThat(snapshot.status()).as(snapshot.body()).isEqualTo(200);
        return snapshot.json().path("validation").path("artifactDigest").asText();
    }

    private String publicationStatus(UUID publication) {
        return jdbc.sql("SELECT status FROM publications WHERE id=?").param(publication).query(String.class).single();
    }

    private static String text(JsonNode node) {
        return node == null || node.isNull() || node.isMissingNode() ? "" : node.asText();
    }

    private static JsonNode item(JsonNode items, String id) {
        for (JsonNode item : items) if (item.path("id").asText().equals(id)) return item;
        return null;
    }

    private static List<String> statuses(JsonNode items) {
        var result = new ArrayList<String>();
        items.forEach(i -> result.add(i.path("number").asInt() + ":" + i.path("status").asText()));
        return result;
    }

    private static Set<String> intersection(Set<String> a, Set<String> b) {
        var result = new HashSet<>(a);
        result.retainAll(b);
        return result;
    }

    /** Every identifier that belongs to {@code user}: account, applications, tasks, versions, builds, publications. */
    private Set<String> identifiers(Account user, List<UUID> apps) {
        var ids = new HashSet<String>(Set.of(user.id().toString()));
        for (UUID app : apps) {
            ids.add(app.toString());
            ids.addAll(jdbc.sql("SELECT id::text FROM generation_tasks WHERE application_id=?").param(app).query(String.class).list());
            ids.addAll(jdbc.sql("SELECT id::text FROM application_versions WHERE application_id=?").param(app).query(String.class).list());
            ids.addAll(jdbc.sql("SELECT b.id::text FROM builds b JOIN application_versions v ON v.id=b.version_id WHERE v.application_id=?")
                    .param(app).query(String.class).list());
            ids.addAll(jdbc.sql("SELECT id::text FROM publications WHERE application_id=?").param(app).query(String.class).list());
        }
        return ids;
    }

    /** Relative path -> SHA-256 of every regular file under {@code root}, as one comparable string. */
    private static String tree(Path root) throws Exception {
        var result = new TreeMap<String, String>();
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path path : paths.filter(Files::isRegularFile).toList())
                result.put(root.relativize(path).toString().replace('\\', '/'),
                        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path))));
        }
        return result.toString();
    }
}
