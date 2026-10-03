package dev.codeless.api.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.json.JsonMapper;

class PlanAcceptanceCliTest {
    @TempDir Path root;
    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void planStorageFailureRetainsTheAlreadyChargedUsageAndProviderIdentifiers() throws Exception {
        UUID id = UUID.randomUUID();
        Path conflict = Files.createDirectory(root.resolve(id + ".plan.json"));
        Files.writeString(conflict.resolve("occupied"), "force an actual filesystem failure");
        var calls = new AtomicInteger();
        var usage = ModelProvider.Usage.from(mapper.readTree("{\"prompt_tokens\":31,\"completion_tokens\":17,\"total_tokens\":48}"));
        int exit = PlanAcceptanceCli.run(root, provider(calls, usage), id);
        assertThat(exit).isEqualTo(1);
        assertThat(calls).hasValue(1);
        for (Path file : java.util.List.of(root.resolve("t4-result.json"), root.resolve(id + ".json"))) {
            var record = mapper.readTree(Files.readString(file));
            assertThat(record.path("status").asText()).isEqualTo("FAILED");
            assertThat(record.path("errorCode").asText()).isEqualTo("MODEL_AUDIT_UNAVAILABLE");
            assertThat(record.path("actualModel").asText()).isEqualTo("fixture-actual-model");
            assertThat(record.path("requestId").asText()).isEqualTo("fixture-request-31");
            assertThat(record.path("responseId").asText()).isEqualTo("fixture-response-17");
            assertThat(record.at("/usage/inputTokens").intValue()).isEqualTo(31);
            assertThat(record.at("/usage/outputTokens").intValue()).isEqualTo(17);
            assertThat(record.at("/usage/totalTokens").intValue()).isEqualTo(48);
        }
        assertThat(Files.readString(conflict.resolve("occupied"))).isEqualTo("force an actual filesystem failure");
    }

    @Test
    void requestedAuditFailurePreventsAnyProviderCall() throws Exception {
        UUID id = UUID.randomUUID();
        Path conflict = Files.createDirectory(root.resolve(id + ".json"));
        Files.writeString(conflict.resolve("occupied"), "occupied");
        var calls = new AtomicInteger();
        assertThatThrownBy(() -> PlanAcceptanceCli.run(root, provider(calls, ModelProvider.Usage.unknown()), id))
                .hasMessage("MODEL_AUDIT_UNAVAILABLE");
        assertThat(calls).hasValue(0);
    }

    @Test
    void malformedKeyInAFreshCliProcessIsBlockedWithoutLeakingTheAuthorizationValue() throws Exception {
        String fakeKey = "cli-regression-only-secret\n";
        var command = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                "-cp", System.getProperty("java.class.path"), PlanAcceptanceCli.class.getName(), root.toString());
        command.redirectErrorStream(true);
        command.environment().put("CODELESS_MODEL_API_KEY", fakeKey);
        command.environment().put("CODELESS_MODEL_NAME", "test-model");
        var process = command.start();
        try {
            assertThat(process.waitFor(10, TimeUnit.SECONDS)).isTrue();
            String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            assertThat(output).doesNotContain("cli-regression-only-secret", "Authorization", "Bearer");
            assertThat(process.exitValue()).isEqualTo(2);
            var preflight = mapper.readTree(Files.readString(root.resolve("t4-preflight.json")));
            assertThat(preflight.path("status").asText()).isEqualTo("BLOCKED");
            assertThat(preflight.path("requestsStarted").intValue()).isZero();
            assertThat(preflight.path("inputTokens").isNull()).isTrue();
            assertThat(preflight.path("outputTokens").isNull()).isTrue();
        } finally { process.destroyForcibly(); }
    }

    private ModelProvider provider(AtomicInteger calls, ModelProvider.Usage usage) {
        return new ModelProvider() {
            public String id() { return "local-cli-regression-fixture"; }
            public String model() { return "fixture-requested-model"; }
            public Reply call(Prompt prompt, int tokens, Duration timeout) {
                calls.incrementAndGet();
                var reply = new MockModelProvider().call(prompt, tokens, timeout);
                return new Reply(reply.content(), new Evidence("fixture-actual-model", "fixture-request-31", "fixture-response-17", usage));
            }
        };
    }
}
