package dev.codeless.api.data;

import com.fasterxml.jackson.annotation.JsonInclude;
import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** Structured metadata only. Raw source, tool messages and log URLs are never projected. */
@Service
public class TaskDiagnosticsService {
    private static final String PATH = "src/(?:pages|components)/[A-Za-z][A-Za-z0-9_-]*\\.vue|src/data/[A-Za-z][A-Za-z0-9_-]*\\.ts";
    private static final String DIGEST = "sha256:[a-f0-9]{64}";
    private final JdbcClient jdbc;
    private final PlatformRepository repository;
    private final ObjectMapper mapper;

    public TaskDiagnosticsService(JdbcClient jdbc, PlatformRepository repository, ObjectMapper mapper) {
        this.jdbc = jdbc; this.repository = repository; this.mapper = mapper;
    }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record FileChange(String path, String operation, String beforeDigest, String afterDigest) {}
    public record FileSnapshot(boolean available, int revision, List<FileChange> changes) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record BuildView(UUID id, UUID versionId, String status, Integer exitCode,
                            String artifactDigest, OffsetDateTime createdAt, OffsetDateTime completedAt) {}
    public record Diagnostics(UUID taskId, FileSnapshot files, List<BuildView> builds) {}

    /** Future trusted producer entry point: fenced by the active lease and expected snapshot revision. */
    @Transactional
    public int recordFiles(UUID taskId, UUID leaseToken, int expectedRevision, List<FileChange> changes) {
        Objects.requireNonNull(leaseToken, "leaseToken");
        validate(changes);
        var task = repository.lockTask(taskId);
        if (!repository.hasValidLease(taskId, leaseToken)
                || (task.status() != TaskStatus.GENERATE && task.status() != TaskStatus.REPAIR))
            throw new IllegalStateException("File result requires an active generation lease");
        int revision = jdbc.sql("SELECT revision FROM task_file_snapshots WHERE task_id = ?")
                .param(taskId).query(Integer.class).optional().orElse(0);
        if (revision != expectedRevision) throw new IllegalStateException("File snapshot changed concurrently");
        int next = Math.incrementExact(revision);
        jdbc.sql("""
                INSERT INTO task_file_snapshots(task_id, revision, changes) VALUES (?, ?, CAST(? AS jsonb))
                ON CONFLICT (task_id) DO UPDATE SET revision = EXCLUDED.revision,
                    changes = EXCLUDED.changes, updated_at = clock_timestamp()
                """).params(taskId, next, mapper.writeValueAsString(changes)).update();
        repository.updateTaskAndAppendEvent(task, task.status(), task.repairAttempts(), null,
                EventType.TOOL_RESULT, "File change metadata recorded", leaseToken);
        return next;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Diagnostics read(UUID owner, UUID taskId) {
        boolean owned = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM generation_tasks t
                    JOIN applications a ON a.id = t.application_id
                    JOIN platform_users u ON u.id = a.owner_id
                    WHERE t.id = ? AND a.owner_id = ? AND u.status = 'ACTIVE')
                """).params(taskId, owner).query(Boolean.class).single();
        if (!owned) throw new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND");
        FileSnapshot files = jdbc.sql("SELECT revision, changes FROM task_file_snapshots WHERE task_id = ?")
                .param(taskId).query((rs, row) -> {
                    List<FileChange> changes = List.of(mapper.readValue(rs.getString("changes"), FileChange[].class));
                    validate(changes);
                    return new FileSnapshot(true, rs.getInt("revision"), changes);
                }).optional().orElse(new FileSnapshot(false, 0, List.of()));
        List<BuildView> builds = jdbc.sql("""
                SELECT b.id, b.version_id, b.status, b.exit_code, b.artifact_digest, b.created_at, b.completed_at
                FROM builds b JOIN application_versions v ON v.id = b.version_id
                JOIN generation_tasks t ON t.id = b.task_id
                WHERE b.task_id = ? AND v.application_id = t.application_id
                ORDER BY b.created_at, b.id LIMIT 101
                """).param(taskId).query((rs, row) -> new BuildView(rs.getObject("id", UUID.class),
                        rs.getObject("version_id", UUID.class), rs.getString("status"),
                        (Integer) rs.getObject("exit_code"), rs.getString("artifact_digest"),
                        rs.getObject("created_at", OffsetDateTime.class),
                        rs.getObject("completed_at", OffsetDateTime.class))).list();
        if (builds.size() > 100) throw new IllegalStateException("Too many build records");
        return new Diagnostics(taskId, files, builds);
    }

    private static void validate(List<FileChange> changes) {
        if (changes == null || changes.size() > 40) throw new IllegalArgumentException("File count exceeds limit");
        Set<String> paths = new HashSet<>();
        for (FileChange change : changes) {
            if (change == null || change.path() == null || change.path().length() > 240 || !change.path().matches(PATH)
                    || !paths.add(change.path())) throw new IllegalArgumentException("Invalid or repeated source path");
            boolean before = change.beforeDigest() != null && change.beforeDigest().matches(DIGEST);
            boolean after = change.afterDigest() != null && change.afterDigest().matches(DIGEST);
            boolean valid = switch (Objects.toString(change.operation(), "")) {
                case "ADDED" -> change.beforeDigest() == null && after;
                case "MODIFIED" -> before && after && !change.beforeDigest().equals(change.afterDigest());
                case "DELETED" -> before && change.afterDigest() == null;
                default -> false;
            };
            if (!valid) throw new IllegalArgumentException("Invalid change operation or digest");
        }
    }
}
