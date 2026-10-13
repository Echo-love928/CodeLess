package dev.codeless.api.mapping;

import dev.codeless.api.auth.*;
import dev.codeless.api.data.ArtifactRepository;
import dev.codeless.api.edit.*;
import dev.codeless.api.versions.*;
import dev.codeless.api.error.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
public class ComponentController {
    private final OwnershipGuard ownership;private final ArtifactRepository versions;private final SnapshotStore snapshots;private final EditTaskService edits;
    public ComponentController(OwnershipGuard ownership,ArtifactRepository versions,SnapshotStore snapshots,EditTaskService edits) {
        this.ownership=ownership;this.versions=versions;this.snapshots=snapshots;this.edits=edits;
    }
    private JsonNode mapping(UUID version,HttpServletRequest request) {
        ownership.requireVersion(request,version);
        var value=versions.findVersion(version).orElseThrow();
        if(!"VERIFIED".equals(value.status().name())) throw new AuthFailure(HttpStatus.CONFLICT,"MAPPING_UNAVAILABLE");
        return snapshots.componentMapping(version,value.sourceDigest());
    }
    @GetMapping("/api/v0/versions/{versionId}/component-mapping")
    public ResponseEntity<JsonNode> get(@PathVariable String versionId,HttpServletRequest request) {return ok(mapping(uuid(versionId),request));}
    @PostMapping("/api/v0/versions/{versionId}/component-selection")
    public ResponseEntity<JsonNode> select(@PathVariable String versionId,@RequestBody JsonNode body,HttpServletRequest request) {
        selection(body);var manifest=mapping(uuid(versionId),request);
        return ok(ComponentMapping.select(manifest,uuid(body.path("versionId").asText()),body.path("sourceDigest").asText(),body.path("componentId").asText()));
    }
    @PostMapping("/api/v0/applications/{applicationId}/component-edits")
    public ResponseEntity<EditTaskService.View> edit(@PathVariable String applicationId,@RequestBody JsonNode body,
            @RequestHeader(name="Idempotency-Key",required=false) String key,HttpServletRequest request) {
        if(body==null || !body.isObject() || !Set.of("baseVersionId","prompt","selection").equals(body.propertyNames()) || !body.path("prompt").isTextual()) invalid();
        selection(body.path("selection"));String prompt=body.path("prompt").asText().strip();
        if(prompt.isEmpty() || prompt.codePointCount(0,prompt.length())>8000 || key!=null && !key.matches("[A-Za-z0-9._:-]{1,128}")) invalid();
        var select=body.path("selection");
        return ResponseEntity.accepted().header("Cache-Control","no-store").body(edits.create(ownership.userId(request),uuid(applicationId),
                uuid(body.path("baseVersionId").asText()),prompt,new EditMetadata.Source("COMPONENT",null,select.path("componentId").asText(),
                uuid(select.path("versionId").asText()),select.path("sourceDigest").asText(),null),key));
    }
    private static void selection(JsonNode value) {
        if(value==null || !value.isObject() || !Set.of("versionId","sourceDigest","componentId").equals(value.propertyNames())
                || !value.path("componentId").isTextual() || !ComponentMapping.id(value.path("componentId").asText())
                || !value.path("sourceDigest").isTextual() || !value.path("sourceDigest").asText().matches("sha256:[a-f0-9]{64}")) invalid();
        uuid(value.path("versionId").asText());
    }
    private static UUID uuid(String value) {
        try {var id=UUID.fromString(value);if(!id.toString().equals(value)) invalid();return id;}
        catch(IllegalArgumentException failure) {throw new AuthFailure(HttpStatus.BAD_REQUEST,"INVALID_SELECTION");}
    }
    private static void invalid() {throw new AuthFailure(HttpStatus.BAD_REQUEST,"INVALID_SELECTION");}
    private static <T> ResponseEntity<T> ok(T value) {return ResponseEntity.ok().header("Cache-Control","no-store").body(value);}
    @ExceptionHandler(SnapshotFailure.class)
    public ResponseEntity<ApiError> failure(SnapshotFailure failure,HttpServletRequest request) {
        var status="MAPPING_UNAVAILABLE".equals(failure.getMessage())?HttpStatus.CONFLICT:HttpStatus.SERVICE_UNAVAILABLE;
        return ResponseEntity.status(status).header("Cache-Control","no-store").body(new ApiError(failure.getMessage(),"Component mapping cannot be read",Instant.now(),request.getRequestURI(),UUID.randomUUID().toString(),Map.of()));
    }
    @ExceptionHandler(EditConflict.class)
    public ResponseEntity<ApiError> conflict(EditConflict failure,HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.CONFLICT).header("Cache-Control","no-store").body(new ApiError(failure.code(),
                "Edit base is stale; review the current version",Instant.now(),request.getRequestURI(),UUID.randomUUID().toString(),failure.details()));
    }
}
