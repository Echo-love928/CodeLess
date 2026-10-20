package dev.codeless.api.export;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.auth.OwnershipGuard;
import dev.codeless.api.error.ApiError;
import dev.codeless.api.versions.SnapshotFailure;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** Owner-only source download of one VERIFIED immutable version. GET only; no write or path parameter exists. */
@RestController
@RequestMapping("/api/v0")
public class SourceExportController {
    private final OwnershipGuard ownership;
    private final SourceExportService exports;
    public SourceExportController(OwnershipGuard ownership, SourceExportService exports) {this.ownership = ownership; this.exports = exports;}

    @GetMapping("/versions/{versionId}/export")
    public ResponseEntity<StreamingResponseBody> export(@PathVariable String versionId, HttpServletRequest request) {
        var export = exports.prepare(ownership.userId(request), uuid(versionId));
        var manifest = export.manifest();
        StreamingResponseBody body = out -> ExportArchive.write(out, export.root(), export.entries(), export.modified());
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + export.root() + ".zip\"")
                .header("X-CodeLess-Version-Id", manifest.versionId().toString())
                .header("X-CodeLess-Source-Digest", manifest.sourceDigest())
                .header("X-CodeLess-Artifact-Digest", manifest.artifactDigest())
                .header("X-CodeLess-Content-Digest", manifest.contentDigest())
                .contentType(MediaType.parseMediaType("application/zip")).body(body);
    }

    private static UUID uuid(String value) {
        try {
            var id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
            return id;
        } catch (IllegalArgumentException invalid) {throw new AuthFailure(HttpStatus.BAD_REQUEST, "INVALID_REQUEST");}
    }

    private static ResponseEntity<ApiError> error(HttpStatus status, String code, String message, HttpServletRequest request) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.APPLICATION_JSON)
                .body(new ApiError(code, message, Instant.now(), request.getRequestURI(), UUID.randomUUID().toString(), Map.of()));
    }
    @ExceptionHandler(AuthFailure.class)
    public ResponseEntity<ApiError> rejected(AuthFailure failure, HttpServletRequest request) {
        return error(failure.status(), failure.code(), "Source export rejected", request);
    }
    /** A missing snapshot is a state conflict; any other snapshot failure is a server-side integrity problem. */
    @ExceptionHandler(SnapshotFailure.class)
    public ResponseEntity<ApiError> snapshot(SnapshotFailure failure, HttpServletRequest request) {
        return error("SNAPSHOT_UNAVAILABLE".equals(failure.getMessage()) ? HttpStatus.CONFLICT : HttpStatus.SERVICE_UNAVAILABLE,
                failure.getMessage(), "Version snapshot cannot be exported", request);
    }
    @ExceptionHandler(ExportFailure.class)
    public ResponseEntity<ApiError> export(ExportFailure failure, HttpServletRequest request) {
        return error(HttpStatus.SERVICE_UNAVAILABLE, failure.getMessage(), "Source package cannot be produced", request);
    }
}
