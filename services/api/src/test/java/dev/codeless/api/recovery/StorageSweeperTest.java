package dev.codeless.api.recovery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.data.PostgresTestBase;
import dev.codeless.api.tasks.TaskQueueService;
import dev.codeless.api.tasks.TaskScheduler;
import dev.codeless.api.tasks.TaskStageRunner;
import dev.codeless.api.versions.LocalVolumeSnapshotStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;

/** D18-A-03/04 with real PostgreSQL references and a real version volume; versions/builds are explicit fixtures. */
class StorageSweeperTest extends PostgresTestBase {
    @Autowired PlatformRepository repository;
    @Autowired TaskQueueService queue;
    @Autowired JdbcClient jdbc;
    @Autowired PlatformTransactionManager transactions;
    @TempDir Path temporary;
    Path root;
    LocalVolumeSnapshotStore store;
    StorageSweeper sweeper;
    RunnerCleanup cleanup;
    final Instant old = Instant.now().minus(Duration.ofHours(2));

    @BeforeEach void isolate() throws Exception {
        jdbc.sql("UPDATE generation_tasks SET queue_state='FINISHED', lease_token=NULL, lease_expires_at=NULL "
                + "WHERE queue_state IN ('QUEUED','RUNNING')").update();
        root = temporary.toRealPath();
        store = new LocalVolumeSnapshotStore(root.resolve("agent/versions"));
        for (String dir : List.of("agent/artifacts", "agent/work", "workspaces")) Files.createDirectories(root.resolve(dir));
        sweeper = new StorageSweeper(jdbc, new StorageSweeper.Roots(root.resolve("agent/versions"), root.resolve("agent/artifacts"),
                root.resolve("agent/work"), root.resolve("workspaces")), Duration.ofHours(1), Clock.systemUTC());
        cleanup = new RunnerCleanup(jdbc, transactions, root.resolve("agent/work"), root.resolve("workspaces"),
                root.resolve("agent/recovery/cleanup"));
    }

    private Path file(String relative, String content) throws Exception {
        return RecoveryFixtures.write(root.resolve(relative), content);
    }

    private void ageTask(UUID task) {
        jdbc.sql("UPDATE generation_tasks SET updated_at = clock_timestamp() - interval '2 hours' WHERE id=?").param(task).update();
    }

    @Test void retentionBelowOneHourIsRefused() {
        assertThatThrownBy(() -> new StorageSweeper(jdbc, new StorageSweeper.Roots(root.resolve("a"), root.resolve("b"),
                root.resolve("c"), root.resolve("d")), Duration.ofMinutes(59), Clock.systemUTC()))
                .isInstanceOf(IllegalStateException.class);
        var overlapping = new StorageSweeper(jdbc, new StorageSweeper.Roots(root.resolve("agent"), root.resolve("agent/artifacts"),
                root.resolve("agent/work"), root.resolve("workspaces")), Duration.ofHours(1), Clock.systemUTC());
        var report = overlapping.sweep();
        assertThat(report.status()).isEqualTo("PARTIAL");
        assertThat(report.removed()).isEmpty();
    }

