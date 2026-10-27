package dev.codeless.api.recovery;

import static org.assertj.core.api.Assertions.assertThat;

import dev.codeless.api.data.ArtifactRepository;
import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.deploy.DeploymentGateway;
import dev.codeless.api.deploy.DeploymentRecords;
import dev.codeless.api.deploy.PublicationService;
import dev.codeless.api.versions.LocalVolumeSnapshotStore;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * D18-A-T1: a real API process (production scheduler, deployment worker and lease heartbeat) is killed with
 * {@code destroyForcibly} while a generation stage and a hosting call are in flight, then restarted twice.
 * Its own pinned PostgreSQL keeps other suites' queued tasks out of the child's scheduler. Stage runner and hosting
 * adapter are recording fixtures: this proves restart semantics, not model, build or public hosting quality.
 */
class ProcessRestartRecoveryTest {
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94")
            .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("codeless_recovery").withUsername("codeless_recovery").withPassword("local-test-only");
    static final long LEASE_MS = 2000;

    @TempDir Path temporary;
    Path root;
    JdbcClient jdbc;
    final List<Process> children = new ArrayList<>();

    @Test void d18aT1ProcessKillAndRestartNeitherRepublishesNorReportsSuccess() throws Exception {
        POSTGRES.start();
        try {
            run();
        } finally {
            for (Process child : children) child.destroyForcibly();
            POSTGRES.stop();
        }
    }

    private void run() throws Exception {
        root = temporary.toRealPath();
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()).load().migrate();
        var dataSource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        jdbc = JdbcClient.create(dataSource);
        // Match the production repository proxy: capacity count + insert must be one transaction.
        var repositoryProxy = new org.springframework.aop.framework.ProxyFactory(new PlatformRepository(jdbc));
        repositoryProxy.setProxyTargetClass(true);
        repositoryProxy.addAdvice(new org.springframework.transaction.interceptor.TransactionInterceptor(
                new org.springframework.jdbc.datasource.DataSourceTransactionManager(dataSource),
                new org.springframework.transaction.annotation.AnnotationTransactionAttributeSource()));
        var repository = (PlatformRepository) repositoryProxy.getProxy();
        var store = new LocalVolumeSnapshotStore(root.resolve("agent/versions"));
        var records = new DeploymentRecords(root.resolve("agent/deployments"));

        // A usable version that was already published successfully before the crash.
        var seed = RecoveryFixtures.seed(repository, "D18 restart");
        UUID readyTask = RecoveryFixtures.queuedTask(repository, seed.app(), "Earlier successful generation");
        var verified = RecoveryFixtures.verified(jdbc, store, root.resolve("inputs"), seed.app(), readyTask, 1);
        jdbc.sql("UPDATE applications SET latest_ready_version_id=? WHERE id=?").params(verified.id(), seed.app()).update();
        DeploymentGateway passing = new DeploymentGateway() {
            public String publish(Payload payload, Instant deadline) { return "https://hosting.example.test/d18/" + payload.publicationId() + "/"; }
            public Probe probe(Payload payload, String url, Instant deadline) { return new Probe(true, payload.versionId(), payload.artifactDigest()); }
        };
        var publications = new PublicationService(jdbc, new ArtifactRepository(jdbc), store, records, passing,
                new DataSourceTransactionManager(dataSource));
        var prior = publications.request(seed.owner(), seed.app(), verified.id(), verified.artifactDigest(), "d18-prior-success-0001");
        publications.process(prior.id());
        var priorRow = publication(prior.id());
        assertThat(priorRow).containsEntry("status", "PUBLISHED");

        // In flight at crash time: a new publication click and a generation task with a DRAFT candidate.
        UUID publication = publications.request(seed.owner(), seed.app(), verified.id(), verified.artifactDigest(), "d18-restart-click-0001").id();
        UUID task = RecoveryFixtures.queuedTask(repository, seed.app(), "Generate while the API process crashes");
        var draft = RecoveryFixtures.draft(jdbc, store, root.resolve("inputs"), seed.app(), task, 2);
        Path markers = Files.createDirectories(root.resolve("markers"));

        Process first = start(1, "block");
        await("stage and hosting call in flight", Duration.ofSeconds(120), () ->
                lines(markers, "stages.log").contains("1 " + task + " PLAN") && lines(markers, "hosting.log").contains("1 publish " + publication));
        assertThat(taskRow(task)).containsEntry("queue_state", "RUNNING").containsEntry("status", "PLAN");
        Thread.sleep(LEASE_MS * 2); // only the live heartbeat can keep this lease valid
        var heartbeat = taskRow(task);
        assertThat(heartbeat).containsEntry("queue_state", "RUNNING").containsEntry("lease_valid", true);
        assertThat(phases(records, publication)).containsExactly("PREPARING", "PUBLISHING");

