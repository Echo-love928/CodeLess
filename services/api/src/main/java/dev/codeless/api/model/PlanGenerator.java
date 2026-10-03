package dev.codeless.api.model;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Independent PLAN boundary, also used by the real-budget acceptance CLI. */
public final class PlanGenerator {
    private final ModelProvider provider;
    private final PlanValidator validator;
    private final String policy;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public PlanGenerator(ModelProvider provider, PlanValidator validator) {
        this.provider = provider; this.validator = validator;
        try {
            policy = new ClassPathResource("model/prompts/plan-v1.txt").getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException exception) { throw new IllegalStateException("Runtime prompt unavailable", exception); }
    }
    public record Result(JsonNode plan, ModelProvider.Evidence evidence) {}

    public Result generate(String request, String dataMode, int maxOutputTokens, Duration timeout) {
        if (request == null || request.isBlank() || request.codePointCount(0, request.length()) > 8000
                || !List.of("STATIC", "MOCK", "LOCAL_STORAGE").contains(dataMode)
                || maxOutputTokens < 256 || maxOutputTokens > 4096 || timeout.isNegative()
                || timeout.isZero() || timeout.compareTo(Duration.ofSeconds(120)) > 0)
            throw new ModelFailure("MODEL_INVALID_INPUT");
        RequestPolicy.validate(request);
        String user = mapper.writeValueAsString(java.util.Map.of("request", request, "dataMode", dataMode));
        var reply = provider.call(new Prompt(List.of(new SystemMessage(policy + "\nJSON schema:\n" + validator.schemaJson()),
                new UserMessage(user))), maxOutputTokens, timeout);
        try {
            return new Result(validator.validate(reply.content(), dataMode), reply.evidence());
        } catch (ModelFailure failure) { throw new ModelFailure(failure.code(), reply.evidence()); }
    }
}
