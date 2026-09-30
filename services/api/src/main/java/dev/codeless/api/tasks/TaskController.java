package dev.codeless.api.tasks;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.auth.OwnershipGuard;
import dev.codeless.api.data.PlatformModels.Event;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/v0/tasks")
public class TaskController {
    private final TaskQueueService tasks;
    private final OwnershipGuard ownership;

    public TaskController(TaskQueueService tasks, OwnershipGuard ownership) {
        this.tasks = tasks;
        this.ownership = ownership;
    }

    @PostMapping
    public ResponseEntity<TaskQueueService.TaskView> create(@RequestBody JsonNode body,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            HttpServletRequest request) {
        if (body == null || !body.isObject()) invalid();
        body.propertyNames().forEach(field -> { if (!Set.of("applicationId", "prompt").contains(field)) invalid(); });
        JsonNode app = body.get("applicationId");
        JsonNode promptNode = body.get("prompt");
        if (app == null || !app.isTextual() || promptNode == null || !promptNode.isTextual()) invalid();
        String prompt = promptNode.asText().strip();
        if (prompt.isEmpty() || prompt.codePointCount(0, prompt.length()) > 8000) invalid();
        if (key != null && !key.matches("[A-Za-z0-9._:-]{1,128}")) invalid();
        return ResponseEntity.accepted().body(tasks.create(
                ownership.userId(request), uuid(app.asText()), prompt, key));
    }

    @GetMapping("/{taskId}")
    public TaskQueueService.TaskView get(@PathVariable String taskId, HttpServletRequest request) {
        return tasks.find(ownership.userId(request), uuid(taskId))
                .orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND"));
    }

    @GetMapping("/{taskId}/events")
    public List<Event> events(@PathVariable String taskId, HttpServletRequest request) {
        return tasks.events(ownership.userId(request), uuid(taskId));
    }

    @PostMapping("/{taskId}/cancel")
    public TaskQueueService.TaskView cancel(@PathVariable String taskId, HttpServletRequest request) {
        return tasks.cancel(ownership.userId(request), uuid(taskId));
    }

    private static UUID uuid(String value) {
        try { return UUID.fromString(value); }
        catch (IllegalArgumentException exception) { throw new AuthFailure(HttpStatus.BAD_REQUEST, "INVALID_REQUEST"); }
    }

    private static void invalid() { throw new AuthFailure(HttpStatus.BAD_REQUEST, "INVALID_REQUEST"); }
}
