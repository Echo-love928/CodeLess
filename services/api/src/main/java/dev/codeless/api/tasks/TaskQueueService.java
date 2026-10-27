package dev.codeless.api.tasks;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.data.PlatformModels.Event;
import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.Task;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.data.TaskProgressService;
import dev.codeless.api.recovery.DraftConvergence;
import java.time.Duration;
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
    private final DraftConvergence drafts;

    public TaskQueueService(JdbcClient jdbc, PlatformRepository repository, TaskProgressService progress,
                            DraftConvergence drafts) {
        this.jdbc = jdbc;
        this.repository = repository;
        this.progress = progress;
        this.drafts = drafts;
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
                if (!prior.get().prompt().equals(prompt) || dev.codeless.api.edit.EditMetadata.find(jdbc,prior.get().id()).isPresent())
                    throw new AuthFailure(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT");
                return TaskView.from(prior.get());
            }
        }
        if (dev.codeless.api.edit.EditMetadata.active(jdbc,applicationId))
            throw new AuthFailure(HttpStatus.CONFLICT, "EDIT_TASK_ACTIVE");
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
        drafts.failDrafts(taskId);
        return find(ownerId, taskId).orElseThrow();
    }

    public record AdminCancel(TaskStatus previous, TaskStatus current, boolean changed) {}

    /**
     * Administrator path for the same FAILED/CANCELLED transition as {@link #cancel}; the caller has already
     * checked the ADMIN role and written the audit intent. Clearing the lease stops stale workers writing.
     */
    @Transactional
    public Optional<AdminCancel> cancelAsAdministrator(UUID taskId) {
        Optional<UUID> id = jdbc.sql("SELECT id FROM generation_tasks WHERE id = ? FOR UPDATE")
                .param(taskId).query(UUID.class).optional();
        if (id.isEmpty()) return Optional.empty();
        Task task = repository.findTask(taskId).orElseThrow();
        if (terminal(task.status())) return Optional.of(new AdminCancel(task.status(), task.status(), false));
        progress.transition(taskId, TaskStatus.FAILED, EventType.TASK_FAILED,
                "Task cancelled by administrator", "CANCELLED");
        finish(taskId);
        drafts.failDrafts(taskId);
        return Optional.of(new AdminCancel(task.status(), TaskStatus.FAILED, true));
    }

    /** Legacy claim: the lease lasts until the task deadline and is never renewed. */
    @Transactional
    public Optional<Claim> claim() {
        return claim(null);
    }

    /**
     * Claim with a short lease that only a live worker renews ({@link #renew}). After a crash nothing renews it,
     * so expiry recovery converges the task within one lease instead of waiting for the 12 minute deadline.
     */
    @Transactional
    public Optional<Claim> claim(Duration lease) {
        String expiry = lease == null ? "deadline_at" : "LEAST(deadline_at, clock_timestamp() + make_interval(secs => ?))";
        Optional<UUID> candidate = jdbc.sql("""
                SELECT t.id FROM generation_tasks t
                JOIN applications a ON a.id = t.application_id
                WHERE t.queue_state = 'QUEUED' AND t.status = 'PLAN' AND t.deadline_at > clock_timestamp()
                  AND NOT EXISTS (SELECT 1 FROM generation_tasks active
                                  WHERE active.application_id = t.application_id
                                    AND active.queue_state = 'RUNNING')
                ORDER BY t.created_at, t.id
                LIMIT 1 FOR UPDATE OF t, a SKIP LOCKED
                """).query(UUID.class).optional();
        if (candidate.isEmpty()) return Optional.empty();
        UUID token = UUID.randomUUID();
        // The SELECT's snapshot may predate another claimant's commit even when the
        // application row is now locked by us. A new READ COMMITTED statement must
        // recheck the application before changing QUEUED to RUNNING.
        var update = jdbc.sql("""
                UPDATE generation_tasks SET queue_state = 'RUNNING', lease_token = ?,
                    lease_expires_at = %s, row_version = row_version + 1
                WHERE id = ? AND queue_state = 'QUEUED' AND deadline_at > clock_timestamp()
                  AND NOT EXISTS (SELECT 1 FROM generation_tasks active
                                  WHERE active.application_id = generation_tasks.application_id
                                    AND active.queue_state = 'RUNNING')
                """.formatted(expiry)).param(token);
        if (lease != null) update = update.param(seconds(lease));
        int changed = update.param(candidate.get()).update();
        if (changed != 1) return Optional.empty();
        Double queueMs=jdbc.sql("SELECT EXTRACT(EPOCH FROM (clock_timestamp()-created_at))*1000 FROM generation_tasks WHERE id=?")
                .param(candidate.get()).query(Double.class).single();
        org.slf4j.LoggerFactory.getLogger(TaskQueueService.class).info("API_QUEUE_TIMING taskId={} queueMs={}",candidate.get(),queueMs);
        return Optional.of(new Claim(candidate.get(), token, TaskStatus.PLAN));
    }

    /**
     * Heartbeat of a live worker. Extends a still-valid lease, never beyond the task deadline. Returns false once
     * the task was cancelled, finished or its lease already expired; a lost lease is never revived.
     */
    @Transactional
    public boolean renew(Claim claim, Duration lease) {
        return jdbc.sql("""
                UPDATE generation_tasks
                SET lease_expires_at = LEAST(deadline_at, clock_timestamp() + make_interval(secs => ?))
                WHERE id = ? AND lease_token = ? AND queue_state = 'RUNNING'
                  AND lease_expires_at > clock_timestamp() AND deadline_at > clock_timestamp()
                """).params(seconds(lease), claim.taskId(), claim.token()).update() == 1;
    }

    @Transactional
    public TaskView advance(Claim claim, TaskStatus next, EventType eventType,
                            String message, String failureCode) {
        progress.transitionLeased(claim.taskId(), claim.token(), next, eventType, message, failureCode);
        if (terminal(next)) finish(claim.taskId());
        if (next == TaskStatus.FAILED) drafts.failDrafts(claim.taskId());
        return TaskView.from(repository.findTask(claim.taskId()).orElseThrow());
    }

    @Transactional
    public boolean recoverOneExpired() {
        return recoverExpired().isPresent();
    }

    /** Recovers one expired task as FAILED/INTERRUPTED (never READY) and returns its ID for resource cleanup. */
    @Transactional
    public Optional<UUID> recoverExpired() {
        Optional<UUID> expired = jdbc.sql("""
                SELECT id FROM generation_tasks
                WHERE queue_state IN ('QUEUED', 'RUNNING')
                  AND (deadline_at <= clock_timestamp()
                       OR (queue_state = 'RUNNING' AND lease_expires_at <= clock_timestamp()))
                ORDER BY deadline_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
                """).query(UUID.class).optional();
        if (expired.isEmpty()) return Optional.empty();
        Task task = repository.findTask(expired.get()).orElseThrow();
        if (!terminal(task.status())) {
            progress.transition(task.id(), TaskStatus.FAILED, EventType.TASK_FAILED,
                    "Task interrupted or timed out; result is unknown", "INTERRUPTED");
        }
        finish(task.id());
        drafts.failDrafts(task.id());
        return Optional.of(task.id());
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

    private static double seconds(Duration lease) {
        if (lease.isNegative() || lease.isZero()) throw new IllegalArgumentException("lease must be positive");
        return lease.toMillis() / 1000.0;
    }

    private static boolean terminal(TaskStatus status) {
        return status == TaskStatus.READY || status == TaskStatus.FAILED;
    }
}
