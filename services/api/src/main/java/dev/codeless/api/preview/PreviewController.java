package dev.codeless.api.preview;

import dev.codeless.api.auth.OwnershipGuard;
import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.error.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

@RestController
public class PreviewController {
    private final OwnershipGuard ownership;
    private final JdbcClient jdbc;
    private final String key;
    private final String preview;
    private final String platform;
    private final PreviewReadiness readiness;

    public PreviewController(OwnershipGuard ownership, JdbcClient jdbc, PreviewReadiness readiness,
            @Value("${CODELESS_PREVIEW_SIGNING_KEY:}") String key,
            @Value("${CODELESS_PREVIEW_ORIGIN:}") String preview,
            @Value("${CODELESS_PLATFORM_ORIGIN:}") String platform) {
        this.ownership = ownership; this.jdbc = jdbc; this.readiness = readiness; this.key = key; this.preview = preview; this.platform = platform;
    }

    @PostMapping("/api/v0/applications/{applicationId}/versions/{versionId}/preview-credentials")
    public ResponseEntity<?> issue(@PathVariable UUID applicationId, @PathVariable UUID versionId,
            HttpServletRequest request) {
        ownership.requireApplication(request, applicationId);
        ownership.requireVersion(request, versionId);
        var binding = jdbc.sql("""
                SELECT v.build_id, v.source_digest, b.artifact_digest
                FROM application_versions v
                JOIN builds b ON b.id = v.build_id AND b.version_id = v.id
                JOIN applications a ON a.id = v.application_id
                WHERE v.id = ? AND v.application_id = ? AND v.status = 'VERIFIED'
                  AND a.status = 'ACTIVE' AND b.status = 'SUCCEEDED' AND b.exit_code = 0
                  AND b.completed_at IS NOT NULL AND b.artifact_digest IS NOT NULL
                """).params(versionId, applicationId).query((rs, row) -> new Binding(
                    rs.getObject("build_id", UUID.class), rs.getString("source_digest"), rs.getString("artifact_digest"))).optional();
        // Application/version mismatch is hidden; a real owned draft/build failure remains a conflict.
        boolean matches = jdbc.sql("SELECT EXISTS(SELECT 1 FROM application_versions WHERE id=? AND application_id=?)")
                .params(versionId, applicationId).query(Boolean.class).single();
        if (!matches) throw new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND");
        if (binding.isEmpty()) return failure(HttpStatus.CONFLICT, "PREVIEW_NOT_READY", request);
        URI origin;
        try {
            origin = origin(preview); URI platformOrigin = origin(platform);
            if (!key.matches("[a-f0-9]{64}") || site(origin).equals(site(platformOrigin)))
                return failure(HttpStatus.SERVICE_UNAVAILABLE, "PREVIEW_UNAVAILABLE", request);
        } catch (RuntimeException invalid) {
            return failure(HttpStatus.SERVICE_UNAVAILABLE, "PREVIEW_UNAVAILABLE", request);
        }
        Binding value = binding.get();
        if (!readiness.ready(applicationId, versionId, value.build(), value.source(), value.artifact()))
            return failure(HttpStatus.SERVICE_UNAVAILABLE, "PREVIEW_UNAVAILABLE", request);
        String token;
        try { token = new PreviewCredentials(key, Clock.systemUTC()).issue(applicationId, versionId,
                value.build(), value.source(), value.artifact()); }
        catch (RuntimeException invalid) { return failure(HttpStatus.SERVICE_UNAVAILABLE, "PREVIEW_UNAVAILABLE", request); }
        String versionHost = "v" + versionId.toString().replace("-", "") + "." + origin.getHost();
        String authority = versionHost + (origin.getPort() < 0 ? "" : ":" + origin.getPort());
        String url = origin.getScheme() + "://" + authority + "/__preview/start?credential=" + token;
        return ResponseEntity.ok().header("Cache-Control", "no-store").header("Pragma", "no-cache")
                .body(Map.of("applicationId", applicationId, "versionId", versionId, "url", url,
                        "expiresAt", Instant.now().plusSeconds(120).toString()));
    }

    private static URI origin(String value) {
        URI uri = URI.create(value);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null || !uri.getPath().isEmpty())
            throw new IllegalArgumentException("HTTPS origin required");
        return uri;
    }
    private static String site(URI uri) {
        String[] labels = uri.getHost().toLowerCase(java.util.Locale.ROOT).split("\\.");
        if (labels.length < 3) throw new IllegalArgumentException("Dedicated domain required");
        // Deployment uses dedicated .test or separate two-label registrable domains.
        // Multi-label public suffixes are deliberately unsupported, rather than guessed.
        String suffix = labels[labels.length - 1];
        if (!java.util.Set.of("test", "com", "net", "org", "dev", "app").contains(suffix))
            throw new IllegalArgumentException("Unsupported site suffix");
        return labels[labels.length - 2] + "." + suffix;
    }
    private ResponseEntity<ApiError> failure(HttpStatus status, String code, HttpServletRequest request) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store")
            .body(new ApiError(code, "Preview is unavailable for this version", Instant.now(),
                    request.getRequestURI(), UUID.randomUUID().toString(), Map.of()));
    }
    private record Binding(UUID build, String source, String artifact) {}
}
