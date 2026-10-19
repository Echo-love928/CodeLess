package dev.codeless.api.versions;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermission;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class SharedSnapshotPermissionsTest {
    @TempDir Path temporary;
    final JsonMapper json = JsonMapper.builder().build();
    record Input(Path path, String digest, JsonNode files) {}
    Input input() throws Exception {
        Path root = Files.createTempDirectory(temporary, "input-");
        Path file = root.resolve("src/pages/HomePage.vue");
        Files.createDirectories(file.getParent());
        byte[] bytes = "<template>frozen source</template>".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Files.write(file, bytes);
        var entries = List.of(new SnapshotStore.Entry("src/pages/HomePage.vue", bytes.length, LocalVolumeSnapshotStore.hash(bytes)));
        return new Input(root, LocalVolumeSnapshotStore.hash(json.writeValueAsBytes(entries)), json.valueToTree(entries));
    }
    boolean posix() { return temporary.getFileSystem().supportedFileAttributeViews().contains("posix"); }
    void readerOnly(Path path, boolean directory) throws Exception {
        var permissions = Files.getPosixFilePermissions(path);
        assertThat(permissions).contains(PosixFilePermission.GROUP_READ)
                .doesNotContain(PosixFilePermission.GROUP_WRITE, PosixFilePermission.OTHERS_READ,
                        PosixFilePermission.OTHERS_WRITE, PosixFilePermission.OTHERS_EXECUTE);
        if (directory) assertThat(permissions).contains(PosixFilePermission.GROUP_EXECUTE);
    }
    @Test void unsupportedFilesystemsRejectOperatorOptInBeforeWriting() {
        Path root = temporary.resolve("volume");
        if (!posix()) {
            assertThatThrownBy(() -> new LocalVolumeSnapshotStore(root, true)).isInstanceOf(IllegalArgumentException.class);
            assertThat(Files.exists(root)).isFalse();
        } else assertThatCode(() -> new LocalVolumeSnapshotStore(root, true)).doesNotThrowAnyException();
    }
    @Test void defaultOwnerOnlySnapshotBehaviorIsRetained() throws Exception {
        var source = input(); UUID id = UUID.randomUUID();
        var store = new LocalVolumeSnapshotStore(temporary.resolve("default"));
        var frozen = store.freezeSource(id, source.path(), source.digest(), source.files());
        assertThat(store.readSource(id, source.digest(), "src/pages/HomePage.vue")).contains("frozen source");
        if (posix()) assertThat(Files.getPosixFilePermissions(frozen.directory())).doesNotContain(PosixFilePermission.GROUP_READ);
    }
    @Test void sharedSourceAndFailedReportRemainReadOnlyAndHashChecked() throws Exception {
        if (!posix()) {
            assertThatThrownBy(() -> new LocalVolumeSnapshotStore(temporary.resolve("shared"), true)).isInstanceOf(IllegalArgumentException.class);
            return;
        }
        var source = input(); UUID id = UUID.randomUUID(); Path volume = temporary.resolve("shared");
        var store = new LocalVolumeSnapshotStore(volume, true);
        var frozen = store.freezeSource(id, source.path(), source.digest(), source.files());
        readerOnly(frozen.directory(), true);
        readerOnly(frozen.directory().resolve("src/pages/HomePage.vue"), false);
        var outcome = store.freezeOutcome(id, source.digest(), "FAILED", json.createObjectNode(), "RUNNER_UNAVAILABLE");
        readerOnly(volume.resolve(id.toString()).resolve("outcome"), true);
        readerOnly(volume.resolve(id.toString()).resolve("outcome/report.json"), false);
        assertThat(outcome.report().path("exitCode").isNull()).isTrue();
        assertThat(store.outcome(id, source.digest(), "FAILED")).isEqualTo(outcome);
        Files.writeString(frozen.directory().resolve("src/pages/HomePage.vue"), "tampered");
        assertThatThrownBy(() -> store.source(id, source.digest())).hasMessage("SNAPSHOT_DIGEST_MISMATCH");
    }
    @Test void verifiedFrozenArtifactAndReportAreReadableWithoutGroupWrite() throws Exception {
        if (!posix()) {
            assertThatThrownBy(() -> new LocalVolumeSnapshotStore(temporary.resolve("shared"), true)).isInstanceOf(IllegalArgumentException.class);
            return;
        }
        var source = input(); UUID id = UUID.randomUUID(); Path volume = temporary.resolve("shared");
        var store = new LocalVolumeSnapshotStore(volume, true);
        store.freezeSource(id, source.path(), source.digest(), source.files());
        Path artifact = Files.createDirectory(temporary.resolve("artifact")); byte[] bytes = "<h1>verified</h1>".getBytes();
        Files.write(artifact.resolve("index.html"), bytes);
        var files = List.of(new SnapshotStore.Entry("index.html", bytes.length, LocalVolumeSnapshotStore.hash(bytes)));
        String digest = LocalVolumeSnapshotStore.hash(json.writeValueAsBytes(files)); UUID build = UUID.randomUUID();
        var result = json.valueToTree(Map.of("status", "VERIFIED", "sourceDigest", source.digest(),
                "build", Map.of("id", build, "status", "SUCCEEDED", "exitCode", 0, "artifact", Map.of("directory", artifact.toString(), "digest", digest, "files", files)),
                "verification", Map.of("id", UUID.randomUUID(), "buildId", build, "sourceDigest", source.digest(), "artifactDigest", digest, "status", "PASSED", "workerExitCode", 0)));
        var outcome = store.freezeOutcome(id, source.digest(), "VERIFIED", result, null);
        Path frozen = volume.resolve(id.toString()).resolve("outcome");
        readerOnly(frozen, true); readerOnly(frozen.resolve("artifact/index.html"), false);
        readerOnly(frozen.resolve("manifest.json"), false);
        assertThat(store.outcome(id, source.digest(), "VERIFIED")).isEqualTo(outcome);
        assertThat(store.readArtifact(id, source.digest(), "index.html")).isEqualTo(bytes);
    }
}
