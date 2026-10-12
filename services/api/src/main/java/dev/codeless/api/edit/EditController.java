package dev.codeless.api.edit;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.auth.OwnershipGuard;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
public class EditController {
    private final EditTaskService edits;
    private final OwnershipGuard ownership;
    public EditController(EditTaskService edits, OwnershipGuard ownership) {this.edits=edits;this.ownership=ownership;}
    @PostMapping("/api/v0/applications/{applicationId}/edits")
    public ResponseEntity<EditTaskService.View> create(@PathVariable String applicationId, @RequestBody JsonNode body,
            @RequestHeader(name="Idempotency-Key",required=false) String key, HttpServletRequest request) {
        if(body==null || !body.isObject() || !Set.of("baseVersionId","prompt","source").equals(body.propertyNames())) invalid();
        if(!body.path("baseVersionId").isTextual() || !body.path("prompt").isTextual()) invalid();
        String prompt=body.path("prompt").asText().strip();
        if(prompt.isEmpty() || prompt.codePointCount(0,prompt.length())>8000) invalid();
        JsonNode source=body.path("source");
        if(!source.isObject() || !source.has("type") || !source.path("type").isTextual() || !"CHAT".equals(source.path("type").asText())
                || !Set.of("type","messageId").containsAll(source.propertyNames())) invalid();
        String message=null;
        if(source.has("messageId")) {
            if(!source.path("messageId").isTextual() || !source.path("messageId").asText().matches("[A-Za-z0-9._:-]{1,128}")) invalid();
            message=source.path("messageId").asText();
        }
        if(key!=null && !key.matches("[A-Za-z0-9._:-]{1,128}")) invalid();
        return ResponseEntity.accepted().header("Cache-Control","no-store").body(edits.create(ownership.userId(request),
                uuid(applicationId),uuid(body.path("baseVersionId").asText()),prompt,new EditMetadata.Source("CHAT",message),key));
    }
    @GetMapping("/api/v0/tasks/{taskId}/edit")
    public ResponseEntity<EditTaskService.View> get(@PathVariable String taskId,HttpServletRequest request) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(edits.get(ownership.userId(request),uuid(taskId)));
    }
    private static UUID uuid(String text) {
        try { UUID id=UUID.fromString(text); if(!id.toString().equalsIgnoreCase(text)) invalid(); return id; }
        catch(IllegalArgumentException failure) {throw new AuthFailure(HttpStatus.BAD_REQUEST,"INVALID_REQUEST");}
    }
    @ExceptionHandler(EditConflict.class)
    public ResponseEntity<dev.codeless.api.error.ApiError> conflict(EditConflict failure,HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.CONFLICT).header("Cache-Control","no-store").body(
                new dev.codeless.api.error.ApiError(failure.code(),"Edit base is stale; review the current version before resubmitting",
                        java.time.Instant.now(),request.getRequestURI(),UUID.randomUUID().toString(),failure.details()));
    }
    private static void invalid() {throw new AuthFailure(HttpStatus.BAD_REQUEST,"INVALID_REQUEST");}
}
