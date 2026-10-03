package dev.codeless.api.model;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/** Internal lease-fenced PLAN producer. Returning a valid candidate never advances task state. */
@Service
public class PlanModelService {
    private final ModelProvider provider;
    private final PlanGenerator generator;
    private final ModelCallRepository records;
    private final ModelCallAudit audit;

    public PlanModelService(ModelProvider provider, PlanValidator validator, ModelCallRepository records, ModelCallAudit audit) {
        this.provider = provider; this.generator = new PlanGenerator(provider, validator);
        this.records = records; this.audit = audit;
    }
    public record Candidate(UUID callId, JsonNode plan) {}

    public Candidate generate(UUID taskId, UUID leaseToken) {
        var attempt = records.start(taskId, leaseToken, provider.id(), provider.model());
        long start = System.nanoTime();
        try {
            audit.write(record(attempt, taskId, "REQUESTED", null, ModelProvider.Evidence.unknown(), null, null));
        } catch (ModelFailure failure) {
            records.finish(attempt.callId(), failure.code(), ModelProvider.Usage.unknown());
            throw failure;
        }
        PlanGenerator.Result result;
        try {
            Duration remaining = Duration.between(Instant.now(), attempt.deadline().toInstant());
            Duration timeout = remaining.compareTo(Duration.ofSeconds(60)) < 0 ? remaining : Duration.ofSeconds(60);
            if (timeout.toMillis() < 1) throw new ModelFailure("MODEL_TIMEOUT");
            result = generator.generate(attempt.prompt(), attempt.dataMode(), 2048, timeout);
        } catch (ModelFailure failure) {
            finish(attempt, taskId, start, failure.evidence(), failure.code());
            throw failure;
        } catch (RuntimeException exception) {
            finish(attempt, taskId, start, ModelProvider.Evidence.unknown(), "MODEL_INTERNAL_ERROR");
            throw new ModelFailure("MODEL_INTERNAL_ERROR");
        }
        try {
            audit.writePlan(attempt.callId(), result.plan());
        } catch (ModelFailure failure) {
            finish(attempt, taskId, start, result.evidence(), failure.code());
            throw failure;
        }
        finish(attempt, taskId, start, result.evidence(), null);
        return new Candidate(attempt.callId(), result.plan());
    }

    private void finish(ModelCallRepository.Attempt attempt, UUID taskId, long start,
                        ModelProvider.Evidence evidence, String error) {
        // Sidecar first: a DB failure must leave REQUESTED, never falsely report a completed DB row.
        try {
            audit.write(record(attempt, taskId, error == null ? "SUCCEEDED" : "FAILED", elapsed(start),
                    evidence, error, Instant.now().toString()));
        } catch (ModelFailure failure) {
            records.finish(attempt.callId(), failure.code(), evidence.usage());
            throw failure;
        }
        records.finish(attempt.callId(), error, evidence.usage());
    }

    private ModelCallAudit.Record record(ModelCallRepository.Attempt attempt, UUID taskId, String status,
                                        Long elapsed, ModelProvider.Evidence evidence, String error, String completed) {
        return new ModelCallAudit.Record(attempt.callId(), taskId, "PLAN", provider.id(), provider.model(),
                evidence.actualModel(), evidence.requestId(), evidence.responseId(), status, elapsed,
                evidence.usage(), error, attempt.createdAt(), completed);
    }
    static long elapsed(long start) { return Math.max(0, (System.nanoTime() - start) / 1_000_000); }
}
