package dev.codeless.api.versions;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.auth.OwnershipGuard;
import dev.codeless.api.apps.ApplicationService.VersionView;
import dev.codeless.api.data.ArtifactRepository;
import dev.codeless.api.data.PlatformModels.Version;
import dev.codeless.api.error.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v0")
public class VersionController {
    private final OwnershipGuard ownership;
    private final ArtifactRepository artifacts;
    private final JdbcClient jdbc;
    private final SnapshotStore snapshots;
    private final VersionRestoreService restore;
    public VersionController(OwnershipGuard ownership, ArtifactRepository artifacts, JdbcClient jdbc, SnapshotStore snapshots,
                             VersionRestoreService restore) {
        this.ownership=ownership; this.artifacts=artifacts; this.jdbc=jdbc; this.snapshots=snapshots; this.restore=restore;
    }
    public record Page(List<VersionView> items, int page, int size, long total, UUID latestReadyVersionId) {}
    public record FilesView(UUID versionId, String sourceDigest, List<SnapshotStore.Entry> files) {}
    public record FileView(UUID versionId, String sourceDigest, String path, long bytes, String digest, String content) {}
    public record SnapshotView(UUID versionId, String status, String sourceDigest, List<SnapshotStore.Entry> files,
                               SnapshotStore.Outcome validation) {}
    private <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().header("Cache-Control","no-store").header("X-Content-Type-Options","nosniff")
                .contentType(MediaType.APPLICATION_JSON).body(body);
    }
    private Version version(UUID id, HttpServletRequest request) {
        ownership.requireVersion(request,id);
        return artifacts.findVersion(id).orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND"));
    }
    @PostMapping("/applications/{applicationId}/versions/{versionId}/restore")
    public ResponseEntity<VersionRestoreService.View> restore(@PathVariable String applicationId, @PathVariable String versionId,
            @RequestBody tools.jackson.databind.JsonNode body, HttpServletRequest request) {
        if(body==null || !body.isObject() || !Set.of("expectedCurrentVersionId").equals(body.propertyNames())
                || !body.path("expectedCurrentVersionId").isTextual())
            throw new AuthFailure(HttpStatus.BAD_REQUEST,"INVALID_REQUEST");
        return ok(restore.restore(ownership.userId(request),uuid(applicationId),uuid(versionId),
                uuid(body.path("expectedCurrentVersionId").asText())));
    }
    private static UUID uuid(String value) {
        try {
            var id=UUID.fromString(value);
            if(!id.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
            return id;
        } catch(IllegalArgumentException failure) {throw new AuthFailure(HttpStatus.BAD_REQUEST,"INVALID_REQUEST");}
    }
    @GetMapping("/applications/{applicationId}/versions")
    public ResponseEntity<Page> list(@PathVariable UUID applicationId,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size,
            @RequestParam(required=false) String status, HttpServletRequest request) {
        ownership.requireApplication(request,applicationId);
        if(page<0 || size<1 || size>100 || (long)page*size>Integer.MAX_VALUE
                || status!=null && !Set.of("DRAFT","VERIFIED","FAILED").contains(status))
            throw new AuthFailure(HttpStatus.BAD_REQUEST,"INVALID_REQUEST");
        String filter=status==null ? "" : " AND status=:status";
        var count=jdbc.sql("SELECT count(*) FROM application_versions WHERE application_id=:app"+filter).param("app",applicationId);
        var select=jdbc.sql("SELECT * FROM application_versions WHERE application_id=:app"+filter+" ORDER BY number DESC LIMIT :size OFFSET :offset")
                .param("app",applicationId).param("size",size).param("offset",(long)page*size);
        if(status!=null) {count.param("status",status);select.param("status",status);}
        var items=select.query((rs,n)->new VersionView(rs.getObject("id",UUID.class),rs.getObject("application_id",UUID.class),rs.getInt("number"),
                rs.getString("source_digest"),rs.getString("status"),rs.getObject("build_id",UUID.class),rs.getObject("created_at",OffsetDateTime.class),
                rs.getObject("source_task_id",UUID.class))).list();
        UUID latest=jdbc.sql("SELECT latest_ready_version_id FROM applications WHERE id=?").param(applicationId)
                .query((rs,n)->Optional.ofNullable(rs.getObject(1,UUID.class))).single().orElse(null);
        return ok(new Page(items,page,size,count.query(Long.class).single(),latest));
    }
    @GetMapping("/versions/{versionId}/files")
    public ResponseEntity<FilesView> files(@PathVariable UUID versionId,HttpServletRequest request) {
        var version=version(versionId,request);
        var source=snapshots.source(versionId,version.sourceDigest());
        return ok(new FilesView(versionId,version.sourceDigest(),source.manifest().files()));
    }
    @GetMapping("/versions/{versionId}/files/content")
    public ResponseEntity<FileView> file(@PathVariable UUID versionId,@RequestParam String path,HttpServletRequest request) {
        var version=version(versionId,request);
        String content=snapshots.readSource(versionId,version.sourceDigest(),path);
        var bytes=content.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        return ok(new FileView(versionId,version.sourceDigest(),path,bytes.length,LocalVolumeSnapshotStore.hash(bytes),content));
    }
    @GetMapping("/versions/{versionId}/snapshot")
    public ResponseEntity<SnapshotView> snapshot(@PathVariable UUID versionId,HttpServletRequest request) {
        var version=version(versionId,request);
        var source=snapshots.source(versionId,version.sourceDigest());
        var outcome=version.status().name().equals("DRAFT") ? null : snapshots.outcome(versionId,version.sourceDigest(),version.status().name());
        return ok(new SnapshotView(versionId,version.status().name(),version.sourceDigest(),source.manifest().files(),outcome));
    }
    @ExceptionHandler(SnapshotFailure.class)
    public ResponseEntity<ApiError> snapshotFailure(SnapshotFailure failure,HttpServletRequest request) {
        HttpStatus status=switch(failure.getMessage()) {
            case "SNAPSHOT_PATH_REJECTED" -> HttpStatus.BAD_REQUEST;
            case "SNAPSHOT_FILE_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "SNAPSHOT_UNAVAILABLE" -> HttpStatus.CONFLICT;
            default -> HttpStatus.SERVICE_UNAVAILABLE;
        };
        return ResponseEntity.status(status).header("Cache-Control","no-store").body(new ApiError(failure.getMessage(),
                "Version snapshot cannot be read",Instant.now(),request.getRequestURI(),UUID.randomUUID().toString(),Map.of()));
    }
}
