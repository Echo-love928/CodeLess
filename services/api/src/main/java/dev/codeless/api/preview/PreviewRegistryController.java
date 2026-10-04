package dev.codeless.api.preview;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.env.Environment;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Private read-only catalogue. No paths, model output, signing secrets or caller registration. */
@RestController
public class PreviewRegistryController {
    private final JdbcClient jdbc;
    private final String key;
    public PreviewRegistryController(JdbcClient jdbc, Environment env) {
        this.jdbc=jdbc; this.key=env.getProperty("CODELESS_PREVIEW_REGISTRY_KEY", "");
    }
    public record Version(UUID applicationId, UUID versionId, UUID taskId, UUID buildId,
                          String sourceDigest, String artifactDigest) {}
    @GetMapping("/internal/preview/versions")
    public ResponseEntity<?> versions(HttpServletRequest request) {
        String supplied=request.getHeader("X-Codeless-Preview-Registry-Key");
        boolean local=false;
        try { local=InetAddress.getByName(request.getRemoteAddr()).isLoopbackAddress(); } catch(Exception invalid) { /* deny */ }
        if (!local || !key.matches("[a-f0-9]{64}") || supplied==null || !MessageDigest.isEqual(
                key.getBytes(StandardCharsets.US_ASCII),supplied.getBytes(StandardCharsets.US_ASCII)))
            return ResponseEntity.status(403).header("Cache-Control","no-store").build();
        var versions=jdbc.sql("""
                SELECT a.id application_id,v.id version_id,t.id task_id,b.id build_id,v.source_digest,b.artifact_digest
                FROM application_versions v JOIN applications a ON a.id=v.application_id
                JOIN builds b ON b.id=v.build_id AND b.version_id=v.id
                JOIN generation_tasks t ON t.id=b.task_id AND t.application_id=a.id
                WHERE a.status='ACTIVE' AND v.status='VERIFIED' AND b.status='SUCCEEDED'
                  AND b.exit_code=0 AND b.completed_at IS NOT NULL AND b.artifact_digest IS NOT NULL
                  AND t.status='READY' AND t.queue_state='FINISHED'
                ORDER BY b.completed_at DESC,v.id LIMIT 1001
                """).query((rs,n)->new Version(rs.getObject("application_id",UUID.class),rs.getObject("version_id",UUID.class),
                    rs.getObject("task_id",UUID.class),rs.getObject("build_id",UUID.class),rs.getString("source_digest"),rs.getString("artifact_digest"))).list();
        if(versions.size()>1000) return ResponseEntity.status(503).header("Cache-Control","no-store").build();
        return ResponseEntity.ok().header("Cache-Control","no-store").body(Map.of("versions",versions));
    }
}
