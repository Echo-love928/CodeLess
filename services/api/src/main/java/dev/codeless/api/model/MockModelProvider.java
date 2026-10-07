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
        if ("GENERATE".equals(request.path("phase").asText())) {
            long observed = request.path("observations").size();
            String content;
            if (observed == 0) content = mapper.writeValueAsString(java.util.Map.of("type", "tool", "name", "files.create",
                    "arguments", java.util.Map.of("path", "src/components/ProfileCard.vue", "content",
                            "<template><section><h1 data-testid=\"profile-name\">Ada Lovelace</h1><p>静态个人资料与作品</p></section></template>")));
            else if (observed == 1) content = mapper.writeValueAsString(java.util.Map.of("type", "tool", "name", "files.create",
                    "arguments", java.util.Map.of("path", "src/pages/HomePage.vue", "content",
                            "<script setup lang=\"ts\">import ProfileCard from '../components/ProfileCard.vue';</script><template><main><ProfileCard/><p>作品：CodeLess Showcase</p></main></template>")));
            else content = "{\"type\":\"done\",\"actions\":[{\"type\":\"navigate\",\"path\":\"/\"},{\"type\":\"expectText\",\"target\":{\"testId\":\"profile-name\"},\"value\":\"Ada Lovelace\"}]}";
            return new Reply(content, new Evidence(model(), "mock-generation-v1", "mock-generation-v1", Usage.unknown()));
        }
        var result = (tools.jackson.databind.node.ObjectNode) mapper.readTree(fixture);
        result.put("dataMode", request.get("dataMode").asText());
        return new Reply(result.toString(), new Evidence(model(), "mock-plan-v1", "mock-plan-v1", Usage.unknown()));
    }
}
