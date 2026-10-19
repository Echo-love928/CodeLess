package dev.codeless.api.deploy;

import dev.codeless.api.auth.*;
import dev.codeless.api.versions.SnapshotFailure;
import dev.codeless.api.error.ApiError;
import java.time.Instant;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/v0")
public class PublicationController {
    private final OwnershipGuard ownership;
    private final PublicationService service;
    public PublicationController(OwnershipGuard ownership,PublicationService service) {this.ownership=ownership;this.service=service;}
    private <T> ResponseEntity<T> response(HttpStatus status,T body) {
        return ResponseEntity.status(status).header("Cache-Control","no-store").header("X-Content-Type-Options","nosniff").body(body);
    }
    @PostMapping("/publications")
    public ResponseEntity<PublicationService.View> publish(@RequestBody JsonNode body,@RequestHeader(value="Idempotency-Key",required=false) String key,HttpServletRequest request) {
        if(body==null || !body.isObject() || !body.propertyNames().equals(Set.of("applicationId","versionId","artifactDigest"))
                || !body.path("applicationId").isTextual() || !body.path("versionId").isTextual() || !body.path("artifactDigest").isTextual()
                || !body.path("artifactDigest").asText().matches("sha256:[a-f0-9]{64}") || key==null || !key.matches("[A-Za-z0-9_-]{16,128}"))
            throw new AuthFailure(HttpStatus.BAD_REQUEST,"INVALID_REQUEST");
        return response(HttpStatus.ACCEPTED,service.request(ownership.userId(request),uuid(body.path("applicationId").asText()),
                uuid(body.path("versionId").asText()),body.path("artifactDigest").asText(),key));
    }
    @GetMapping("/publications/{publicationId}")
    public ResponseEntity<PublicationService.View> get(@PathVariable String publicationId,HttpServletRequest request) {
        return response(HttpStatus.OK,service.get(ownership.userId(request),uuid(publicationId)));
    }
    @GetMapping("/publications/{publicationId}/deployment")
    public ResponseEntity<PublicationService.Deployment> deployment(@PathVariable String publicationId,HttpServletRequest request) {
        return response(HttpStatus.OK,service.deployment(ownership.userId(request),uuid(publicationId)));
    }
    @GetMapping("/applications/{applicationId}/publications")
    public ResponseEntity<PublicationService.Page> list(@PathVariable String applicationId,HttpServletRequest request) {
        return response(HttpStatus.OK,service.list(ownership.userId(request),uuid(applicationId)));
    }
    private static UUID uuid(String value) {
        try {var id=UUID.fromString(value);if(!id.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();return id;}
        catch(IllegalArgumentException invalid) {throw new AuthFailure(HttpStatus.BAD_REQUEST,"INVALID_REQUEST");}
    }
    @ExceptionHandler(SnapshotFailure.class)
    public ResponseEntity<ApiError> snapshot(SnapshotFailure failure,HttpServletRequest request) {
        return response("SNAPSHOT_UNAVAILABLE".equals(failure.getMessage())?HttpStatus.CONFLICT:HttpStatus.SERVICE_UNAVAILABLE,
                new ApiError(failure.getMessage(),"Version snapshot unavailable",Instant.now(),request.getRequestURI(),UUID.randomUUID().toString(),Map.of()));
    }
    @ExceptionHandler(AuthFailure.class)
    public ResponseEntity<ApiError> failure(AuthFailure failure,HttpServletRequest request) {
        return response(failure.status(),new ApiError(failure.code(),"Publication request rejected",Instant.now(),request.getRequestURI(),UUID.randomUUID().toString(),Map.of()));
    }
}
