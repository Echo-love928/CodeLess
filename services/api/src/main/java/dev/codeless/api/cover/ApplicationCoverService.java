package dev.codeless.api.cover;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.versions.SnapshotStore;
import dev.codeless.api.versions.LocalVolumeSnapshotStore;
import java.nio.ByteBuffer;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.UUID;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/** Owner-only project thumbnails from existing verified browser evidence. No capture job or model request. */
@Service
public class ApplicationCoverService {
    private record Binding(UUID build, String source, String artifact) {}
    private final JdbcClient jdbc;
    private final SnapshotStore snapshots;
    private final Path evidenceRoot;

    public ApplicationCoverService(JdbcClient jdbc, SnapshotStore snapshots, Environment env) {
        this.jdbc = jdbc;
        this.snapshots = snapshots;
        evidenceRoot = Path.of(env.getProperty("codeless.agent.private-root", ".local-data/agent"))
                .toAbsolutePath().normalize().resolve("evidence");
    }

    public byte[] image(UUID owner, UUID application, UUID version) {
        // Ownership and the exact immutable version/build are checked before any private filesystem read.
        var binding = jdbc.sql("""
                SELECT b.id, v.source_digest, b.artifact_digest FROM applications a
                JOIN application_versions v ON v.application_id = a.id
                JOIN builds b ON b.id = v.build_id AND b.version_id = v.id
                WHERE a.id = ? AND a.owner_id = ? AND a.status = 'ACTIVE' AND v.id = ?
                  AND v.status = 'VERIFIED' AND b.status = 'SUCCEEDED' AND b.exit_code = 0
                  AND b.completed_at IS NOT NULL
                """).params(application, owner, version).query((rs, n) -> new Binding(
                        rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3))).optional()
                .orElseThrow(CoverStore::missing);
        try {
            var outcome = snapshots.outcome(version, binding.source(), "VERIFIED");
            if (!binding.artifact().equals(outcome.artifactDigest())
                    || !binding.build().toString().equals(outcome.report().path("buildId").asText())) throw CoverStore.unavailable();
            UUID verification = UUID.fromString(outcome.report().path("verificationId").asText());
            Path directory = evidenceRoot.resolve(verification.toString());
            var result = CoverStore.JSON.readTree(CoverStore.read(directory.resolve("result.json"), 2 * 1024 * 1024));
            var screenshot = result.path("screenshot");
            Path image = directory.resolve("page.png");
            if (!verification.toString().equals(result.path("id").asText())
                    || !binding.build().toString().equals(result.path("buildId").asText())
                    || !binding.source().equals(result.path("sourceDigest").asText())
                    || !binding.artifact().equals(result.path("artifactDigest").asText())
                    || !"PASSED".equals(result.path("status").asText())
                    || !result.path("workerExitCode").isIntegralNumber() || result.path("workerExitCode").asInt() != 0
                    || !result.path("cleanup").path("browserClosed").asBoolean()
                    || result.path("timedOut").asBoolean(true) || !result.path("failure").isNull()
                    || !image.equals(Path.of(screenshot.path("path").asText()).toAbsolutePath().normalize())) throw CoverStore.unavailable();
            byte[] png = CoverStore.read(image, 6 * 1024 * 1024);
            if (png.length < 24 || !Arrays.equals(Arrays.copyOf(png, 8), new byte[]{(byte)137,80,78,71,13,10,26,10})
                    || !LocalVolumeSnapshotStore.hash(png).equals(screenshot.path("digest").asText())
                    || png.length != screenshot.path("bytes").asInt()
                    || screenshot.path("width").asInt() != 1280 || screenshot.path("height").asInt() != 720
                    || ByteBuffer.wrap(png, 16, 8).getInt() != 1280 || ByteBuffer.wrap(png, 20, 4).getInt() != 720)
                throw CoverStore.unavailable();
            return png;
        } catch (AuthFailure failure) { throw failure; }
        catch (Exception failure) { throw CoverStore.unavailable(); }
    }
}
