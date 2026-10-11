package dev.codeless.api.agent;

import java.nio.charset.StandardCharsets;
import java.util.List;
import dev.codeless.api.model.ModelProvider.Usage;
import tools.jackson.databind.JsonNode;

/** Fixed runtime limits, independent of the development agent's token allowance. */
public final class RuntimeBudget {
    public static final int MODEL_CALLS=12, TOOL_CALLS=20, TOKENS=50000, REPAIRS=3, OUTPUT_TOKENS=4096;
    public static final int FRAMING_TOKENS=512;
    private RuntimeBudget() {}
    public record Meter(long models, long tools, long chargedTokens) {}
    public record Charge(long chargedTokens, long releasedTokens, boolean estimated, String source) {}
    public static int inputReservation(String policy,String input) {
        return Math.addExact(Math.addExact(policy.getBytes(StandardCharsets.UTF_8).length,
                input.getBytes(StandardCharsets.UTF_8).length),FRAMING_TOKENS);
    }
    public static Charge charge(Usage usage,int inputReservation) {
        long reserved=(long)inputReservation+OUTPUT_TOKENS;
        long known=(usage.inputTokens()==null?0L:usage.inputTokens())+(usage.outputTokens()==null?0L:usage.outputTokens());
        boolean estimated=usage.totalTokens()==null && (usage.inputTokens()==null || usage.outputTokens()==null);
        long charged=usage.totalTokens()!=null?Math.max(usage.totalTokens(),known):
                (usage.inputTokens()==null?inputReservation:(long)usage.inputTokens())+
                (usage.outputTokens()==null?OUTPUT_TOKENS:(long)usage.outputTokens());
        return new Charge(charged,Math.max(0,reserved-charged),estimated,
                estimated?"UTF8_BYTES_PLUS_FRAMING_AND_MAX_OUTPUT":"PROVIDER_USAGE");
    }
    public static Meter meter(List<JsonNode> events) {
        long models=0,tools=0,tokens=0;
        for(var event:events) {
            var payload=event.path("payload");
            switch(event.path("kind").asText()) {
                case "model.request" -> {models++;tokens+=payload.path("reservedTokens").asLong();}
                case "tool.request" -> tools+=payload.path("slots").asLong(1);
                case "model.usage" -> {
                    tokens-=payload.path("releasedTokens").asLong();
                    tokens+=Math.max(0,payload.path("chargedTokens").asLong()-payload.path("reservationTokens").asLong());
                }
                default -> { }
            }
        }
        if(tokens<0) throw new AgentFailure("AGENT_CHECKPOINT_INVALID");
        return new Meter(models,tools,tokens);
    }
}
