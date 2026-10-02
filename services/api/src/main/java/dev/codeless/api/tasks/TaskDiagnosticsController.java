package dev.codeless.api.tasks;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.auth.OwnershipGuard;
import dev.codeless.api.data.TaskDiagnosticsService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletRequest;

@RestController
public class TaskDiagnosticsController {
    private final TaskDiagnosticsService diagnostics;
    private final OwnershipGuard ownership;

    public TaskDiagnosticsController(TaskDiagnosticsService diagnostics, OwnershipGuard ownership) {
        this.diagnostics = diagnostics; this.ownership = ownership;
    }

    @GetMapping("/api/v0/tasks/{taskId}/diagnostics")
    public ResponseEntity<TaskDiagnosticsService.Diagnostics> get(@PathVariable String taskId, HttpServletRequest request) {
        UUID id;
        try { id = UUID.fromString(taskId); }
        catch (IllegalArgumentException exception) { throw new AuthFailure(HttpStatus.BAD_REQUEST, "INVALID_REQUEST"); }
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(diagnostics.read(ownership.userId(request), id));
    }
}
