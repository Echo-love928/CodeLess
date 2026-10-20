package dev.codeless.api.recovery;

import dev.codeless.api.versions.SnapshotFailure;
import dev.codeless.api.versions.SnapshotStore;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.json.JsonMapper;

/**
 * Terminal convergence for candidate versions. When a task ends FAILED (cancel, interruption, worker failure), any
 * DRAFT version it created can never be verified, so it is finalized FAILED instead of looking pending forever.
 * The database stays the status authority. A frozen report is immutable, so the FAILED report is frozen only after
 * the terminal transition commits and carries the committed failure code: a transition that rolls back never leaves
 * a reason behind that did not happen (D18-B review). The report stays best effort and never claims success; a crash
 * between commit and freeze leaves a FAILED version without a readable report, like an unavailable store.
 */
@Component
public class DraftConvergence {
    private static final Logger log = LoggerFactory.getLogger(DraftConvergence.class);

    private final JdbcClient jdbc;
    private final SnapshotStore snapshots;

    public DraftConvergence(JdbcClient jdbc, SnapshotStore snapshots) {
        this.jdbc = jdbc;
        this.snapshots = snapshots;
    }

    /**
     * Runs inside the caller's transaction, which already holds the task row lock of the terminal transition.
     * Returns the versions finalized FAILED; their reports are frozen once that transaction commits.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public List<UUID> failDrafts(UUID taskId) {
        var code = jdbc.sql("SELECT failure_code FROM generation_tasks WHERE id = ? AND status = 'FAILED'")
                .param(taskId).query(String.class).optional();
        if (code.isEmpty()) return List.of();
        record Draft(UUID id, String sourceDigest) {}
        var drafts = jdbc.sql("""
                SELECT id, source_digest FROM application_versions
                WHERE source_task_id = ? AND status = 'DRAFT' ORDER BY number FOR UPDATE
                """).param(taskId).query((rs, n) -> new Draft(rs.getObject("id", UUID.class),
                        rs.getString("source_digest"))).list();
        for (var draft : drafts) {
            jdbc.sql("""
                    UPDATE application_versions SET status = 'FAILED', row_version = row_version + 1,
                        updated_at = clock_timestamp()
                    WHERE id = ? AND status = 'DRAFT'
                    """).param(draft.id()).update();
        }
        if (!drafts.isEmpty())
            afterCommit(() -> drafts.forEach(draft -> report(taskId, draft.id(), draft.sourceDigest(), code.get())));
        return drafts.stream().map(Draft::id).toList();
    }

    /** Runs {@code action} only once the surrounding transaction has committed; a rollback discards it. */
    private static void afterCommit(Runnable action) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { action.run(); }
        });
    }

    /** The task change is already committed, so nothing here may throw back into the caller. */
    private void report(UUID task, UUID version, String digest, String code) {
        String outcome;
        try {
            outcome = freeze(version, digest, code);
        } catch (RuntimeException unexpected) {
            outcome = "UNAVAILABLE";
        }
        if (!"FROZEN".equals(outcome))
            log.warn("Version {} of task {} converged FAILED/{}; its report is {}", version, task, code, outcome);
    }

    /**
     * FROZEN; EXISTING when a FAILED report with the same failure code is already frozen; CONFLICT when the frozen
     * report says anything else (another failure code or status), which stays immutable; UNAVAILABLE otherwise.
     */
    String freeze(UUID version, String digest, String code) {
        try {
            snapshots.freezeOutcome(version, digest, "FAILED", JsonMapper.builder().build().createObjectNode(), code);
            return "FROZEN";
        } catch (SnapshotFailure failure) {
            if (!"SNAPSHOT_ALREADY_FROZEN".equals(failure.getMessage())) return "UNAVAILABLE";
            try {
                var existing = snapshots.outcome(version, digest, "FAILED").report().path("failureCode");
                return existing.isTextual() && existing.asText().equals(code) ? "EXISTING" : "CONFLICT";
            } catch (SnapshotFailure conflict) {
                // A VERIFIED report from a worker that lost its lease cannot make the version usable; reads fail closed.
                return "CONFLICT";
            }
        }
    }
}
