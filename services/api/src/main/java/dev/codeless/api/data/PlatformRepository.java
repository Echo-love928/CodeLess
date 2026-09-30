package dev.codeless.api.data;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import dev.codeless.api.data.PlatformModels.Application;
import dev.codeless.api.data.PlatformModels.DataMode;
import dev.codeless.api.data.PlatformModels.Event;
import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.Task;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.data.PlatformModels.User;
import dev.codeless.api.data.PlatformModels.UserStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class PlatformRepository {
    private final JdbcClient jdbc;

    public PlatformRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public User createUser(UUID id, String email, String displayName) {
        jdbc.sql("INSERT INTO platform_users(id, email, display_name, status) VALUES (?, ?, ?, 'ACTIVE')")
                .params(id, email, displayName).update();
        return findUser(id).orElseThrow();
    }

    public Optional<User> findUser(UUID id) {
        return jdbc.sql("SELECT * FROM platform_users WHERE id = ?").param(id)
                .query((rs, row) -> new User(uuid(rs, "id"), rs.getString("email"),
                        rs.getString("display_name"), UserStatus.valueOf(rs.getString("status")),
                        rs.getLong("row_version"), rs.getObject("created_at", java.time.OffsetDateTime.class),
                        rs.getObject("updated_at", java.time.OffsetDateTime.class))).optional();
    }

    public Application createApplication(UUID id, UUID ownerId, String name, DataMode dataMode) {
        jdbc.sql("INSERT INTO applications(id, owner_id, name, data_mode) VALUES (?, ?, ?, ?)")
                .params(id, ownerId, name, dataMode.name()).update();
        return findApplicationForOwner(id, ownerId).orElseThrow();
    }

    public Optional<Application> findApplicationForOwner(UUID id, UUID ownerId) {
        return jdbc.sql("SELECT * FROM applications WHERE id = ? AND owner_id = ?")
                .params(id, ownerId).query(PlatformRepository::application).optional();
    }

    @Transactional
    public Task createTask(UUID id, UUID applicationId, String prompt) {
        return insertTask(id, applicationId, prompt, null, "FINISHED");
    }

    @Transactional
    public Task createTask(UUID id, UUID applicationId, String prompt, String idempotencyKey) {
        return insertTask(id, applicationId, prompt, idempotencyKey, "QUEUED");
    }

    private Task insertTask(UUID id, UUID applicationId, String prompt, String idempotencyKey,
                            String queueState) {
        jdbc.sql("""
                INSERT INTO generation_tasks(id, application_id, prompt, event_sequence,
                                             idempotency_key, queue_state, deadline_at)
                VALUES (?, ?, ?, 1, ?, ?, now() + interval '12 minutes')
                """).params(id, applicationId, prompt, idempotencyKey, queueState).update();
        jdbc.sql("INSERT INTO task_events(id, task_id, sequence, type, stage, message) "
                + "VALUES (?, ?, 1, 'STAGE_STARTED', 'PLAN', 'Task accepted in PLAN')")
                .params(UUID.randomUUID(), id).update();
        return findTask(id).orElseThrow();
    }

    public Optional<Task> findTask(UUID id) {
        return jdbc.sql("SELECT * FROM generation_tasks WHERE id = ?").param(id)
                .query(PlatformRepository::task).optional();
    }

    public List<Event> listEvents(UUID taskId) {
        return jdbc.sql("SELECT * FROM task_events WHERE task_id = ? ORDER BY sequence")
                .param(taskId).query((rs, row) -> new Event(uuid(rs, "id"), uuid(rs, "task_id"),
                        rs.getInt("sequence"), EventType.valueOf(rs.getString("type")),
                        TaskStatus.valueOf(rs.getString("stage")), rs.getString("message"),
                        rs.getObject("occurred_at", java.time.OffsetDateTime.class))).list();
    }

    Task lockTask(UUID taskId) {
        return jdbc.sql("SELECT * FROM generation_tasks WHERE id = ? FOR UPDATE").param(taskId)
                .query(PlatformRepository::task).optional().orElseThrow(() -> new IllegalArgumentException("Unknown task"));
    }

    boolean hasValidLease(UUID taskId, UUID token) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM generation_tasks
                    WHERE id = ? AND queue_state = 'RUNNING' AND lease_token = ?
                      AND lease_expires_at > clock_timestamp() AND deadline_at > clock_timestamp())
                """).params(taskId, token).query(Boolean.class).single();
    }

    void updateTaskAndAppendEvent(Task task, TaskStatus next, int repairs, String failureCode,
                                  EventType type, String message, UUID leaseToken) {
        String sql = """
                UPDATE generation_tasks SET status = ?, repair_attempts = ?, failure_code = ?,
                    event_sequence = event_sequence + 1, row_version = row_version + 1,
                    updated_at = clock_timestamp()
                WHERE id = ? AND row_version = ?
                """;
        if (leaseToken != null) {
            sql += """
                     AND queue_state = 'RUNNING' AND lease_token = ?
                     AND lease_expires_at > clock_timestamp() AND deadline_at > clock_timestamp()
                    """;
        }
        var statement = jdbc.sql(sql).params(next.name(), repairs, failureCode, task.id(), task.rowVersion());
        if (leaseToken != null) statement = statement.param(leaseToken);
        int changed = statement.update();
        if (changed != 1) {
            throw new IllegalStateException("Task changed concurrently");
        }
        jdbc.sql("""
                INSERT INTO task_events(id, task_id, sequence, type, stage, message, occurred_at)
                VALUES (?, ?, ?, ?, ?, ?, clock_timestamp())
                """).params(UUID.randomUUID(), task.id(), task.eventSequence() + 1,
                        type.name(), next.name(), message).update();
    }

    boolean hasVerifiedBuild(UUID taskId) {
        return jdbc.sql("""
                SELECT EXISTS (
                    SELECT 1 FROM builds b JOIN application_versions v ON v.id = b.version_id
                    JOIN generation_tasks t ON t.id = b.task_id
                    WHERE b.task_id = ? AND b.status = 'SUCCEEDED' AND b.exit_code = 0
                      AND v.status = 'VERIFIED' AND v.build_id = b.id
                      AND v.application_id = t.application_id
                )
                """).param(taskId).query(Boolean.class).single();
    }

    private static Application application(ResultSet rs, int row) throws SQLException {
        return new Application(uuid(rs, "id"), uuid(rs, "owner_id"), rs.getString("name"),
                rs.getString("description"), DataMode.valueOf(rs.getString("data_mode")),
                PlatformModels.ApplicationStatus.valueOf(rs.getString("status")),
                uuid(rs, "latest_ready_version_id"), rs.getLong("row_version"),
                rs.getObject("created_at", java.time.OffsetDateTime.class),
                rs.getObject("updated_at", java.time.OffsetDateTime.class));
    }

    private static Task task(ResultSet rs, int row) throws SQLException {
        return new Task(uuid(rs, "id"), uuid(rs, "application_id"), rs.getString("prompt"),
                TaskStatus.valueOf(rs.getString("status")), rs.getInt("repair_attempts"),
                rs.getString("failure_code"), rs.getInt("event_sequence"), rs.getLong("row_version"),
                rs.getObject("created_at", java.time.OffsetDateTime.class),
                rs.getObject("updated_at", java.time.OffsetDateTime.class));
    }

    private static UUID uuid(ResultSet rs, String column) throws SQLException {
        return (UUID) rs.getObject(column);
    }
}
