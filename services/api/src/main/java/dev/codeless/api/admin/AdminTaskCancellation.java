package dev.codeless.api.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.tasks.TaskQueueService;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * The only administrator mutation: cancel one nonterminal task. The audit intent is durable before the task row
 * is touched (no audit, no action); the outcome is recorded after the transaction commits. Deliberately not
 * transactional itself, so the recorded outcome never describes an uncommitted change.
 */
@Service
public class AdminTaskCancellation {
    public static final String ACTION = "TASK_CANCEL";
    private static final Logger log = LoggerFactory.getLogger(AdminTaskCancellation.class);

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Result(AdminQueries.Task task, AdminAuditLog.Entry audit) {}

    private final TaskQueueService tasks;
    private final AdminQueries queries;
    private final AdminAuditLog audit;

    public AdminTaskCancellation(TaskQueueService tasks, AdminQueries queries, AdminAuditLog audit) {
        this.tasks = tasks;
        this.queries = queries;
        this.audit = audit;
    }

    public Result cancel(UUID actorId, UUID taskId, String reason) {
        AdminAuditLog.Entry intent = audit.request(ACTION, actorId, "TASK", taskId, AdminRedaction.redact(reason));
        Optional<TaskQueueService.AdminCancel> outcome;
        try {
            outcome = tasks.cancelAsAdministrator(taskId);
        } catch (RuntimeException failure) {
            record(intent, "FAILED", null, null);
            throw failure;
        }
        if (outcome.isEmpty()) {
            record(intent, "NOT_FOUND", null, null);
            throw new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND");
        }
        TaskQueueService.AdminCancel result = outcome.get();
        AdminAuditLog.Entry entry = record(intent, result.changed() ? "CANCELLED" : "ALREADY_TERMINAL",
                result.previous().name(), result.current().name());
        return new Result(queries.task(taskId), entry);
    }

    /** The committed task row is authoritative; a lost completion record leaves the entry UNKNOWN, never success. */
    private AdminAuditLog.Entry record(AdminAuditLog.Entry intent, String outcome, String previous, String current) {
        try {
            return audit.complete(intent, outcome, previous, current);
        } catch (AdminAuditLog.Unavailable unavailable) {
            log.warn("Admin audit completion was not recorded for entry {}; outcome stays UNKNOWN", intent.id());
            return intent;
        }
    }
}