    @Test void d18aT3ExpiredTaskResourcesAreReclaimedOnlyWhenUnreferencedAndPastRetention() throws Exception {
        var seed = RecoveryFixtures.seed(repository, "D18 expired resources");
        UUID expired = RecoveryFixtures.queuedTask(repository, seed.app(), "Worker dies during VERIFY");
        queue.claim(Duration.ofSeconds(1)).orElseThrow();
        // What the dead worker left: runner scratch, D08 working copy and snapshot, an uncommitted build artifact and
        // a version directory whose SQL insert rolled back, plus abandoned temp dirs of a dead runner bridge.
        UUID orphanBuild = UUID.randomUUID(), orphanVersion = UUID.randomUUID();
        var left = new LinkedHashMap<String, Path>();
        left.put("runnerScratch", file("agent/work/" + expired + "/source-1/src/pages/HomePage.vue", "scratch"));
        left.put("workingCopy", file("workspaces/" + expired + "/source/src/pages/HomePage.vue", "working"));
        left.put("workspace", file("workspaces/" + expired + "/snapshots/" + UUID.randomUUID() + "/src/pages/HomePage.vue", "snapshot"));
        left.put("orphanArtifact", file("agent/artifacts/" + orphanBuild + "/index.html", "<p>never committed</p>"));
        left.put("pendingArtifact", file("agent/artifacts/.build-123/index.html", "partial copy"));
        var rolledBack = RecoveryFixtures.source(root.resolve("inputs"), "<template>rolled back</template>");
        store.freezeSource(orphanVersion, rolledBack.directory(), rolledBack.digest(), RecoveryFixtures.JSON.valueToTree(rolledBack.entries()));
        left.put("orphanVersion", root.resolve("agent/versions/" + orphanVersion + "/source/src/pages/HomePage.vue"));
        left.put("legacyScratch", file("agent/work/source-abc/src/pages/HomePage.vue", "legacy"));
        left.put("legacyStaging", file("agent/work/build/codeless-build-xyz/input/src/pages/HomePage.vue", "staging"));

        Thread.sleep(1200);
        TaskStageRunner unused = (id, stage) -> { throw new AssertionError("no stage may run during recovery"); };
        new TaskScheduler(queue, unused, cleanup, 60_000).tick();
        assertThat(jdbc.sql("SELECT failure_code FROM generation_tasks WHERE id=?").param(expired).query(String.class).single())
                .isEqualTo("INTERRUPTED");
        assertThat(left.get("runnerScratch")).as("released by task ID at recovery").doesNotExist();
        assertThat(left.get("workingCopy")).doesNotExist();

        // Inside the retention period nothing is removed, even though every candidate is unreferenced.
        var fresh = sweeper.sweep();
        assertThat(fresh.status()).isEqualTo("COMPLETE");
        assertThat(fresh.removed()).isEmpty();
        for (String key : List.of("workspace", "orphanArtifact", "pendingArtifact", "orphanVersion", "legacyScratch", "legacyStaging"))
            assertThat(left.get(key)).as(key).exists();

        // Guards that must hold even for old files: an active task's resources and a just-failed task's workspace.
        UUID active = RecoveryFixtures.queuedTask(repository, seed.app(), "Still running elsewhere");
        var activeClaim = queue.claim(Duration.ofMinutes(5)).orElseThrow();
        assertThat(activeClaim.taskId()).isEqualTo(active);
        Path activeScratch = file("agent/work/" + active + "/source-2/src/pages/HomePage.vue", "in flight");
        Path activeWorkspace = file("workspaces/" + active + "/source/src/pages/HomePage.vue", "in flight");
        UUID recent = RecoveryFixtures.queuedTask(repository, seed.app(), "Failed a minute ago");
        queue.cancel(seed.owner(), recent);
        Path recentWorkspace = file("workspaces/" + recent + "/snapshots/" + UUID.randomUUID() + "/src/pages/HomePage.vue", "recent");
        Path youngOrphan = file("agent/artifacts/" + UUID.randomUUID() + "/index.html", "<p>young</p>");

        for (String dir : List.of("agent/work", "agent/artifacts", "agent/versions", "workspaces")) RecoveryFixtures.age(root.resolve(dir), old);
        Files.setLastModifiedTime(youngOrphan, java.nio.file.attribute.FileTime.from(Instant.now()));
        ageTask(expired);

        var swept = sweeper.sweep();
        assertThat(swept.status()).isEqualTo("COMPLETE");
        assertThat(swept.errors()).isEmpty();
        assertThat(swept.removed()).containsEntry("FAILED_TASK_WORKSPACE", 1).containsEntry("ORPHAN_ARTIFACT", 1)
                .containsEntry("PENDING_ARTIFACT", 1).containsEntry("ORPHAN_VERSION", 1).containsEntry("RUNNER_SCRATCH", 2);
        for (String key : List.of("workspace", "orphanArtifact", "pendingArtifact", "orphanVersion", "legacyScratch", "legacyStaging"))
            assertThat(left.get(key)).as(key).doesNotExist();
        assertThat(root.resolve("workspaces/" + expired)).doesNotExist();
        assertThat(root.resolve("agent/work/build")).as("shared staging root itself stays").isDirectory();
        assertThat(activeScratch).as("active task, despite old files").exists();
        assertThat(activeWorkspace).exists();
        assertThat(recentWorkspace).as("task failed inside retention").exists();
        assertThat(youngOrphan).as("subtree changed inside retention").exists();
        assertThat(swept.kept()).containsKey("ACTIVE").containsKey("RETENTION");

        var again = sweeper.sweep();
        assertThat(again.status()).isEqualTo("COMPLETE");
        assertThat(again.removed()).isEmpty();
        queue.cancel(seed.owner(), active);
        RecoveryFixtures.evidence("D18-A-T3", Map.of(
                "case", "expired task resources are reclaimed; nothing referenced or inside retention is touched",
                "expiredTask", Map.of("taskId", expired, "failureCode", "INTERRUPTED",
                        "releasedImmediatelyByTaskId", List.of("work/<task>", "workspaces/<task>/source")),
                "retentionHours", 1, "agedBy", "2 hours (file mtimes and task updated_at)",
                "sweepInsideRetention", fresh, "sweepAfterRetention", swept, "repeatSweep", again,
                "keptDespiteOldFiles", List.of("active task work/ and workspace/", "task failed inside retention", "subtree touched inside retention")));
    }

