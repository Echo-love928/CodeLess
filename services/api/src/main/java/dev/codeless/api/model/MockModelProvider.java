package dev.codeless.api.model;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.json.JsonMapper;

/** Explicit deterministic CI provider. No fabricated measured token usage. */
public final class MockModelProvider implements ModelProvider {
    private final String fixture;
    public MockModelProvider() {
        try { fixture = new ClassPathResource("model/plan/fixtures/valid/static.json").getContentAsString(StandardCharsets.UTF_8); }
        catch (IOException exception) { throw new IllegalStateException("Mock fixture unavailable", exception); }
    }
    public String id() { return "deterministic-mock"; }
    public String model() { return "plan-fixture-v1"; }
    public Reply call(Prompt prompt, int maxOutputTokens, Duration timeout) {
        var mapper = JsonMapper.builder().build();
        var request = mapper.readTree(prompt.getUserMessage().getText());
        var result = (tools.jackson.databind.node.ObjectNode) mapper.readTree(fixture);
        result.put("dataMode", request.get("dataMode").asText());
        return new Reply(result.toString(), new Evidence(model(), "mock-plan-v1", "mock-plan-v1", Usage.unknown()));
    }
}
