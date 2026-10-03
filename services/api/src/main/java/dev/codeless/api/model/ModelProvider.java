package dev.codeless.api.model;

import java.time.Duration;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.JsonNode;

/** One synchronous PLAN call, no tools, retries, fallback or state transitions. */
public interface ModelProvider {
    String id();
    String model();
    Reply call(Prompt prompt, int maxOutputTokens, Duration timeout);

    record Reply(String content, Evidence evidence) {}
    record Evidence(String actualModel, String requestId, String responseId, Usage usage) {
        public static Evidence unknown() { return new Evidence(null, null, null, Usage.unknown()); }
    }
    record Usage(Integer inputTokens, Integer outputTokens, Integer totalTokens, JsonNode raw) {
        public static Usage unknown() { return new Usage(null, null, null, null); }
        public static Usage from(JsonNode node) {
            if (node == null || node.isNull()) return unknown();
            if (!node.isObject()) throw new ModelFailure("MODEL_INVALID_USAGE");
            return new Usage(count(node.get("prompt_tokens")), count(node.get("completion_tokens")),
                    count(node.get("total_tokens")), node.deepCopy());
        }
        private static Integer count(JsonNode node) {
            if (node == null || node.isNull()) return null;
            if (!node.isIntegralNumber() || !node.canConvertToInt() || node.intValue() < 0)
                throw new ModelFailure("MODEL_INVALID_USAGE");
            return node.intValue();
        }
    }
}