    @Test void d18aT4CleanupNeverDeletesPublishedPreviewOrUsableVersions() throws Exception {
        var seed = RecoveryFixtures.seed(repository, "D18 protected versions");
        Path inputs = root.resolve("inputs");
        var versions = new LinkedHashMap<String, RecoveryFixtures.Version>();
        var tasks = new LinkedHashMap<String, UUID>();
        int number = 1;
        for (String role : List.of("published", "publishing", "currentPreview", "usableHistory")) {
            UUID task = RecoveryFixtures.queuedTask(repository, seed.app(), "Source task of " + role);
            tasks.put(role, task);
            var version = RecoveryFixtures.verified(jdbc, store, inputs, seed.app(), task, number++);
            versions.put(role, version);
            file("agent/artifacts/" + version.buildId() + "/index.html", "<p>" + role + " runner artifact</p>");
            file("workspaces/" + task + "/snapshots/" + UUID.randomUUID() + "/src/pages/HomePage.vue", role + " preview source");
        }
        UUID failedTask = RecoveryFixtures.queuedTask(repository, seed.app(), "Failed candidate keeps diagnostics");
        var failed = RecoveryFixtures.draft(jdbc, store, inputs, seed.app(), failedTask, number++);
        queue.cancel(seed.owner(), failedTask); // converges its DRAFT to FAILED (report frozen in the API's own store)
        UUID published = UUID.randomUUID(), publishing = UUID.randomUUID();
        jdbc.sql("INSERT INTO publications(id,application_id,version_id,requested_by,status,url,published_at) VALUES (?,?,?,?,'PUBLISHED',?,clock_timestamp())")
                .params(published, seed.app(), versions.get("published").id(), seed.owner(), "https://hosting.example.test/p/" + published + "/").update();
        jdbc.sql("INSERT INTO publications(id,application_id,version_id,requested_by,status) VALUES (?,?,?,?,'REQUESTED')")
                .params(publishing, seed.app(), versions.get("publishing").id(), seed.owner()).update();
        jdbc.sql("UPDATE applications SET latest_ready_version_id=? WHERE id=?").params(versions.get("currentPreview").id(), seed.app()).update();

        // Abandoned attempt beside the published version's frozen outcome, and unreferenced siblings of the same age.
        Path stalePending = file("agent/versions/" + versions.get("published").id() + "/.outcome-777/report.json", "{}");
        UUID orphanVersion = UUID.randomUUID();
        Path orphanVersionFile = file("agent/versions/" + orphanVersion + "/source/src/pages/HomePage.vue", "orphan");
        Path orphanArtifact = file("agent/artifacts/" + UUID.randomUUID() + "/index.html", "<p>orphan</p>");
        Path failedWorkspace = file("workspaces/" + failedTask + "/snapshots/" + UUID.randomUUID() + "/src/pages/HomePage.vue", "failed");

        // Fault injection: a link/junction inside an orphan candidate pointing at the published version must never
        // be followed; the candidate is rejected and the published bytes stay intact.
        UUID linkedOrphan = UUID.randomUUID();
        Path linkParent = Files.createDirectories(root.resolve("agent/versions/" + linkedOrphan));
        Path link = linkParent.resolve("evil");
        Path publishedDir = root.resolve("agent/versions/" + versions.get("published").id());
        if (System.getProperty("os.name").startsWith("Windows")) {
            Process p = new ProcessBuilder("cmd.exe", "/d", "/c", "mklink", "/J", link.toString(), publishedDir.toString()).start();
            assertThat(p.waitFor()).isZero();
        } else Files.createSymbolicLink(link, publishedDir);

        for (String dir : List.of("agent/artifacts", "workspaces")) RecoveryFixtures.age(root.resolve(dir), old);
        for (var version : versions.values()) RecoveryFixtures.age(root.resolve("agent/versions/" + version.id()), old);
        RecoveryFixtures.age(root.resolve("agent/versions/" + orphanVersion), old);
        Files.setLastModifiedTime(linkParent, java.nio.file.attribute.FileTime.from(old));
        for (var task : tasks.values()) ageTask(task);
        ageTask(failedTask);

        var before = new LinkedHashMap<String, Map<String, String>>();
        for (var entry : versions.entrySet()) {
            var version = entry.getValue();
            before.put(entry.getKey() + ":version", withoutPending(RecoveryFixtures.digests(root.resolve("agent/versions/" + version.id()))));
            before.put(entry.getKey() + ":artifact", RecoveryFixtures.digests(root.resolve("agent/artifacts/" + version.buildId())));
            before.put(entry.getKey() + ":previewSource", RecoveryFixtures.digests(root.resolve("workspaces/" + tasks.get(entry.getKey()))));
        }
        var publicationsBefore = jdbc.sql("SELECT id, status, url, published_at FROM publications WHERE application_id=? ORDER BY id")
                .param(seed.app()).query().listOfRows();

        var report = sweeper.sweep();

        assertThat(report.status()).as("the planted link is an anomaly, never a silent success").isEqualTo("PARTIAL");
        assertThat(report.errors()).containsExactly("CLEANUP_LINK_REJECTED:versions/" + linkedOrphan);
        for (var entry : versions.entrySet()) {
            var version = entry.getValue();
            assertThat(RecoveryFixtures.digests(root.resolve("agent/versions/" + version.id()))).as(entry.getKey())
                    .isEqualTo(before.get(entry.getKey() + ":version"));
            assertThat(RecoveryFixtures.digests(root.resolve("agent/artifacts/" + version.buildId())))
                    .isEqualTo(before.get(entry.getKey() + ":artifact"));
            assertThat(RecoveryFixtures.digests(root.resolve("workspaces/" + tasks.get(entry.getKey()))))
                    .isEqualTo(before.get(entry.getKey() + ":previewSource"));
            // The immutable store re-hashes every byte: still a readable, usable version after the sweep.
            assertThat(store.outcome(version.id(), version.sourceDigest(), "VERIFIED").artifactDigest()).isEqualTo(version.artifactDigest());
            assertThat(store.artifactBytes(version.id(), version.sourceDigest())).containsKeys("index.html", "assets/app.js");
        }
        assertThat(jdbc.sql("SELECT id, status, url, published_at FROM publications WHERE application_id=? ORDER BY id")
                .param(seed.app()).query().listOfRows()).isEqualTo(publicationsBefore);
        assertThat(jdbc.sql("SELECT latest_ready_version_id FROM applications WHERE id=?").param(seed.app()).query(UUID.class).single())
                .isEqualTo(versions.get("currentPreview").id());
        assertThat(jdbc.sql("SELECT status FROM application_versions WHERE id=?").param(failed.id()).query(String.class).single()).isEqualTo("FAILED");
        assertThat(root.resolve("agent/versions/" + failed.id() + "/source")).as("failed version keeps diagnostics").isDirectory();

        assertThat(stalePending).doesNotExist();
        assertThat(orphanVersionFile).doesNotExist();
        assertThat(orphanArtifact).doesNotExist();
        assertThat(failedWorkspace).doesNotExist();
        assertThat(link).as("rejected candidate left for an operator").exists();
        assertThat(report.removed()).containsEntry("PENDING_VERSION_ATTEMPT", 1).containsEntry("ORPHAN_VERSION", 1)
                .containsEntry("ORPHAN_ARTIFACT", 1).containsEntry("FAILED_TASK_WORKSPACE", 1);
        Files.delete(link);
        RecoveryFixtures.evidence("D18-A-T4", Map.of(
                "case", "cleanup never deletes published, publishing, current-preview or usable versions",
                "protected", Map.of("published", Map.of("versionId", versions.get("published").id(), "publicationId", published, "status", "PUBLISHED"),
                        "publishing", Map.of("versionId", versions.get("publishing").id(), "publicationId", publishing, "status", "REQUESTED"),
                        "currentPreview", versions.get("currentPreview").id(), "usableHistory", versions.get("usableHistory").id(),
                        "failedVersionDiagnostics", failed.id()),
                "protectedTreesByteIdentical", List.of("versions/<id> (except the stale .outcome-777 attempt)", "artifacts/<buildId>", "workspaces/<sourceTask>"),
                "storeRehashAfterSweep", "outcome + artifactBytes verified for all four VERIFIED versions",
                "publicationsAndLatestPointerUnchanged", true,
                "faultInjection", Map.of("plantedLink", "versions/<orphan>/evil -> versions/<published>", "result", "CLEANUP_LINK_REJECTED, not followed"),
                "report", report));
    }

    private static Map<String, String> withoutPending(Map<String, String> digests) {
        var copy = new LinkedHashMap<>(digests);
        copy.keySet().removeIf(path -> path.startsWith(".outcome-") || path.startsWith(".source-"));
        return copy;
    }
}
