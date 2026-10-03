package dev.codeless.api.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.codeless.api.data.PlatformModels.DataMode;
import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.data.PostgresTestBase;
import dev.codeless.api.data.TaskDiagnosticsService;
import dev.codeless.api.tasks.TaskQueueService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.json.JsonMapper;

class FileToolsIntegrationTest extends PostgresTestBase {
    @Autowired PlatformRepository platform;
    @Autowired TaskQueueService queue;
    @Autowired JdbcClient jdbc;
    @Autowired PlatformTransactionManager manager;
    @Autowired TaskDiagnosticsService diagnostics;
    @Autowired FileToolRegistry registry;
    @TempDir(factory = WorkspaceTempFactory.class) Path root;
    public static class WorkspaceTempFactory implements org.junit.jupiter.api.io.TempDirFactory {
        public Path createTempDirectory(org.junit.jupiter.api.extension.AnnotatedElementContext element,
                                        org.junit.jupiter.api.extension.ExtensionContext context) throws Exception {
            Path parent = Path.of("target", "file-tool-test-workspaces").toAbsolutePath();
            Files.createDirectories(parent);
            return Files.createTempDirectory(parent, "task-");
        }
    }
    private final JsonMapper mapper = JsonMapper.builder().build();
    private ControlledWorkspace workspace() { return new ControlledWorkspace(root.resolve("workspaces")); }
    private FileToolService service() { return new FileToolService(registry, workspace(), new FileToolAudit(root.resolve("audit")), jdbc, manager, diagnostics); }
    private TaskQueueService.Claim claim() {
        jdbc.sql("UPDATE generation_tasks SET queue_state='FINISHED' WHERE queue_state='QUEUED'").update();
        UUID owner = UUID.randomUUID(), app = UUID.randomUUID();
        platform.createUser(owner, owner + "@tools.test", "Tools tester");
        platform.createApplication(app, owner, "Tools test", DataMode.STATIC);
        platform.createTask(UUID.randomUUID(), app, "Controlled Vue fixture", null);
        var claim = queue.claim().orElseThrow();
        jdbc.sql("UPDATE generation_tasks SET status='GENERATE' WHERE id=?").param(claim.taskId()).update();
        return claim;
    }
    private FileToolService.Result run(TaskQueueService.Claim claim, String operation, Object args) {
        return service().execute(claim.taskId(), claim.token(), "files." + operation, mapper.writeValueAsString(args));
    }
    private Object args(String path, String content) { return java.util.Map.of("path", path, "content", content); }
    private Path receipt(TaskQueueService.Claim claim, UUID id, String phase) {
        return root.resolve("audit").resolve(claim.taskId().toString()).resolve(id + "." + phase + ".json");
    }
    private void evidence(String name, Object value) throws Exception {
        String configured = System.getenv("CODELESS_FILE_EVIDENCE_DIR");
        if (configured == null) return;
        Path directory = Path.of(configured).toAbsolutePath();
        Files.createDirectories(directory);
        Files.writeString(directory.resolve(name + ".json"), mapper.writeValueAsString(value) + "\n");
    }
    @Test void d08aT1RealCreateReadUpdateDeleteAreAuditedWithObservedHashesAndNoSourceInAudit() throws Exception {
        var claim = claim();
        String path = "src/pages/HomePage.vue", first = "<template><h1>审计 SOURCE_PRIVATE_123</h1></template>", second = "<template><h1>新版</h1></template>";
        var create = run(claim, "create", args(path, first));
        assertThat(create.status()).isEqualTo("SUCCEEDED");
        assertThat(create.afterDigest()).isEqualTo(ControlledWorkspace.hash(first.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        var read = run(claim, "read", java.util.Map.of("path", path));
        assertThat(read.content()).isEqualTo(first);
        assertThat(read.afterDigest()).isEqualTo(create.afterDigest());
        var update = run(claim, "update", java.util.Map.of("path", path, "content", second, "expectedDigest", read.afterDigest()));
        assertThat(update.status()).isEqualTo("SUCCEEDED");
        assertThat(Files.readString(workspace().source(claim.taskId()).resolve(path))).isEqualTo(second);
        var list = run(claim, "list", java.util.Map.of());
        assertThat(list.source().files()).containsExactly(new ControlledWorkspace.SourceFile(path, second.getBytes(java.nio.charset.StandardCharsets.UTF_8).length, update.afterDigest()));
        var snapshot = service().snapshot(claim.taskId(), claim.token());
        assertThat(snapshot.source().sourceDigest()).isEqualTo(list.source().sourceDigest());
        var delete = run(claim, "delete", java.util.Map.of("path", path, "expectedDigest", update.afterDigest()));
        assertThat(delete.status()).isEqualTo("SUCCEEDED");
        assertThat(delete.beforeDigest()).isEqualTo(update.afterDigest());
        assertThat(delete.afterDigest()).isNull();
        assertThat(workspace().source(claim.taskId()).resolve(path)).doesNotExist();
        assertThat(Files.readString(snapshot.directory().resolve(path))).isEqualTo(second);
        for (var result : List.of(create, read, update, list, delete)) {
            for (String phase : List.of("request", "observed", "committed"))
                assertThat(Files.readString(receipt(claim, result.callId(), phase))).doesNotContain(first, second, "SOURCE_PRIVATE_123", claim.token().toString(), root.toString());
            var stored = mapper.readTree(Files.readString(receipt(claim, result.callId(), "committed")));
            assertThat(stored.path("status").asText()).isEqualTo("SUCCEEDED");
            assertThat(stored.path("afterDigest").isNull()).isEqualTo(result.afterDigest() == null);
        }
        assertThat(platform.listEvents(claim.taskId()).stream().filter(e -> e.message().startsWith("File tool")).map(e -> e.message()).toList())
                .hasSize(5).allMatch(s -> s.contains("SUCCEEDED"));
        assertThat(platform.findTask(claim.taskId()).orElseThrow().status().name()).isEqualTo("GENERATE");
        assertThat(jdbc.sql("SELECT changes->0->>'operation' FROM task_file_snapshots WHERE task_id=?").param(claim.taskId()).query(String.class).single()).isEqualTo("DELETED");
        evidence("D08-A-T1", java.util.Map.of("case", "D08-A-T1", "taskId", claim.taskId(), "results", List.of(create, read, update, list, delete),
                "events", platform.listEvents(claim.taskId()), "snapshotSourceDigest", snapshot.source().sourceDigest()));
        var receipts = new java.util.ArrayList<tools.jackson.databind.JsonNode>();
        for (var result : List.of(create, read, update, list, delete))
            receipts.add(mapper.readTree(Files.readString(receipt(claim, result.callId(), "committed"))));
        evidence("tool-receipts", receipts);
    }

    @Test void d08aT2TraversalAbsoluteProtectedFilesAndSymlinkDirectoriesAreRejected() throws Exception {
        var claim = claim();
        Path outside = Files.createDirectory(root.resolve("outside"));
        Files.writeString(outside.resolve("HomePage.vue"), "untouched");
        for (String path : new String[]{"../outside/HomePage.vue", outside.resolve("HomePage.vue").toString(), "C:/test.vue", "package.json", "src/main.ts", "src/pages/NUL.vue"}) {
            var rejected = run(claim, "create", args(path, "malicious"));
            assertThat(rejected.status()).isEqualTo("FAILED");
            assertThat(rejected.errorCode()).isEqualTo("FILE_PATH_REJECTED");
        }
        workspace().initialize(claim.taskId());
        Path pages = workspace().source(claim.taskId()).resolve("src/pages");
        Files.delete(pages);
        directoryLink(pages, outside);
        var linked = run(claim, "read", java.util.Map.of("path", "src/pages/HomePage.vue"));
        assertThat(linked.errorCode()).isEqualTo("FILE_LINK_REJECTED");
        assertThat(linked.content()).isNull();
        assertThat(Files.readString(outside.resolve("HomePage.vue"))).isEqualTo("untouched");
        evidence("D08-A-T2", java.util.Map.of("case", "D08-A-T2", "linkedRead", linked, "outsideUntouched", true,
                "events", platform.listEvents(claim.taskId())));
    }

    static void directoryLink(Path link, Path target) throws Exception {
        try { Files.createSymbolicLink(link, target); }
        catch (java.nio.file.FileSystemException exception) {
            if (!System.getProperty("os.name").startsWith("Windows")) throw exception;
            // Windows junction is also a reparse escape and needs no elevation. Fixed test paths only.
            Process process = new ProcessBuilder("cmd.exe", "/d", "/c", "mklink", "/J", link.toString(), target.toString()).redirectErrorStream(true).start();
            String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            assertThat(process.waitFor()).as(output).isZero();
        }
    }

    @Test void d08aT3TasksAndCopiedSnapshotsAreIsolatedEvenForIdenticalRelativeNames() throws Exception {
        var a = claim(); var b = claim();
        String path = "src/pages/HomePage.vue";
        run(a, "create", args(path, "task A"));
        assertThat(run(b, "read", java.util.Map.of("path", path)).errorCode()).isEqualTo("FILE_NOT_FOUND");
        run(b, "create", args(path, "task B"));
        assertThat(run(a, "read", java.util.Map.of("path", path)).content()).isEqualTo("task A");
        assertThat(run(b, "read", java.util.Map.of("path", path)).content()).isEqualTo("task B");
        assertThatThrownBy(() -> service().execute(a.taskId(), b.token(), "files.list", "{}")).hasMessage("FILE_LEASE_INVALID");
        var snapshot = service().snapshot(a.taskId(), a.token());
        var old = run(a, "read", java.util.Map.of("path", path));
        run(a, "update", java.util.Map.of("path", path, "content", "changed A", "expectedDigest", old.afterDigest()));
        assertThat(Files.readString(snapshot.directory().resolve(path))).isEqualTo("task A");
        evidence("D08-A-T3", java.util.Map.of("case", "D08-A-T3", "taskA", a.taskId(), "taskB", b.taskId(),
                "snapshot", snapshot.source(), "taskARead", run(a, "read", java.util.Map.of("path", path)),
                "taskBRead", run(b, "read", java.util.Map.of("path", path))));
    }

    @Test void d08aT4MissingExistingDigestConflictAndUnknownShellNeverBecomeSuccessfulEvents() throws Exception {
        var claim = claim(); String path = "src/pages/HomePage.vue";
        var created = run(claim, "create", args(path, "original"));
        var duplicate = run(claim, "create", args(path, "overwrite"));
        var missing = run(claim, "read", java.util.Map.of("path", "src/pages/Missing.vue"));
        var conflict = run(claim, "update", java.util.Map.of("path", path, "content", "overwrite", "expectedDigest", "sha256:" + "0".repeat(64)));
        var shell = service().execute(claim.taskId(), claim.token(), "shell", "{\"command\":\"never execute\"}");
        assertThat(duplicate.errorCode()).isEqualTo("FILE_ALREADY_EXISTS");
        assertThat(missing.errorCode()).isEqualTo("FILE_NOT_FOUND");
        assertThat(conflict.errorCode()).isEqualTo("FILE_DIGEST_CONFLICT");
        assertThat(shell.errorCode()).isEqualTo("FILE_TOOL_UNKNOWN");
        for (var result : List.of(duplicate, missing, conflict, shell)) {
            assertThat(result.status()).isEqualTo("FAILED");
            assertThat(mapper.readTree(Files.readString(receipt(claim, result.callId(), "committed"))).path("status").asText()).isEqualTo("FAILED");
            assertThat(platform.listEvents(claim.taskId()).stream().filter(e -> e.message().contains(result.callId().toString())).map(e -> e.message()).toList())
                    .singleElement().asString().contains("FAILED", result.errorCode()).doesNotContain("SUCCEEDED");
        }
        assertThat(Files.readString(workspace().source(claim.taskId()).resolve(path))).isEqualTo("original");
        assertThat(created.status()).isEqualTo("SUCCEEDED");
        evidence("D08-A-T4", java.util.Map.of("case", "D08-A-T4", "failedResults", List.of(duplicate, missing, conflict, shell),
                "events", platform.listEvents(claim.taskId()), "originalDigest", created.afterDigest()));
    }

    @Test void fileBytesTotalBytesCountAndPortableCaseCollisionAreEnforcedBeforeWriting() throws Exception {
        var claim = claim();
        var oversize = run(claim, "create", args("src/data/Huge.ts", "中".repeat(43691)));
        assertThat(oversize.errorCode()).isEqualTo("FILE_SIZE_LIMIT");
        for (int i = 0; i < 4; i++) assertThat(run(claim, "create", args("src/data/Data" + i + ".ts", "x".repeat(131072))).status()).isEqualTo("SUCCEEDED");
        assertThat(run(claim, "create", args("src/data/Overflow.ts", "x")).errorCode()).isEqualTo("FILE_TOTAL_LIMIT");
        assertThat(run(claim, "list", java.util.Map.of()).source().totalBytes()).isEqualTo(524288);
        var countClaim = claim(); workspace().initialize(countClaim.taskId());
        for (int i=0; i<40; i++) Files.writeString(workspace().source(countClaim.taskId()).resolve("src/data/D" + i + ".ts"), "x");
        assertThat(run(countClaim, "create", args("src/data/Extra.ts", "x")).errorCode()).isEqualTo("FILE_COUNT_LIMIT");
        assertThat(run(countClaim, "list", java.util.Map.of()).source().files()).hasSize(40);
        var caseClaim = claim();
        run(caseClaim, "create", args("src/data/Items.ts", "a"));
        assertThat(run(caseClaim, "create", args("src/data/items.ts", "b")).errorCode()).isEqualTo("FILE_PATH_CONFLICT");
    }

    @Test void cancelledExpiredWrongStageAndOldTokensDoNotReadOrWriteAndTwentyCallsIsAHardLimit() throws Exception {
        var claim = claim();
        for (int i=0; i<20; i++) assertThat(run(claim, "list", java.util.Map.of()).status()).isEqualTo("SUCCEEDED");
        assertThatThrownBy(() -> run(claim, "list", java.util.Map.of())).hasMessage("FILE_CALL_LIMIT");
        var expired = claim();
        jdbc.sql("UPDATE generation_tasks SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=?").param(expired.taskId()).update();
        assertThatThrownBy(() -> run(expired, "list", java.util.Map.of())).hasMessage("FILE_LEASE_INVALID");
        var wrongStage = claim(); jdbc.sql("UPDATE generation_tasks SET status='PLAN' WHERE id=?").param(wrongStage.taskId()).update();
        assertThatThrownBy(() -> run(wrongStage, "list", java.util.Map.of())).hasMessage("FILE_LEASE_INVALID");
        var cancelled = claim();
        jdbc.sql("UPDATE generation_tasks SET status='FAILED',failure_code='CANCELLED',queue_state='FINISHED',lease_token=NULL,lease_expires_at=NULL WHERE id=?").param(cancelled.taskId()).update();
        assertThatThrownBy(() -> run(cancelled, "create", args("src/pages/A.vue", "late"))).hasMessage("FILE_LEASE_INVALID");
        assertThat(workspace().source(cancelled.taskId())).doesNotExist();
    }

    @Test void requestAuditFailureStopsMutationAndDatabaseFailureCannotCreateSuccessReceipt() throws Exception {
        var claim = claim();
        Path broken = Files.createFile(root.resolve("not-directory"));
        var unavailable = new FileToolService(registry, workspace(), new FileToolAudit(broken), jdbc, manager, diagnostics);
        assertThatThrownBy(() -> unavailable.execute(claim.taskId(), claim.token(), "files.create", mapper.writeValueAsString(args("src/pages/A.vue", "no write"))))
                .isInstanceOf(RuntimeException.class);
        assertThat(workspace().source(claim.taskId())).doesNotExist();
        assertThat(platform.listEvents(claim.taskId())).hasSize(1);
        // A real PostgreSQL trigger fails the result event after actual file IO. Preserve observation, roll back DB.
        jdbc.sql("""
                CREATE FUNCTION fail_d08_tool_event() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN IF NEW.message LIKE 'File tool %' THEN RAISE EXCEPTION 'fixture event failure'; END IF; RETURN NEW; END; $$
                """).update();
        jdbc.sql("CREATE TRIGGER d08_tool_event_fail BEFORE INSERT ON task_events FOR EACH ROW EXECUTE FUNCTION fail_d08_tool_event()").update();
        try {
            assertThatThrownBy(() -> run(claim, "create", args("src/pages/A.vue", "observed bytes"))).hasMessage("FILE_RECORD_UNAVAILABLE");
        } finally {
            jdbc.sql("DROP TRIGGER d08_tool_event_fail ON task_events").update();
            jdbc.sql("DROP FUNCTION fail_d08_tool_event()").update();
        }
        assertThat(platform.listEvents(claim.taskId())).hasSize(1);
        assertThat(jdbc.sql("SELECT count(*) FROM task_file_snapshots WHERE task_id=?").param(claim.taskId()).query(Integer.class).single()).isZero();
        try (var files = Files.list(root.resolve("audit").resolve(claim.taskId().toString()))) {
            assertThat(files.map(p -> p.getFileName().toString()).toList()).hasSize(2).noneMatch(n -> n.endsWith(".committed.json"));
        }
        assertThat(Files.readString(workspace().source(claim.taskId()).resolve("src/pages/A.vue"))).isEqualTo("observed bytes");
    }

    @Test void twoApiInstancesCreatingOnePathSerializeOnTheTaskRowAndProduceOneSuccess() throws Exception {
        var claim = claim();
        try (var workers = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var ready = new java.util.concurrent.CountDownLatch(2);
            var go = new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.Callable<FileToolService.Result> create = () -> {
                ready.countDown(); go.await(); return run(claim, "create", args("src/pages/A.vue", "one writer"));
            };
            var a = workers.submit(create); var b = workers.submit(create);
            assertThat(ready.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue(); go.countDown();
            assertThat(List.of(a.get().status(), b.get().status())).containsExactlyInAnyOrder("SUCCEEDED", "FAILED");
        }
        assertThat(run(claim, "list", java.util.Map.of()).source().files()).hasSize(1);
    }

    @Test void workspaceRootAncestorLinkAndUnexpectedProtectedFilesFailClosed() throws Exception {
        var claim = claim();
        Path outside = Files.createDirectory(root.resolve("root-outside"));
        directoryLink(root.resolve("workspaces"), outside);
        assertThat(run(claim, "list", java.util.Map.of()).errorCode()).isEqualTo("FILE_LINK_REJECTED");
        try (var files = Files.list(outside)) { assertThat(files.count()).isZero(); }
        Files.delete(root.resolve("workspaces"));
        workspace().initialize(claim.taskId());
        Files.writeString(workspace().source(claim.taskId()).resolve("package.json"), "protected injection");
        assertThat(run(claim, "list", java.util.Map.of()).errorCode()).isEqualTo("FILE_PATH_REJECTED");
    }

    @Test void fixedProjectSourceIsCreatedByRealToolsAndCopiedForRunnerAndBrowserAcceptance() throws Exception {
        var claim = claim();
        Path repository = Path.of("../..").toAbsolutePath().normalize();
        var results = new java.util.ArrayList<FileToolService.Result>();
        for (var entry : java.util.Map.of("showcase", "HomePage.vue", "tasks", "TasksPage.vue", "catalog", "CatalogPage.vue").entrySet()) {
            String relative = "src/pages/" + entry.getValue();
            String content = Files.readString(repository.resolve("templates/vue/fixtures").resolve(entry.getKey()).resolve(relative));
            var result = run(claim, "create", args(relative, content));
            assertThat(result.status()).isEqualTo("SUCCEEDED"); results.add(result);
        }
        var snapshot = service().snapshot(claim.taskId(), claim.token());
        assertThat(snapshot.source().files()).hasSize(3);
        String configured = System.getenv("CODELESS_FILE_EVIDENCE_DIR");
        if (configured != null) {
            Path export = Path.of(configured).resolve("fixed-source").toAbsolutePath();
            Files.createDirectories(export);
            for (var file : snapshot.source().files()) {
                Path destination = export.resolve(file.path());
                Files.createDirectories(destination.getParent());
                Files.write(destination, Files.readAllBytes(snapshot.directory().resolve(file.path())));
            }
            evidence("fixed-source", java.util.Map.of("taskId", claim.taskId(), "source", snapshot.source(), "results", results));
        }
    }
}
