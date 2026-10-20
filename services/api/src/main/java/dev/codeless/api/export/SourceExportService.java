package dev.codeless.api.export;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.versions.LocalVolumeSnapshotStore;
import dev.codeless.api.versions.SnapshotFailure;
import dev.codeless.api.versions.SnapshotStore;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * Builds the owner's source package for one VERIFIED version: frozen business source, the controlled template's fixed
 * configuration and lockfile, generated run instructions and a reproducibility manifest. Every input is read and
 * hash-checked before the first archive byte, so a rejection is an HTTP error rather than a truncated download.
 */
@Service
public class SourceExportService {
    public static final String PROTOCOL = "codeless-source-export/v1", MANIFEST = "codeless-export.json", README = "README.md";
    private static final Pattern SOURCE = Pattern.compile("src/(?:pages|components)/[A-Za-z][A-Za-z0-9_-]*\\.vue|src/data/[A-Za-z][A-Za-z0-9_-]*\\.ts");
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{([A-Z][A-Z_]*)\\}\\}");

    public record FileEntry(String path, long bytes, String digest, String origin) {}
    public record Manifest(String protocol, UUID applicationId, UUID versionId, int versionNumber, String status, UUID buildId,
                           String sourceDigest, String artifactDigest, String reportDigest, String templateDigest,
                           String contentDigest, Map<String, String> toolchain, List<FileEntry> files) {}
    public record Export(String root, Manifest manifest, List<ExportArchive.Entry> entries, LocalDateTime modified) {}
    /** Server-verified identity of the exported version; never taken from the request beyond versionId. */
    record Identity(UUID applicationId, UUID versionId, int number, UUID buildId, String sourceDigest, String artifactDigest,
                    String reportDigest, OffsetDateTime createdAt) {}
    private record Version(UUID applicationId, int number, String status, String sourceDigest, UUID buildId, OffsetDateTime createdAt) {}

    private final JdbcClient jdbc;
    private final SnapshotStore snapshots;
    private final ExportTemplate template;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    public SourceExportService(JdbcClient jdbc, SnapshotStore snapshots, ExportTemplate template) {
        this.jdbc = jdbc; this.snapshots = snapshots; this.template = template;
    }

    public Export prepare(UUID owner, UUID versionId) {
        // Owner join: another owner (including ADMIN) and a missing version are indistinguishable 404s.
        var v = jdbc.sql("""
                SELECT v.application_id, v.number, v.status, v.source_digest, v.build_id, v.created_at
                FROM application_versions v JOIN applications a ON a.id = v.application_id
                WHERE v.id = ? AND a.owner_id = ?
                """).params(versionId, owner).query((rs, n) -> new Version(rs.getObject(1, UUID.class), rs.getInt(2), rs.getString(3),
                rs.getString(4), rs.getObject(5, UUID.class), rs.getObject(6, OffsetDateTime.class))).optional()
                .orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND"));
        if (!"VERIFIED".equals(v.status()) || v.buildId() == null) throw unavailable();
        String artifactDigest = jdbc.sql("""
                SELECT artifact_digest FROM builds
                WHERE id = ? AND version_id = ? AND status = 'SUCCEEDED' AND exit_code = 0 AND completed_at IS NOT NULL
                """).params(v.buildId(), versionId).query(String.class).optional().orElseThrow(SourceExportService::unavailable);
        var outcome = snapshots.outcome(versionId, v.sourceDigest(), "VERIFIED");
        var report = outcome.report();
        if (!artifactDigest.equals(outcome.artifactDigest()) || !v.buildId().toString().equals(report.path("buildId").asText())
                || !"SUCCEEDED".equals(report.path("buildStatus").asText()) || !report.path("exitCode").isIntegralNumber()
                || report.path("exitCode").asInt() != 0 || !"PASSED".equals(report.path("verificationStatus").asText()))
            throw new SnapshotFailure("SNAPSHOT_REPORT_INVALID");
        var source = snapshots.sourceBytes(versionId, v.sourceDigest());
        if (!ExportTemplate.digest(JSON, source).equals(v.sourceDigest())) throw new SnapshotFailure("SNAPSHOT_DIGEST_MISMATCH");
        return compose(new Identity(v.applicationId(), versionId, v.number(), v.buildId(), v.sourceDigest(), artifactDigest,
                outcome.reportDigest(), v.createdAt()), source, template.load());
    }

    /** Pure packaging step: template, verified source overlay, README and manifest, checked against the allowlist. */
    static Export compose(Identity v, Map<String, byte[]> source, ExportTemplate.Loaded fixed) {
        UUID versionId = v.versionId();
        String artifactDigest = v.artifactDigest();
        var files = new TreeMap<String, byte[]>();
        var origins = new HashMap<String, String>();
        fixed.fixed().forEach((path, bytes) -> add(files, origins, path, bytes, "TEMPLATE"));
        for (var entry : source.entrySet()) {
            if (!SOURCE.matcher(entry.getKey()).matches() || ExportTemplate.FIXED.contains(entry.getKey()))
                throw new ExportFailure("EXPORT_PATH_REJECTED");
            add(files, origins, entry.getKey(), entry.getValue(), "VERSION_SOURCE");
        }
        fixed.defaults().forEach((path, bytes) -> {if (!source.containsKey(path)) add(files, origins, path, bytes, "TEMPLATE_DEFAULT");});
        String root = "codeless-" + versionId;
        add(files, origins, README, readme(fixed, Map.of("APPLICATION_ID", v.applicationId().toString(),
                "VERSION_ID", versionId.toString(), "VERSION_NUMBER", Integer.toString(v.number()),
                "SOURCE_DIGEST", v.sourceDigest(), "ARTIFACT_DIGEST", artifactDigest, "TEMPLATE_DIGEST", fixed.digest(),
                "NODE_VERSION", fixed.node(), "PNPM_VERSION", fixed.pnpm(), "ROOT_FOLDER", root)), "README");

        var listed = files.entrySet().stream().map(e -> new FileEntry(e.getKey(), e.getValue().length,
                LocalVolumeSnapshotStore.hash(e.getValue()), origins.get(e.getKey()))).toList();
        var toolchain = new LinkedHashMap<String, String>();
        toolchain.put("node", fixed.node()); toolchain.put("pnpm", fixed.pnpm());
        var manifest = new Manifest(PROTOCOL, v.applicationId(), versionId, v.number(), "VERIFIED", v.buildId(), v.sourceDigest(),
                artifactDigest, v.reportDigest(), fixed.digest(), ExportTemplate.digest(JSON, files),
                Collections.unmodifiableMap(toolchain), listed);
        byte[] manifestBytes = (JSON.writerWithDefaultPrettyPrinter().writeValueAsString(manifest) + "\n").getBytes(StandardCharsets.UTF_8);
        if (manifestBytes.length > 64 * 1024) throw new ExportFailure("EXPORT_LIMIT_EXCEEDED");
        add(files, origins, MANIFEST, manifestBytes, "MANIFEST");

        var entries = new ArrayList<ExportArchive.Entry>();
        files.forEach((path, bytes) -> entries.add(new ExportArchive.Entry(path, bytes)));
        // Final allowlist gate, independent of how the member set was assembled.
        for (var entry : entries)
            if (!ExportTemplate.FIXED.contains(entry.path()) && !SOURCE.matcher(entry.path()).matches()
                    && !Set.of(README, MANIFEST).contains(entry.path()))
                throw new ExportFailure("EXPORT_PATH_REJECTED");
        ExportArchive.check(root, entries);
        return new Export(root, manifest, List.copyOf(entries), v.createdAt().withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime());
    }

    private static void add(Map<String, byte[]> files, Map<String, String> origins, String path, byte[] bytes, String origin) {
        if (files.putIfAbsent(path, bytes) != null) throw new ExportFailure("EXPORT_PATH_REJECTED");
        origins.put(path, origin);
    }

    private static AuthFailure unavailable() { return new AuthFailure(HttpStatus.CONFLICT, "EXPORT_VERSION_UNAVAILABLE"); }

    /** Only known server-generated values; an unknown or missing required placeholder rejects the template. */
    static byte[] readme(ExportTemplate.Loaded fixed, Map<String, String> values) {
        Matcher matcher = PLACEHOLDER.matcher(fixed.readme());
        var used = new HashSet<String>();
        var result = new StringBuilder();
        while (matcher.find()) {
            String value = values.get(matcher.group(1));
            if (value == null) throw new ExportFailure("EXPORT_TEMPLATE_INVALID");
            used.add(matcher.group(1));
            matcher.appendReplacement(result, Matcher.quoteReplacement(value));
        }
        matcher.appendTail(result);
        if (!used.containsAll(Set.of("VERSION_ID", "SOURCE_DIGEST", "PNPM_VERSION"))) throw new ExportFailure("EXPORT_TEMPLATE_INVALID");
        byte[] bytes = result.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > ExportTemplate.MAX_README_BYTES) throw new ExportFailure("EXPORT_LIMIT_EXCEEDED");
        return bytes;
    }
}
