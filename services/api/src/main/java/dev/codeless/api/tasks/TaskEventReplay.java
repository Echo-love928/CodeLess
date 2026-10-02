package dev.codeless.api.tasks;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.data.PlatformModels.Event;
import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** Reads one consistent, bounded database snapshot; never replays raw tool/model text. */
@Service
public class TaskEventReplay {
    public static final int MAX_BACKLOG = 1000;
    private final JdbcClient jdbc;

    public TaskEventReplay(JdbcClient jdbc) { this.jdbc = jdbc; }

    public record Snapshot(TaskStatus status, int latestEventId, List<Event> events) {
        public boolean terminal() { return status == TaskStatus.READY || status == TaskStatus.FAILED; }
    }

    private record Head(TaskStatus status, int sequence) {}

    public static int cursor(String value) {
        if (value == null) return 0;
        if (!value.matches("0|[1-9][0-9]{0,9}")) invalidCursor();
        try { return Integer.parseInt(value); }
        catch (NumberFormatException exception) { return invalidCursor(); }
    }

    private static int invalidCursor() {
        throw new AuthFailure(HttpStatus.BAD_REQUEST, "INVALID_EVENT_ID");
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Snapshot read(UUID owner, UUID task, int after) {
        return load(owner, task, after, MAX_BACKLOG + 1, true);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<Event> page(UUID owner, UUID task, int after, int limit) {
        if (limit < 1 || limit > MAX_BACKLOG)
            throw new AuthFailure(HttpStatus.BAD_REQUEST, "INVALID_EVENT_LIMIT");
        return load(owner, task, after, limit, false).events();
    }

    private Snapshot load(UUID owner, UUID task, int after, int limit, boolean complete) {
        Head head = jdbc.sql("""
                SELECT t.status, t.event_sequence FROM generation_tasks t
                JOIN applications a ON a.id = t.application_id
                JOIN platform_users u ON u.id = a.owner_id
                WHERE t.id = ? AND a.owner_id = ? AND u.status = 'ACTIVE'
                """).params(task, owner).query((rs, row) -> new Head(
                        TaskStatus.valueOf(rs.getString("status")), rs.getInt("event_sequence")))
                .optional().orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND"));
        if (after < 0) invalidCursor();
        if (after > head.sequence()) throw new AuthFailure(HttpStatus.CONFLICT, "EVENT_CURSOR_AHEAD");
        List<Event> events = jdbc.sql("""
                SELECT id, task_id, sequence, type, stage, occurred_at FROM task_events
                WHERE task_id = ? AND sequence > ? ORDER BY sequence LIMIT ?
                """).params(task, after, limit).query((rs, row) -> {
                    EventType type = EventType.valueOf(rs.getString("type"));
                    TaskStatus stage = TaskStatus.valueOf(rs.getString("stage"));
                    return new Event(rs.getObject("id", UUID.class), rs.getObject("task_id", UUID.class),
                            rs.getInt("sequence"), type, stage, safeMessage(type, stage),
                            rs.getObject("occurred_at", OffsetDateTime.class));
                }).list();
        if (events.size() > MAX_BACKLOG)
            throw new AuthFailure(HttpStatus.CONFLICT, "EVENT_BACKLOG_EXCEEDED");
        // Missing durable records are an error, never a successful empty terminal replay.
        int expected = after;
        for (Event event : events) {
            if (event.sequence() != ++expected) throw new IllegalStateException("Event sequence gap");
        }
        if ((complete || events.size() < limit) && expected != head.sequence())
            throw new IllegalStateException("Event sequence mismatch");
        return new Snapshot(head.status(), head.sequence(), events);
    }

    private static String safeMessage(EventType type, TaskStatus stage) {
        return switch (type) {
            case STAGE_STARTED -> "Stage started: " + stage;
            case STAGE_COMPLETED -> "Stage completed: " + stage;
            case TOOL_RESULT -> "Tool result recorded: " + stage;
            case REPAIR_REQUESTED -> "Repair requested: " + stage;
            case TASK_FAILED -> "Task failed; query task status for failure code";
        };
    }
}
