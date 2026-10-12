package dev.codeless.api.edit;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.json.JsonMapper;

/** Server-authored, transactionally persisted first event. Never parse prompts or tool logs as metadata. */
public final class EditMetadata {
    public static final String PREFIX = "Edit accepted v1 ";
    public record Source(String type, String messageId) {}
    public record Link(UUID baseVersionId, Source source) {}
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private EditMetadata() {}
    public static String encode(Link link) { return PREFIX + JSON.writeValueAsString(link); }
    public static Optional<Link> find(JdbcClient jdbc, UUID task) {
        return jdbc.sql("SELECT message FROM task_events WHERE task_id=? AND sequence=1 AND type='STAGE_STARTED' AND stage='PLAN'")
                .param(task).query(String.class).optional().filter(s -> s.startsWith(PREFIX))
                .map(s -> JSON.readValue(s.substring(PREFIX.length()), Link.class));
    }
    public static boolean active(JdbcClient jdbc, UUID app) {
        return jdbc.sql("""
                SELECT EXISTS(SELECT 1 FROM generation_tasks t JOIN task_events e ON e.task_id=t.id
                WHERE t.application_id=? AND t.queue_state IN ('QUEUED','RUNNING')
                  AND e.sequence=1 AND e.type='STAGE_STARTED' AND e.stage='PLAN' AND e.message LIKE 'Edit accepted v1 %')
                """).param(app).query(Boolean.class).single();
    }
}
