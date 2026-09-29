package dev.codeless.api.tasks;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.data.PlatformModels.Event;
import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.Task;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.data.TaskProgressService;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaskQueueService {
    private final JdbcClient jdbc;
    private final PlatformRepository repository;
    private final TaskProgressService progress;

    public TaskQueueService(JdbcClient jdbc, PlatformRepository repository, TaskProgressService progress) {
        this.jdbc = jdbc;
        this.repository = repository;
        this.progress = progress;
    }

    public record TaskView(UUID id, UUID applicationId, String prompt, TaskStatus status,
                           int repairAttempts, String failureCode, OffsetDateTime createdAt,
                           OffsetDateTime updatedAt) {
        static TaskView from(Task task) {
            return new TaskView(task.id(), task.applicationId(), task.prompt(), task.status(),
                    task.repairAttempts(), task.failureCode(), task.createdAt(), task.updatedAt());
        }
    }

    public record Claim(UUID taskId, UUID token, TaskStatus stage) {}

    @Transactional
    public TaskView create(UUID ownerId, UUID applicationId, String prompt, String key) {
        boolean owned = jdbc.sql("SELECT id FROM applications WHERE id = ? AND owner_id = ? FOR UPDATE")
                .params(applicationId, ownerId).query(UUID.class).optional().isPresent();
        if (!owned) throw new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND");
        if (key != null) {
            Optional<Task> prior = jdbc.sql("SELECT id FROM generation_tasks WHERE application_id = ? AND idempotency_key = ?")
                    .params(applicationId, key).query(UUID.class).optional().flatMap(repository::findTask);
            if (prior.isPresent()) {
                if (!prior.get().prompt().equals(prompt))
                    throw new AuthFailure(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT");
                return TaskView.from(prior.get());
            }
        }
        return TaskView.from(repository.createTask(UUID.randomUUID(), applicationId, prompt, key));
    }

    public Optional<TaskView> find(UUID ownerId, UUID taskId) {
        return jdbc.sql("""
                SELECT t.id FROM generation_tasks t JOIN applications a ON a.id = t.application_id
                WHERE t.id = ? AND a.owner_id = ?
                """).params(taskId, ownerId).query(UUID.class).optional()
                .flatMap(repository::findTask).map(TaskView::from);
    }

    public List<Event> events(UUID ownerId, UUID taskId) {
        find(ownerId, taskId).orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND"));
        return repository.listEvents(taskId);
    }

    @Transactional
    public TaskView cancel(UUID ownerId, UUID taskId) {
        Task task = lockedOwnedTask(ownerId, taskId);
        if (terminal(task.status())) return TaskView.from(task);
        progress.transition(taskId, TaskStatus.FAILED, EventType.TASK_FAILED,
                "Task cancelled by user", "CANCELLED");
        finish(taskId);
        return find(ownerId, taskId).orElseThrow();
    }

    @Transactional
    public Optional<Claim> claim() {
        Optional<UUID> candidate = jdbc.sql("""
                SELECT t.id FROM generation_tasks t
                JOIN applications a ON a.id = t.application_id
                WHERE t.queue_state = 'QUEUED' AND t.status = 'PLAN' AND t.deadline_at > now()
                  AND NOT EXISTS (SELECT 1 FROM generation_tasks active
                                  WHERE active.application_id = t.application_id
                                    AND active.queue_state = 'RUNNING')
                ORDER BY t.created_at, t.id
                LIMIT 1 FOR UPDATE OF t, a SKIP LOCKED
                """).query(UUID.class).optional();
        if (candidate.isEmpty()) return Optional.empty();
        UUID token = UUID.randomUUID();
        jdbc.sql("""
                UPDATE generation_tasks SET queue_state = 'RUNNING', lease_token = ?,
                    lease_expires_at = deadline_at, row_version = row_version + 1
                WHERE id = ?
                """).params(token, candidate.get()).update();
        return Optional.of(new Claim(candidate.get(), token, TaskStatus.PLAN));
    }

    @Transactional
    public TaskView advance(Claim claim, TaskStatus next, EventType eventType,
                            String message, String failureCode) {
        Task task = repository.findTask(claim.taskId()).orElseThrow();
        boolean leased = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM generation_tasks WHERE id = ? AND queue_state = 'RUNNING'
                    AND lease_token = ? AND lease_expires_at > now() AND deadline_at > now())
                """).params(claim.taskId(), claim.token()).query(Boolean.class).single();
        if (!leased || terminal(task.status())) throw new IllegalStateException("Lease is no longer active");
        progress.transition(claim.taskId(), next, eventType, message, failureCode);
        if (terminal(next)) finish(claim.taskId());
        return TaskView.from(repository.findTask(claim.taskId()).orElseThrow());
    }

    @Transactional
    public boolean recoverOneExpired() {
        Optional<UUID> expired = jdbc.sql("""
                SELECT id FROM generation_tasks
                WHERE queue_state IN ('QUEUED', 'RUNNING')
                  AND (deadline_at <= now() OR (queue_state = 'RUNNING' AND lease_expires_at <= now()))
                ORDER BY deadline_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
                """).query(UUID.class).optional();
        if (expired.isEmpty()) return false;
        Task task = repository.findTask(expired.get()).orElseThrow();
        if (!terminal(task.status())) {
            progress.transition(task.id(), TaskStatus.FAILED, EventType.TASK_FAILED,
                    "Task interrupted or timed out; result is unknown", "INTERRUPTED");
        }
        finish(task.id());
        return true;
    }

    private Task lockedOwnedTask(UUID ownerId, UUID taskId) {
        UUID id = jdbc.sql("""
                SELECT t.id FROM generation_tasks t JOIN applications a ON a.id = t.application_id
                WHERE t.id = ? AND a.owner_id = ? FOR UPDATE OF t
                """).params(taskId, ownerId).query(UUID.class).optional()
                .orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND"));
        return repository.findTask(id).orElseThrow();
    }

    private void finish(UUID id) {
        jdbc.sql("""
                UPDATE generation_tasks SET queue_state = 'FINISHED', lease_token = NULL,
                    lease_expires_at = NULL WHERE id = ?
                """).param(id).update();
    }

    private static boolean terminal(TaskStatus status) {
        return status == TaskStatus.READY || status == TaskStatus.FAILED;
    }
}
