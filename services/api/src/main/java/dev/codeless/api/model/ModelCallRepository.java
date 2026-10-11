package dev.codeless.api.model;

import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.core.SqlParameterValue;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Reuses D02's model_calls without allocating or changing shared migration numbers. */
@Repository
public class ModelCallRepository {
    private final JdbcClient jdbc;
    public ModelCallRepository(JdbcClient jdbc) { this.jdbc = jdbc; }
    public record Attempt(UUID callId, String prompt, String dataMode, OffsetDateTime deadline, String createdAt) {}

    @Transactional
    public Attempt start(UUID taskId, UUID leaseToken, String provider, String model) {
        return reserve(taskId, leaseToken, provider, model, "PLAN", false);
    }

    @Transactional
    public Attempt startStage(UUID taskId, UUID leaseToken, String provider, String model, String stage) {
        if (!java.util.List.of("PLAN", "GENERATE", "REPAIR").contains(stage)) throw new ModelFailure("MODEL_INVALID_INPUT");
        return reserve(taskId, leaseToken, provider, model, stage, true);
    }

    private Attempt reserve(UUID taskId, UUID leaseToken, String provider, String model, String stage, boolean boundedLoop) {
        if (taskId == null || leaseToken == null) throw new ModelFailure("MODEL_INVALID_INPUT");
        jdbc.sql("SELECT id FROM generation_tasks WHERE id = ? FOR UPDATE").param(taskId)
                .query(UUID.class).optional().orElseThrow(() -> new ModelFailure("MODEL_TASK_UNAVAILABLE"));
        var input = jdbc.sql("""
                SELECT t.prompt, a.data_mode, t.deadline_at
                FROM generation_tasks t JOIN applications a ON a.id = t.application_id
                WHERE t.id = ? AND t.status = ? AND t.queue_state = 'RUNNING' AND t.lease_token = ?
                  AND t.lease_expires_at > clock_timestamp() AND t.deadline_at > clock_timestamp()
                """).params(taskId, stage, leaseToken).query((rs, row) -> new Attempt(null, rs.getString("prompt"),
                        rs.getString("data_mode"), rs.getObject("deadline_at", OffsetDateTime.class), null))
                .optional().orElseThrow(() -> new ModelFailure("MODEL_LEASE_INVALID"));
        RequestPolicy.validate(input.prompt());
        var counts = jdbc.sql("""
                SELECT count(*) AS calls, count(*) FILTER (WHERE status = 'REQUESTED') AS pending,
                    count(*) FILTER (WHERE status <> 'REQUESTED' AND (input_tokens IS NULL OR output_tokens IS NULL)) AS unknown,
                    coalesce(sum(input_tokens::bigint + output_tokens::bigint), 0) AS tokens
                FROM model_calls WHERE task_id = ?
                """).param(taskId).query((rs, row) -> new long[]{rs.getLong("calls"), rs.getLong("pending"),
                        rs.getLong("unknown"), rs.getLong("tokens")}).single();
        if (counts[1] > 0) throw new ModelFailure("MODEL_CALL_IN_PROGRESS");
        // The trusted AgentModel path reserves UTF-8 input + framing + max output in its durable
        // journal before startStage. Legacy PLAN has no such meter and must still fail closed.
        if (counts[2] > 0 && !boundedLoop) throw new ModelFailure("MODEL_BUDGET_UNKNOWN");
        if (counts[0] >= 12 || counts[3] >= 50000) throw new ModelFailure("MODEL_BUDGET_EXCEEDED");
        UUID id = UUID.randomUUID();
        String created = jdbc.sql("""
                INSERT INTO model_calls(id, task_id, stage, provider, model, status)
                VALUES (?, ?, ?, ?, ?, 'REQUESTED') RETURNING created_at
                """).params(id, taskId, stage, provider, model).query(OffsetDateTime.class).single().toString();
        return new Attempt(id, input.prompt(), input.dataMode(), input.deadline(), created);
    }

    public void finish(UUID id, String error, ModelProvider.Usage usage) {
        int changed = jdbc.sql("""
                UPDATE model_calls SET status = ?, input_tokens = ?, output_tokens = ?, error_code = ?,
                    row_version = row_version + 1, completed_at = clock_timestamp()
                WHERE id = ? AND status = 'REQUESTED'
                """).params(error == null ? "SUCCEEDED" : "FAILED",
                new SqlParameterValue(Types.INTEGER, usage.inputTokens()),
                new SqlParameterValue(Types.INTEGER, usage.outputTokens()),
                new SqlParameterValue(Types.VARCHAR, error), id).update();
        if (changed != 1) throw new ModelFailure("MODEL_RECORD_CONFLICT");
    }
}
