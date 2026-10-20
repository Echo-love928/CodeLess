package dev.codeless.api.recovery;

import dev.codeless.api.versions.SnapshotFailure;
import dev.codeless.api.versions.SnapshotStore;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Terminal convergence for candidate versions. When a task ends FAILED (cancel, interruption, worker failure), any
 * DRAFT version it created can never be verified, so it is finalized FAILED instead of looking pending forever.
 * The database stays the status authority; the frozen FAILED report is best effort and never claims success.
 */
@Component
public class DraftConvergence {
    public record Result(UUID versionId, String outcome) {}

    private final JdbcClient jdbc;
    private final SnapshotStore snapshots;

    public DraftConvergence(JdbcClient jdbc, SnapshotStore snapshots) {
        this.jdbc = jdbc;
        this.snapshots = snapshots;
    }

    /** Runs inside the caller's transaction, which already holds the task row lock of the terminal transition. */
    @Transactional(propagation = Propagation.MANDATORY)
    public List<Result> failDrafts(UUID taskId) {
        var code = jdbc.sql("SELECT failure_code FROM generation_tasks WHERE id = ? AND status = 'FAILED'")
                .param(taskId).query(String.class).optional();
        if (code.isEmpty()) return List.of();
        record Draft(UUID id, String sourceDigest) {}
        var drafts = jdbc.sql("""
                SELECT id, source_digest FROM application_versions
                WHERE source_task_id = ? AND status = 'DRAFT' ORDER BY number FOR UPDATE
                """).param(taskId).query((rs, n) -> new Draft(rs.getObject("id", UUID.class),
                        rs.getString("source_digest"))).list();
        var results = new ArrayList<Result>();
        for (var draft : drafts) {
            results.add(new Result(draft.id(), freeze(draft.id(), draft.sourceDigest(), code.get())));
            jdbc.sql("""
                    UPDATE application_versions SET status = 'FAILED', row_version = row_version + 1,
                        updated_at = clock_timestamp()
                    WHERE id = ? AND status = 'DRAFT'
                    """).param(draft.id()).update();
        }
        return List.copyOf(results);
    }

    /** FROZEN, EXISTING (a matching FAILED report survived an earlier rollback), CONFLICT or UNAVAILABLE. */
    private String freeze(UUID version, String digest, String code) {
        try {
            snapshots.freezeOutcome(version, digest, "FAILED", JsonMapper.builder().build().createObjectNode(), code);
            return "FROZEN";
        } catch (SnapshotFailure failure) {
            if (!"SNAPSHOT_ALREADY_FROZEN".equals(failure.getMessage())) return "UNAVAILABLE";
            try {
                snapshots.outcome(version, digest, "FAILED");
                return "EXISTING";
            } catch (SnapshotFailure conflict) {
                // An uncommitted VERIFIED report cannot make the version usable; reads fail closed.
                return "CONFLICT";
            }
        }
    }
}