        long pid = first.pid();
        first.destroyForcibly(); // abrupt OS-level termination: no graceful shutdown, no finally blocks
        assertThat(first.waitFor(30, TimeUnit.SECONDS)).isTrue();
        Instant killed = Instant.now();
        var afterKill = Map.<String, Object>of("task", taskRow(task), "publication", publication(publication));
        assertThat(taskRow(task).get("status")).isEqualTo("PLAN");
        assertThat(publication(publication)).containsEntry("status", "REQUESTED");

        Process second = start(2, "observe");
        await("restart converges", Duration.ofSeconds(120), () ->
                "FAILED".equals(taskRow(task).get("status")) && "FAILED".equals(publication(publication).get("status")));
        long convergedMs = Duration.between(killed, Instant.now()).toMillis();
        await("restart cleanup receipt", Duration.ofSeconds(30),
                () -> Files.exists(root.resolve("agent/recovery/cleanup/" + task + ".json")));
        Thread.sleep(LEASE_MS * 2);
        var converged = snapshot(records, task, publication, prior.id(), draft.id(), seed.app());
        second.destroyForcibly();
        assertThat(second.waitFor(30, TimeUnit.SECONDS)).isTrue();

        Process third = start(3, "observe");
        await("second restart ready", Duration.ofSeconds(120), () -> lines(markers, "ready.log").stream().anyMatch(l -> l.startsWith("3 ")));
        Thread.sleep(LEASE_MS * 3);
        var restartedAgain = snapshot(records, task, publication, prior.id(), draft.id(), seed.app());
        third.destroyForcibly();
        assertThat(third.waitFor(30, TimeUnit.SECONDS)).isTrue();

        assertThat(converged.get("task")).isEqualTo(Map.of("status", "FAILED", "failure_code", "INTERRUPTED",
                "queue_state", "FINISHED", "lease_valid", false, "task_failed_events", 1L, "ready_events", 0L));
        assertThat(converged.get("draftVersion")).isEqualTo("FAILED");
        assertThat(converged.get("publication")).isEqualTo(Map.of("status", "FAILED", "url_present", false));
        assertThat(converged.get("phases")).isEqualTo(List.of("PREPARING", "PUBLISHING", "FAILED"));
        assertThat(converged.get("failureCode")).isEqualTo("DEPLOYMENT_INTERRUPTED");
        assertThat(converged.get("prior")).isEqualTo(Map.of("status", priorRow.get("status"), "url", priorRow.get("url")));
        assertThat(converged.get("latestReady")).isEqualTo(verified.id());
        assertThat(converged.get("publishedRows")).isEqualTo(1L);
        assertThat(lines(markers, "hosting.log")).containsExactly("1 publish " + publication);
        assertThat(lines(markers, "stages.log")).containsExactly("1 " + task + " PLAN");
        assertThat(restartedAgain).isEqualTo(converged);
        var report = store.outcome(draft.id(), draft.sourceDigest(), "FAILED").report();
        assertThat(report.path("failureCode").asText()).isEqualTo("INTERRUPTED");

