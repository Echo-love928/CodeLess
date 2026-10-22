package dev.codeless.api.concurrency;

import static java.nio.charset.StandardCharsets.UTF_8;

import dev.codeless.api.agent.AgentFailure;
import dev.codeless.api.agent.AgentRunStore;
import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.deploy.DeploymentGateway;
import dev.codeless.api.tasks.TaskQueueService;
import dev.codeless.api.tasks.TaskStageRunner;
import dev.codeless.api.tools.FileToolService;
import dev.codeless.api.versions.LocalVolumeSnapshotStore;
import dev.codeless.api.versions.SnapshotStore;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * D20-A fixtures. Only three seams are fixtures, each named as such: the stage runner (no model, no Docker build, no
 * browser; it writes through the real file tools and commits through the real {@link AgentRunStore}), the runner
 * result it hands to that commit, and the hosting gateway. Queue, leases, scheduler, version store, READY commit,
 * convergence, publication worker, ledger, HTTP, sessions and PostgreSQL are the production code. Fixture output never
 * proves a real build, browser check, public hosting or model quality.
 */
final class ConcurrencyHarness {
    static final JsonMapper JSON = JsonMapper.builder().build();
    static final String PAGE = "src/pages/HomePage.vue";

    private ConcurrencyHarness() {}

    record Session(String cookie, String csrf) {}

    record Res(int status, String body) {
        JsonNode json() {
            return JSON.readTree(body);
        }
    }

    /** Plain JDK HTTP against the embedded Tomcat; the session cookie and CSRF token are sent explicitly. */
    static final class Http {
        private final int port;
        private final HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Duration.ofSeconds(10)).build();

        Http(int port) {
            this.port = port;
        }

