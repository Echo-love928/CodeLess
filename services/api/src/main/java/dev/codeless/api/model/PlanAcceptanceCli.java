package dev.codeless.api.model;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import tools.jackson.databind.json.JsonMapper;

/** Opt-in T4: one real request, <=2048 output tokens, <=60 seconds, no fallback/retry. */
public final class PlanAcceptanceCli {
    private PlanAcceptanceCli() {}
    public static void main(String[] args) throws Exception {
        if (args.length != 1) { System.err.println("Usage: PlanAcceptanceCli <private-evidence-directory>"); System.exit(2); }
        Path evidenceRoot = Path.of(args[0]).toAbsolutePath().normalize();
        Files.createDirectories(evidenceRoot);
        var mapper = JsonMapper.builder().build();
        String key = System.getenv("CODELESS_MODEL_API_KEY");
        String name = System.getenv("CODELESS_MODEL_NAME");
        if (key == null || key.isBlank() || name == null || name.isBlank()) {
            Files.writeString(evidenceRoot.resolve("t4-preflight.json"),
                    "{\"status\":\"BLOCKED\",\"reason\":\"MODEL_CONFIGURATION\",\"requestsStarted\":0,"
                    + "\"inputTokens\":null,\"outputTokens\":null,\"totalTokens\":null}\n");
            System.err.println("T4 BLOCKED: configure CODELESS_MODEL_API_KEY and CODELESS_MODEL_NAME locally.");
            System.exit(2);
        }
        ModelProvider provider = new DeepSeekModelProvider(key, name);
        var audit = new ModelCallAudit(evidenceRoot);
        UUID id = UUID.randomUUID();
        String created = Instant.now().toString();
        audit.write(new ModelCallAudit.Record(id, null, "PLAN", provider.id(), provider.model(), null, null,
                null, "REQUESTED", null, ModelProvider.Usage.unknown(), null, created, null));
        long start = System.nanoTime();
        ModelProvider.Evidence observed;
        String error = null;
        try {
            var result = new PlanGenerator(provider, new PlanValidator()).generate(
                    "创建个人展示页，展示姓名、介绍和三个作品，全部使用静态数据。", "STATIC", 2048, Duration.ofSeconds(60));
            observed = result.evidence();
            audit.writePlan(id, result.plan());
        } catch (ModelFailure failure) { observed = failure.evidence(); error = failure.code(); }
        var record = new ModelCallAudit.Record(id, null, "PLAN", provider.id(), provider.model(), observed.actualModel(),
                observed.requestId(), observed.responseId(), error == null ? "SUCCEEDED" : "FAILED",
                PlanModelService.elapsed(start), observed.usage(), error, created, Instant.now().toString());
        audit.write(record);
        Files.writeString(evidenceRoot.resolve("t4-result.json"), mapper.writeValueAsString(record) + "\n");
        System.out.println("T4 " + record.status() + " callId=" + id + " evidence=" + evidenceRoot.resolve("t4-result.json"));
        if (error != null) System.exit(1);
    }
}