        var evidence = new LinkedHashMap<String, Object>();
        evidence.put("case", "API process killed during a generation stage and a hosting call, then restarted twice");
        evidence.put("fixtures", "explicit recording stage runner + hosting adapter; real PostgreSQL 17.6, real child JVM, production scheduler/worker");
        evidence.put("leaseMs", LEASE_MS);
        evidence.put("killedPid", pid);
        evidence.put("heartbeatBeforeKill", heartbeat);
        evidence.put("immediatelyAfterKill", afterKill);
        evidence.put("convergedAfterRestartMs", convergedMs);
        evidence.put("afterFirstRestart", converged);
        evidence.put("afterSecondRestartUnchanged", true);
        evidence.put("hostingCalls", lines(markers, "hosting.log"));
        evidence.put("stageCalls", lines(markers, "stages.log"));
        evidence.put("draftReport", report);
        evidence.put("childProcesses", lines(markers, "ready.log"));
        RecoveryFixtures.evidence("D18-A-T1", evidence);
    }

    private Process start(int incarnation, String mode) throws Exception {
        Path cwd = Files.createDirectories(root.resolve("child-" + incarnation));
        var command = new ArrayList<>(List.of(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                "-Xmx384m", "-cp", System.getProperty("java.class.path"), RecoveryChildProcess.class.getName(),
                "--spring.datasource.url=" + POSTGRES.getJdbcUrl(),
                "--spring.datasource.username=" + POSTGRES.getUsername(),
                "--spring.datasource.password=" + POSTGRES.getPassword(),
                "--spring.datasource.hikari.maximum-pool-size=6",
                "--server.port=0",
                "--codeless.tasks.lease-ms=" + LEASE_MS, "--codeless.tasks.poll-ms=200",
                "--codeless.deploy.worker-enabled=true", "--codeless.deploy.poll-ms=200",
                "--codeless.agent.private-root=" + root.resolve("agent"),
                "--codeless.versions.root=" + root.resolve("agent/versions"),
                "--codeless.deploy.root=" + root.resolve("agent/deployments"),
                "--CODELESS_FILE_WORKSPACE_ROOT=" + root.resolve("workspaces"),
                "--codeless.export.repository-root=" + Path.of("../..").toAbsolutePath().normalize(),
                "--codeless.admin.audit-root=" + cwd.resolve("admin-audit"),
                "--codeless.model.audit-root=" + cwd.resolve("model-calls"),
                "--codeless.recovery.sweep-enabled=false",
                "--codeless.model.provider=deterministic-mock",
                "--recovery.markers=" + root.resolve("markers"),
                "--recovery.incarnation=" + incarnation, "--recovery.mode=" + mode));
        var builder = new ProcessBuilder(command).directory(cwd.toFile()).redirectErrorStream(true)
                .redirectOutput(cwd.resolve("process.log").toFile());
        for (String name : List.of("CODELESS_MODEL_API_KEY", "CODELESS_MODEL_NAME", "CODELESS_DATABASE_URL", "CODELESS_DATABASE_PASSWORD"))
            builder.environment().remove(name);
        Process process = builder.start();
        children.add(process);
        return process;
    }

    private void await(String what, Duration limit, BooleanSupplier condition) throws Exception {
        Instant until = Instant.now().plus(limit);
        while (Instant.now().isBefore(until)) {
            if (condition.getAsBoolean()) return;
            Process current = children.getLast(); // only ever awaited while the latest child should be running
            if (!current.isAlive())
                throw new AssertionError(what + ": child exited " + current.exitValue() + "\n" + tail(children.size()));
            Thread.sleep(100);
        }
        throw new AssertionError("timed out waiting for " + what + "\n" + tail(children.size()));
    }

    private String tail(int incarnation) {
        try {
            var all = Files.readAllLines(root.resolve("child-" + incarnation + "/process.log"), StandardCharsets.UTF_8);
            return String.join("\n", all.subList(Math.max(0, all.size() - 60), all.size()));
        } catch (Exception unavailable) {
            return "(no child log)";
        }
    }

    private static List<String> lines(Path markers, String name) {
        try {
            Path file = markers.resolve(name);
            return Files.exists(file) ? Files.readAllLines(file, StandardCharsets.UTF_8).stream().filter(l -> !l.isBlank()).toList() : List.of();
        } catch (Exception racing) {
            return List.of();
        }
    }

    private Map<String, Object> taskRow(UUID task) {
        return jdbc.sql("""
                SELECT status, failure_code, queue_state,
                       coalesce(lease_expires_at > clock_timestamp(), false) AS lease_valid
                FROM generation_tasks WHERE id = ?
                """).param(task).query().singleRow();
    }

    private Map<String, Object> publication(UUID id) {
        return jdbc.sql("SELECT status, url FROM publications WHERE id = ?").param(id).query().singleRow();
    }

    private static List<String> phases(DeploymentRecords records, UUID publication) {
        return records.events(publication).stream().map(DeploymentRecords.Event::phase).toList();
    }

    private Map<String, Object> snapshot(DeploymentRecords records, UUID task, UUID publication, UUID prior, UUID draft, UUID app) {
        var result = new LinkedHashMap<String, Object>();
        var row = new LinkedHashMap<>(taskRow(task));
        row.put("task_failed_events", jdbc.sql("SELECT count(*) FROM task_events WHERE task_id=? AND type='TASK_FAILED'").param(task).query(Long.class).single());
        row.put("ready_events", jdbc.sql("SELECT count(*) FROM task_events WHERE task_id=? AND stage='READY'").param(task).query(Long.class).single());
        result.put("task", row);
        result.put("draftVersion", jdbc.sql("SELECT status FROM application_versions WHERE id=?").param(draft).query(String.class).single());
        var current = publication(publication);
        result.put("publication", Map.of("status", current.get("status"), "url_present", current.get("url") != null));
        var events = records.events(publication);
        result.put("phases", events.stream().map(DeploymentRecords.Event::phase).toList());
        result.put("failureCode", events.getLast().failureCode());
        var before = publication(prior);
        result.put("prior", Map.of("status", before.get("status"), "url", before.get("url")));
        result.put("latestReady", jdbc.sql("SELECT latest_ready_version_id FROM applications WHERE id=?").param(app).query(UUID.class).single());
        result.put("publishedRows", jdbc.sql("SELECT count(*) FROM publications WHERE application_id=? AND status='PUBLISHED'").param(app).query(Long.class).single());
        return result;
    }
}
