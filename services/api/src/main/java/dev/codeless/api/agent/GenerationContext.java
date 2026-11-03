package dev.codeless.api.agent;

import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Keep current source bytes once per path; full historical receipts remain in the durable journal. */
final class GenerationContext {
    private GenerationContext() {}
    static boolean complete(List<JsonNode> actual,Set<String> planned) {
        for(int i=actual.size()-1;i>=0;i--) if(actual.get(i).path("source").path("files").isArray()) {
            var paths=new TreeSet<String>();actual.get(i).path("source").path("files").forEach(f -> paths.add(f.path("path").asText()));
            return !paths.isEmpty() && paths.equals(planned);
        }
        return false;
    }
    /** Preserve plan, acceptance and every source byte; only factor repeated registry rules and audit IDs.
     * Apply from the first request so earlier input usage cannot starve the last planned file. */
    static JsonNode compactInput(JsonNode input) {
        var compact=(ObjectNode)input.deepCopy();
        RepairContext.compactToolDefinitions(compact);
        for(var observed:compact.path("observations")) if(observed.isObject())
            ((ObjectNode)observed).remove("callId");
        return compact.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length
                <input.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length?compact:input;
    }
    static List<JsonNode> observations(List<JsonNode> actual) {
        if(actual.size()<2) return List.copyOf(actual);
        var result=new ArrayList<JsonNode>();
        var latestContent=new HashMap<String,Integer>();
        int lastInventory=-1;
        for(int i=0;i<actual.size();i++) {
            var receipt=actual.get(i);
            if(receipt.path("source").isObject()) lastInventory=i;
            if(receipt.has("committedContent") && !receipt.path("path").asText().isBlank()) latestContent.put(receipt.path("path").asText(),i);
        }
        for(int i=0;i<actual.size();i++) {
            var original=actual.get(i);
            if(!original.isObject()) {result.add(original);continue;}
            var projected=(ObjectNode)original.deepCopy();
            for(String key:List.copyOf(projected.propertyNames())) if(projected.path(key).isNull()) projected.remove(key);
            if(i!=lastInventory) projected.remove("source");
            Integer latest=latestContent.get(original.path("path").asText());
            if(latest!=null && i<latest) {
                projected.remove("committedContent");projected.remove("contentOrigin");projected.remove("content");
            }
            result.add(projected);
        }
        return result;
    }
}
