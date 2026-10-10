package dev.codeless.api.agent;

import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Model-facing projection only. Full real tool results remain in the durable journal. */
final class RepairContext {
    private final JsonMapper json=JsonMapper.builder().build();
    private final Map<String,JsonNode> latest=new LinkedHashMap<>();
    private final Map<String,Integer> reads=new LinkedHashMap<>();
    private JsonNode sourceFiles;
    private String sourceDigest;
    private int repeatedReads;
    private boolean changed;
    RepairContext(JsonNode draft){sourceFiles=draft.path("files").deepCopy();sourceDigest=draft.path("sourceDigest").asText();}
    List<JsonNode> observations(){return List.copyOf(latest.values());}
    JsonNode sourceFiles(){return sourceFiles;}
    Map<String,Object> progress(){return Map.of("repeatedReads",repeatedReads,"sourceChanged",changed,
            "next",changed?"DONE_OR_READ_REMAINING_DEPENDENCY":repeatedReads>0?"PATCH_USING_OBSERVED_DIGEST":"READ_REQUIRED_DEPENDENCIES_ONCE");}
    boolean observe(String name,JsonNode arguments,JsonNode actual) {
        var source=actual.path("source");String digest=source.path("sourceDigest").asText();
        if(!source.path("files").isArray()||digest.isBlank())throw new AgentFailure("AGENT_CHECKPOINT_INVALID");
        if(!digest.equals(sourceDigest)) {
            changed=true;reads.clear();repeatedReads=0;
            // A write can invalidate dependencies too. Keep authentic receipts, never send stale text as current source.
            for(var entry:latest.entrySet())if(entry.getValue().path("tool").asText().equals("files.read")) {
                var stale=(tools.jackson.databind.node.ObjectNode)entry.getValue().deepCopy();
                stale.putNull("content");stale.put("stale",true);entry.setValue(stale);
            }
        }
        sourceFiles=source.path("files").deepCopy();sourceDigest=digest;
        String path=arguments.path("path").asText(),key=name+":"+path;
        boolean read=name.equals("files.read")||name.equals("files.list");
        int seen=read?reads.merge(key,1,Integer::sum):0;
        if(seen>1)repeatedReads++;
        var observed=new LinkedHashMap<String,Object>();observed.put("tool",name);observed.put("path",path);
        for(String field:List.of("callId","status","errorCode","content","beforeDigest","afterDigest"))observed.put(field,actual.path(field).deepCopy());
        latest.put(key,json.valueToTree(observed));
        // Two repeated unchanged reads receive explicit feedback; a third stops with the existing CONTROL terminal.
        if(seen>3)throw new AgentFailure("AGENT_REPAIR_NO_PROGRESS");
        return seen>1;
    }
}
