package dev.codeless.api.agent;

import java.util.*;
import dev.codeless.api.edit.LocalEditScope;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Model-facing feedback from digest-checked writes; never changes the immutable edit base or journal. */
final class LocalGenerationContext {
    private LocalGenerationContext() {}
    static Optional<JsonNode> latestWrite(JsonNode base,List<JsonNode> observations) {
        String target=LocalEditScope.target(base);
        for(int i=observations.size()-1;i>=0;i--) {
            var receipt=observations.get(i);
            if(target.equals(receipt.path("path").asText()) && "SUCCEEDED".equals(receipt.path("status").asText())
                    && "COMMITTED_WRITE_DIGEST_MATCHED".equals(receipt.path("contentOrigin").asText())) return Optional.of(receipt);
        }
        return Optional.empty();
    }
    static Map<String,Object> progress(JsonNode base,List<JsonNode> observations) {
        String baseDigest=base.path("sourceFiles").get(0).path("digest").asText();
        var last=latestWrite(base,observations);
        String current=last.map(value -> value.path("afterDigest").asText()).orElse(baseDigest);
        boolean changed=!baseDigest.equals(current);
        boolean noOp=changed && last.map(value -> value.path("beforeDigest").asText().equals(current)).orElse(false);
        return Map.of("baseDigest",baseDigest,"currentDigest",current,"sourceChanged",changed,"repeatedCommittedWrite",noOp,
                "next",noOp?"PROPOSE_DONE_WITH_ACTIONS":changed?"PROPOSE_DONE_OR_NECESSARY_PATCH":"APPLY_REQUESTED_CHANGE");
    }
    static boolean completionOnly(JsonNode base,List<JsonNode> observations) {
        return Boolean.TRUE.equals(progress(base,observations).get("repeatedCommittedWrite"));
    }
    static JsonNode projectBase(JsonNode base,List<JsonNode> observations) {
        if(latestWrite(base,observations).isEmpty()) return base;
        var projected=(ObjectNode)base.deepCopy();
        projected.path("sourceFiles").forEach(file -> ((ObjectNode)file).remove("content"));
        return projected;
    }
}
