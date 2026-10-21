package dev.codeless.api.recovery;

import dev.codeless.api.data.PlatformModels.DataMode;
import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.versions.LocalVolumeSnapshotStore;
import dev.codeless.api.versions.SnapshotStore;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.json.JsonMapper;

/**
 * Explicit recovery fixtures. Versions are frozen through the real {@link LocalVolumeSnapshotStore} with a fixture
 * runner report; they prove storage/reference behaviour only, never a real build, browser check or model result.
 */
final class RecoveryFixtures {
    static final JsonMapper JSON = JsonMapper.builder().build();

    record Seed(UUID owner, UUID app) {}
    record Version(UUID id, UUID buildId, String sourceDigest, String artifactDigest) {}

    private RecoveryFixtures() {}

    static Seed seed(PlatformRepository repository, String name) {
        UUID owner = UUID.randomUUID(), app = UUID.randomUUID();
        repository.createUser(owner, owner + "@example.test", "Recovery owner");
        repository.createApplication(app, owner, name, DataMode.STATIC);
        return new Seed(owner, app);
    }

    static UUID queuedTask(PlatformRepository repository, UUID app, String prompt) {
        UUID id = UUID.randomUUID();
        repository.createQueuedTask(id, app, prompt, null, "Task queued for D18 recovery fixture");
        return id;
    }

    /** A terminal READY task with a VERIFIED version: DRAFT row, SUCCEEDED build, then VERIFIED (DB triggers enforce it). */
    static Version verified(JdbcClient jdbc, SnapshotStore store, Path scratch, UUID app, UUID task, int number) throws Exception {
        UUID version = UUID.randomUUID(), build = UUID.randomUUID();
        var source = source(scratch, "<template><h1>D18 verified " + number + "</h1></template>");
        store.freezeSource(version, source.directory(), source.digest(), JSON.valueToTree(source.entries()));
        Path artifact = Files.createDirectories(scratch.resolve("artifact-" + version));
        byte[] html = "<!doctype html><script src=\"/assets/app.js\"></script>".getBytes(StandardCharsets.UTF_8);
        byte[] js = ("console.log('d18 fixture " + number + "')").getBytes(StandardCharsets.UTF_8);
        Files.write(artifact.resolve("index.html"), html);
        Files.createDirectories(artifact.resolve("assets"));
        Files.write(artifact.resolve("assets/app.js"), js);
        var files = List.of(new SnapshotStore.Entry("assets/app.js", js.length, LocalVolumeSnapshotStore.hash(js)),
                new SnapshotStore.Entry("index.html", html.length, LocalVolumeSnapshotStore.hash(html)));
        String artifactDigest = LocalVolumeSnapshotStore.hash(JSON.writeValueAsBytes(files));
        var result = JSON.valueToTree(Map.of("status", "VERIFIED", "sourceDigest", source.digest(),
                "build", Map.of("id", build, "status", "SUCCEEDED", "exitCode", 0, "artifact",
                        Map.of("directory", artifact.toString(), "digest", artifactDigest, "files", JSON.valueToTree(files))),
                "verification", Map.of("id", UUID.randomUUID(), "buildId", build, "sourceDigest", source.digest(),
                        "artifactDigest", artifactDigest, "status", "PASSED", "workerExitCode", 0)));
        store.freezeOutcome(version, source.digest(), "VERIFIED", result, null);
        jdbc.sql("INSERT INTO application_versions(id,application_id,number,source_digest,status,source_task_id) VALUES (?,?,?,?,'DRAFT',?)")
                .params(version, app, number, source.digest(), task).update();
        jdbc.sql("INSERT INTO builds(id,task_id,version_id,status,exit_code,artifact_digest,completed_at) VALUES (?,?,?,'SUCCEEDED',0,?,clock_timestamp())")
                .params(build, task, version, artifactDigest).update();
        jdbc.sql("UPDATE application_versions SET status='VERIFIED',build_id=? WHERE id=?").params(build, version).update();
        jdbc.sql("UPDATE generation_tasks SET status='READY',queue_state='FINISHED',lease_token=NULL,lease_expires_at=NULL WHERE id=?")
                .param(task).update();
        return new Version(version, build, source.digest(), artifactDigest);
    }

    /** A DRAFT candidate created by {@code task}, with its source frozen exactly as AgentRunStore.draft does. */
    static Version draft(JdbcClient jdbc, SnapshotStore store, Path scratch, UUID app, UUID task, int number) throws Exception {
        UUID version = UUID.randomUUID();
        var source = source(scratch, "<template><p>D18 draft " + number + "</p></template>");
        store.freezeSource(version, source.directory(), source.digest(), JSON.valueToTree(source.entries()));
        jdbc.sql("INSERT INTO application_versions(id,application_id,number,source_digest,status,source_task_id) VALUES (?,?,?,?,'DRAFT',?)")
                .params(version, app, number, source.digest(), task).update();
        return new Version(version, null, source.digest(), null);
    }

    record Source(Path directory, String digest, List<SnapshotStore.Entry> entries) {}

    static Source source(Path scratch, String vue) throws Exception {
        Path directory = Files.createTempDirectory(Files.createDirectories(scratch), "source-");
        byte[] content = vue.getBytes(StandardCharsets.UTF_8);
        Path file = directory.resolve("src/pages/HomePage.vue");
        Files.createDirectories(file.getParent());
        Files.write(file, content);
        var entries = List.of(new SnapshotStore.Entry("src/pages/HomePage.vue", content.length, LocalVolumeSnapshotStore.hash(content)));
        return new Source(directory, LocalVolumeSnapshotStore.hash(JSON.writeValueAsBytes(entries)), entries);
    }

    static Path write(Path file, String content) throws Exception {
        Files.createDirectories(file.getParent());
        return Files.writeString(file, content);
    }

    /** Backdates every entry of the tree, including the directories themselves. */
    static void age(Path root, Instant when) throws Exception {
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path path : paths.sorted((a, b) -> b.getNameCount() - a.getNameCount()).toList())
                Files.setLastModifiedTime(path, FileTime.from(when));
        }
    }

    /** Path -> SHA-256 of every regular file, to prove a protected tree is byte-identical after a sweep. */
    static Map<String, String> digests(Path root) throws Exception {
        var result = new TreeMap<String, String>();
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path path : paths.filter(Files::isRegularFile).toList())
                result.put(root.relativize(path).toString().replace('\\', '/'),
                        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path))));
        }
        return result;
    }

    static void evidence(String name, Object value) throws Exception {
        Path root = Path.of(System.getenv().getOrDefault("CODELESS_RECOVERY_EVIDENCE_DIR", "target/recovery-evidence"));
        Files.createDirectories(root);
        Files.writeString(root.resolve(name + ".json"), JSON.writerWithDefaultPrettyPrinter().writeValueAsString(value));
    }
}