        Session login(String email, String password) throws Exception {
            HttpResponse<String> csrf = client.send(HttpRequest.newBuilder(uri("/api/v0/auth/csrf")).GET().build(),
                    HttpResponse.BodyHandlers.ofString(UTF_8));
            if (csrf.statusCode() != 200) throw new IllegalStateException("csrf " + csrf.statusCode());
            Session anonymous = new Session(csrf.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0],
                    JSON.readTree(csrf.body()).path("token").asText());
            HttpRequest login = request(anonymous, "POST", "/api/v0/auth/login",
                    JSON.writeValueAsString(Map.of("email", email, "password", password)), null);
            HttpResponse<String> response = client.send(login, HttpResponse.BodyHandlers.ofString(UTF_8));
            if (response.statusCode() != 200) throw new IllegalStateException("login " + response.statusCode() + " " + response.body());
            return new Session(response.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0], anonymous.csrf());
        }

        Res get(Session session, String path) throws Exception {
            return send(session, "GET", path, null, null);
        }

        Res post(Session session, String path, Object body, String key) throws Exception {
            return send(session, "POST", path, body == null ? null : JSON.writeValueAsString(body), key);
        }

        Res send(Session session, String method, String path, String body, String key) throws Exception {
            HttpResponse<String> response = client.send(request(session, method, path, body, key), HttpResponse.BodyHandlers.ofString(UTF_8));
            return new Res(response.statusCode(), response.body());
        }

        private HttpRequest request(Session session, String method, String path, String body, String key) {
            HttpRequest.Builder builder = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(90))
                    .header("Accept", "application/json");
            if (session != null) builder.header("Cookie", session.cookie()).header("X-CSRF-Token", session.csrf());
            if (key != null) builder.header("Idempotency-Key", key);
            if (body != null) builder.header("Content-Type", "application/json");
            return builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body, UTF_8)).build();
        }

        private URI uri(String path) {
            return URI.create("http://127.0.0.1:" + port + path);
        }
    }

    /**
     * Explicit hosting fixture: every publication gets its own immutable location; a second publish of the same
     * publication is recorded as an overwrite. The probe re-reads what was "served" and re-derives the artifact digest
     * from those bytes, so it reports the served content, never an echo of the payload.
     */
    static final class Hosting implements DeploymentGateway {
        final Map<UUID, AtomicInteger> publishes = new ConcurrentHashMap<>();
        final Map<UUID, Payload> payloads = new ConcurrentHashMap<>();
        final Map<String, Map<String, byte[]>> served = new ConcurrentHashMap<>();
        final List<String> overwrites = new CopyOnWriteArrayList<>();
        volatile String mode = "PASS";
        volatile CountDownLatch entered;
        volatile CountDownLatch release;
        volatile Set<UUID> held = Set.of();

        void reset() {
            mode = "PASS";
            entered = null;
            release = null;
            held = Set.of();
        }

        /**
         * Publishing exactly these publications blocks inside the gateway until {@link #open()}. Any other publication
         * (for example one a failed earlier test left REQUESTED) passes straight through.
         */
        CountDownLatch hold(Set<UUID> publications) {
            release = new CountDownLatch(1);
            entered = new CountDownLatch(publications.size());
            held = Set.copyOf(publications);
            return entered;
        }

        void open() {
            CountDownLatch latch = release;
            if (latch != null) latch.countDown();
        }

        int calls(UUID publication) {
            AtomicInteger count = publishes.get(publication);
            return count == null ? 0 : count.get();
        }

        @Override public String publish(Payload payload, Instant deadline) {
            publishes.computeIfAbsent(payload.publicationId(), id -> new AtomicInteger()).incrementAndGet();
            payloads.put(payload.publicationId(), payload);
            CountDownLatch arrived = entered, gate = release;
            if (arrived != null && gate != null && held.contains(payload.publicationId())) {
                arrived.countDown();
                try {
                    if (!gate.await(25, TimeUnit.SECONDS)) throw new IllegalStateException("DEPLOYMENT_TIMEOUT");
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("DEPLOYMENT_TIMEOUT");
                }
            }
            if ("UNAVAILABLE".equals(mode)) throw new IllegalStateException("HOSTING_UNAVAILABLE");
            String url = "https://hosting.d20a.test/p/" + payload.publicationId() + "/";
            var files = new LinkedHashMap<String, byte[]>();
            for (var asset : payload.assets()) files.put(asset.path(), asset.bytes());
            if (served.putIfAbsent(url, files) != null) overwrites.add(url);
            return url;
        }

        @Override public Probe probe(Payload payload, String url, Instant deadline) {
            if ("FAIL".equals(mode)) return new Probe(false, payload.versionId(), payload.artifactDigest());
            Map<String, byte[]> files = served.get(url);
            if (files == null) return new Probe(false, null, null);
            return new Probe(true, payload.versionId(), manifestDigest(files));
        }
    }

    /** Artifact manifest digest exactly as the version store derives it: sorted {path,bytes,digest} entries. */
    static String manifestDigest(Map<String, byte[]> files) {
        var entries = files.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .map(e -> new SnapshotStore.Entry(e.getKey(), e.getValue().length, LocalVolumeSnapshotStore.hash(e.getValue()))).toList();
        return LocalVolumeSnapshotStore.hash(JSON.writeValueAsBytes(entries));
    }

    /** A pause point inside the fixture runner, for one task and stage. */
    static final class Hold {
        final UUID task;
        final TaskStatus stage;
        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);

        Hold(UUID task, TaskStatus stage) {
            this.task = task;
            this.stage = stage;
        }
    }

    /**
     * Fixture stage runner (no model, build or browser). PLAN proposes nothing; GENERATE writes one page through the
     * real file tools and freezes a DRAFT through {@link AgentRunStore#draft}; VERIFY builds a fixture artifact from
     * the frozen source bytes; READY commits through {@link AgentRunStore#complete} exactly as the Agent loop does,
     * including its EDIT_VERSION_CONFLICT handling. Every execution and every concurrently running task is counted.
     */
    static final class StageRunner implements TaskStageRunner {
        final AgentRunStore store;
        final FileToolService files;
        final SnapshotStore snapshots;
        final JdbcClient jdbc;
        final Path scratch;
        final Map<UUID, JsonNode> drafts = new ConcurrentHashMap<>();
        final Map<UUID, JsonNode> results = new ConcurrentHashMap<>();
        final Map<String, AtomicInteger> executions = new ConcurrentHashMap<>();
        final Map<UUID, AtomicInteger> runningPerApplication = new ConcurrentHashMap<>();
        final Map<UUID, Integer> maxRunningPerApplication = new ConcurrentHashMap<>();
        final List<UUID> planOrder = new CopyOnWriteArrayList<>();
        final Set<UUID> failBuild = ConcurrentHashMap.newKeySet();
        final List<Hold> holds = new CopyOnWriteArrayList<>();

        StageRunner(AgentRunStore store, FileToolService files, SnapshotStore snapshots, JdbcClient jdbc, Path scratch) {
            this.store = store;
            this.files = files;
            this.snapshots = snapshots;
            this.jdbc = jdbc;
            this.scratch = scratch;
        }

        Hold hold(UUID task, TaskStatus stage) {
            Hold hold = new Hold(task, stage);
            holds.add(hold);
            return hold;
        }

        int executions(UUID task, TaskStatus stage) {
            AtomicInteger count = executions.get(task + ":" + stage);
            return count == null ? 0 : count.get();
        }

        @Override public StageResult execute(UUID taskId, TaskStatus stage) {
            throw new IllegalStateException("fixture runner requires the original claim");
        }

        @Override public StageResult execute(TaskQueueService.Claim claim, TaskStatus stage) {
            executions.computeIfAbsent(claim.taskId() + ":" + stage, key -> new AtomicInteger()).incrementAndGet();
            UUID app = jdbc.sql("SELECT application_id FROM generation_tasks WHERE id=?").param(claim.taskId()).query(UUID.class).single();
            int running = runningPerApplication.computeIfAbsent(app, key -> new AtomicInteger()).incrementAndGet();
            maxRunningPerApplication.merge(app, running, Math::max);
            try {
                for (Hold hold : holds) {
                    if (hold.task.equals(claim.taskId()) && hold.stage == stage) {
                        hold.entered.countDown();
                        if (!hold.release.await(30, TimeUnit.SECONDS)) throw new IllegalStateException("hold never released");
                    }
                }
                return switch (stage) {
                    case PLAN -> {
                        planOrder.add(claim.taskId());
                        yield new StageResult(TaskStatus.GENERATE, "Fixture plan: no model call", null);
                    }
                    case GENERATE -> generate(claim);
                    case VERIFY -> verify(claim);
                    default -> new StageResult(TaskStatus.FAILED, "Fixture runner has no stage " + stage, "FIXTURE_STAGE_UNSUPPORTED");
                };
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return new StageResult(TaskStatus.FAILED, "Fixture runner interrupted", "FIXTURE_INTERRUPTED");
            } finally {
                runningPerApplication.get(app).decrementAndGet();
            }
        }

        /** Writes the page through the real file tools (lease-fenced) and freezes it as a DRAFT version. */
        StageResult generate(TaskQueueService.Claim claim) {
            var owner = jdbc.sql("""
                    SELECT a.owner_id, a.id, t.prompt FROM generation_tasks t JOIN applications a ON a.id = t.application_id WHERE t.id = ?
                    """).param(claim.taskId()).query((rs, n) -> List.of(rs.getString(1), rs.getString(2), rs.getString(3))).single();
            String content = "<template><main data-owner=\"" + owner.get(0) + "\" data-app=\"" + owner.get(1) + "\" data-task=\""
                    + claim.taskId() + "\"><h1>" + owner.get(2).replace("<", "") + "</h1></main></template>\n";
            var created = files.execute(claim.taskId(), claim.token(), "files.create",
                    JSON.writeValueAsString(Map.of("path", PAGE, "content", content)));
            if (!"SUCCEEDED".equals(created.status())) return new StageResult(TaskStatus.FAILED, "Fixture write rejected", created.errorCode());
            JsonNode draft = store.draft(claim, files.snapshot(claim.taskId(), claim.token()), JSON.createArrayNode());
            drafts.put(claim.taskId(), draft);
            return new StageResult(TaskStatus.VERIFY, "Fixture draft frozen", null);
        }

        /** Fixture build: an artifact derived from the frozen source bytes, owner-marked, never a real build. */
        StageResult verify(TaskQueueService.Claim claim) {
            JsonNode draft = drafts.get(claim.taskId());
            if (draft == null) return new StageResult(TaskStatus.FAILED, "Fixture draft missing", "FIXTURE_DRAFT_MISSING");
            if (failBuild.contains(claim.taskId())) {
                store.failedBuild(claim, draft, JSON.valueToTree(Map.of("status", "FAILED", "build", Map.of("id", UUID.randomUUID().toString(),
                        "status", "FAILED", "exitCode", 1, "createdAt", Instant.now().toString(), "completedAt", Instant.now().toString()))));
                return new StageResult(TaskStatus.FAILED, "Fixture build failed", "BUILD_FAILED");
            }
            try {
                results.put(claim.taskId(), artifact(UUID.fromString(draft.path("versionId").asText()), draft.path("sourceDigest").asText()));
            } catch (Exception failure) {
                return new StageResult(TaskStatus.FAILED, "Fixture artifact unavailable", "FIXTURE_ARTIFACT_UNAVAILABLE");
            }
            return new StageResult(TaskStatus.READY, "Fixture build and check passed", null);
        }

        JsonNode artifact(UUID version, String sourceDigest) throws Exception {
            String page = snapshots.readSource(version, sourceDigest, PAGE);
            Path directory = Files.createDirectories(scratch.resolve("artifact-" + version));
            byte[] html = ("<!doctype html><meta name=\"codeless-version\" content=\"" + version + "\"><script src=\"/assets/app.js\"></script>"
                    + "<!-- " + page.replace("--", "") + " -->").getBytes(UTF_8);
            byte[] js = ("console.log(" + JSON.writeValueAsString("d20a fixture build of " + version + " " + sourceDigest) + ")").getBytes(UTF_8);
            Files.write(directory.resolve("index.html"), html);
            Files.createDirectories(directory.resolve("assets"));
            Files.write(directory.resolve("assets/app.js"), js);
            var entries = List.of(new SnapshotStore.Entry("assets/app.js", js.length, LocalVolumeSnapshotStore.hash(js)),
                    new SnapshotStore.Entry("index.html", html.length, LocalVolumeSnapshotStore.hash(html)));
            String digest = LocalVolumeSnapshotStore.hash(JSON.writeValueAsBytes(entries));
            UUID build = UUID.randomUUID();
            String now = Instant.now().toString();
            return JSON.valueToTree(Map.of("status", "VERIFIED", "sourceDigest", sourceDigest,
                    "build", Map.of("id", build, "status", "SUCCEEDED", "exitCode", 0, "createdAt", now, "completedAt", now,
                            "artifact", Map.of("directory", directory.toString(), "digest", digest, "files", JSON.valueToTree(entries))),
                    "verification", Map.of("id", UUID.randomUUID(), "buildId", build, "sourceDigest", sourceDigest,
                            "artifactDigest", digest, "status", "PASSED", "workerExitCode", 0)));
        }

        @Override public TaskQueueService.TaskView advance(TaskQueueService queue, TaskQueueService.Claim claim, StageResult result, EventType type) {
            if (result.next() != TaskStatus.READY) return TaskStageRunner.super.advance(queue, claim, result, type);
            try {
                return store.complete(queue, claim, drafts.get(claim.taskId()), results.get(claim.taskId()));
            } catch (AgentFailure failure) {
                // Same handling as AgentLoop.advance: a moved edit base fails the candidate, never the newer pointer.
                if (!"EDIT_VERSION_CONFLICT".equals(failure.getMessage())) throw failure;
                store.abandonDraft(claim, "EDIT_VERSION_CONFLICT");
                return queue.advance(claim, TaskStatus.FAILED, EventType.TASK_FAILED, "Edit base changed before commit", "EDIT_VERSION_CONFLICT");
            }
        }
    }

    /** Runs {@code ticks} of a production scheduler on its own thread until {@code done} reports true. */
    static Thread worker(String name, dev.codeless.api.tasks.TaskScheduler scheduler, java.util.function.BooleanSupplier done,
                         List<Throwable> errors) {
        Thread thread = new Thread(() -> {
            long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(90);
            while (!done.getAsBoolean() && System.nanoTime() < until) {
                try {
                    scheduler.tick();
                    Thread.sleep(5);
                } catch (InterruptedException interrupted) {
                    return;
                } catch (Throwable failure) {
                    errors.add(failure);
                }
            }
        }, name);
        thread.setDaemon(true);
        thread.start();
        return thread;
    }

    static void evidence(String name, Object value) throws Exception {
        Path root = Path.of(System.getenv().getOrDefault("CODELESS_CONCURRENCY_EVIDENCE_DIR", "target/d20a-concurrency-evidence"));
        Files.createDirectories(root);
        Files.writeString(root.resolve(name + ".json"), JSON.writerWithDefaultPrettyPrinter().writeValueAsString(value) + "\n");
    }

    /** Ordered evidence map from key/value pairs; Map.of stops at ten pairs. */
    static Map<String, Object> ordered(Object... pairs) {
        var result = new LinkedHashMap<String, Object>();
        for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
        return result;
    }
}
