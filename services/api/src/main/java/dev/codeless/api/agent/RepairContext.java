package dev.codeless.api.agent;

import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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
    private final Set<String> writtenStates=new HashSet<>();
    private boolean repeatedPatch;
    RepairContext(JsonNode draft){sourceFiles=draft.path("files").deepCopy();sourceDigest=draft.path("sourceDigest").asText();writtenStates.add(sourceDigest);}
    static JsonNode planProjection(JsonNode plan) {
        var json=JsonMapper.builder().build();var out=json.createObjectNode();
        for(String field:List.of("schemaVersion","template","dataMode","capabilities"))if(plan.has(field))out.set(field,plan.path(field).deepCopy());
        for(String field:List.of("pages","components","files")) {
            var entries=out.putArray(field);
            for(var original:plan.path(field)) {
                var entry=entries.addObject();
                for(String key:field.equals("pages")?List.of("route","file"):field.equals("components")?List.of("name","file"):List.of("path"))
                    if(original.has(key))entry.set(key,original.path(key).deepCopy());
            }
        }
        return out;
    }
    /** Drop only the duplicate model-facing action copy; the host's immutable draft is unchanged. */
    static JsonNode compactCompletion(JsonNode input,JsonNode originalActions) {
        var json=JsonMapper.builder().build();
        var compact=(tools.jackson.databind.node.ObjectNode)input.deepCopy();
        compact.set("completionProposal",json.valueToTree(Map.of("type","done")));
        compact.set("originalAcceptance",json.valueToTree(Map.of("retainedByHost",true,"actionCount",originalActions.size(),
                "digest",hash(originalActions.toString()))));
        return compact.toString().getBytes(StandardCharsets.UTF_8).length<input.toString().getBytes(StandardCharsets.UTF_8).length?compact:input;
    }
    /** Lossless validation signatures and receipt de-duplication for a budget-constrained repair request.
     * Only the model projection changes: the registry, immutable actions and durable journal stay intact. */
    static JsonNode compactInput(JsonNode input,JsonNode originalActions) {
        var json=JsonMapper.builder().build();
        var compact=(tools.jackson.databind.node.ObjectNode)compactCompletion(input,originalActions).deepCopy();
        var rules=json.createObjectNode();var signatures=json.createArrayNode();
        var toolNames=new HashSet<String>();
        boolean supported=compact.path("tools").isArray()&&!compact.path("tools").isEmpty();
        for(var tool:compact.path("tools")) {
            var schema=tool.path("inputSchema");var required=schema.path("required");var properties=schema.path("properties");
            if(!tool.path("name").isTextual()||!toolNames.add(tool.path("name").asText())
                    ||!schema.isObject()||!schema.path("type").asText().equals("object")
                    ||!schema.path("additionalProperties").isBoolean()||schema.path("additionalProperties").asBoolean()
                    ||!properties.isObject()||!required.isArray()
                    ||schema.propertyNames().stream().anyMatch(key->!Set.of("$schema","$id","title","description","type","additionalProperties","required","properties").contains(key))) {
                supported=false;break;
            }
            var names=new HashSet<String>();
            for(var name:required)if(!name.isTextual()||!names.add(name.asText()))supported=false;
            if(!names.equals(new HashSet<>(properties.propertyNames()))) {supported=false;break;}
            for(var name:properties.propertyNames()) {
                var rule=properties.path(name);
                if(rules.has(name)&&!rules.path(name).equals(rule))supported=false;
                rules.set(name,rule.deepCopy());
            }
            var signature=signatures.addObject();signature.set("name",tool.path("name").deepCopy());
            signature.set("requiredArguments",required.deepCopy());
        }
        if(supported) {
            compact.set("tools",signatures);compact.set("toolArgumentSchemas",rules);
            compact.put("toolArgumentPolicy","All requiredArguments are mandatory; no other argument keys are allowed.");
        }
        for(var observed:compact.path("observations"))if(observed.isObject()) {
            var receipt=(tools.jackson.databind.node.ObjectNode)observed;
            receipt.remove("callId");
            for(var name:new ArrayList<>(receipt.propertyNames()))if(receipt.path(name).isNull())receipt.remove(name);
            if(receipt.has("afterDigest")&&receipt.path("beforeDigest").equals(receipt.path("afterDigest")))receipt.remove("beforeDigest");
        }
        for(var file:compact.path("sourceFiles"))if(file.isObject()&&file.path("digest").isTextual()) {
            for(var receipt:compact.path("observations"))if(receipt.path("status").asText().equals("SUCCEEDED")
                    &&!receipt.path("stale").asBoolean()&&receipt.path("path").equals(file.path("path"))
                    &&receipt.path("afterDigest").equals(file.path("digest"))) {
                ((tools.jackson.databind.node.ObjectNode)file).remove("digest");break;
            }
        }
        return compact.toString().getBytes(StandardCharsets.UTF_8).length<input.toString().getBytes(StandardCharsets.UTF_8).length?compact:input;
    }
    List<JsonNode> observations(){return List.copyOf(latest.values());}
    JsonNode sourceFiles(){return sourceFiles;}
    boolean repeatedPatch(){return repeatedPatch;}
    Map<String,Object> progress(){return Map.of("repeatedReads",repeatedReads,"sourceChanged",changed,
            "next",changed?"PROPOSE_COMPLETION_OR_NECESSARY_PATCH":repeatedReads>0?"PATCH_USING_OBSERVED_DIGEST":
                    latest.values().stream().anyMatch(o->o.path("tool").asText().equals("files.read"))?
                            "PATCH_OR_READ_MISSING_DEPENDENCY":"READ_REQUIRED_DEPENDENCIES_ONCE");}
    boolean observe(String name,JsonNode arguments,JsonNode actual) {
        repeatedPatch=false;
        var source=actual.path("source");String digest=source.path("sourceDigest").asText();
        if(!actual.path("status").asText().equals("SUCCEEDED")||!source.path("files").isArray()||digest.isBlank())throw new AgentFailure("AGENT_CHECKPOINT_INVALID");
        var current=new HashMap<String,String>();
        for(var file:source.path("files"))current.put(file.path("path").asText(),file.path("digest").asText());
        if(!digest.equals(sourceDigest)) {
            changed=true;repeatedReads=0;reads.remove("files.list:");
            // A dependency remains current only while its own observed digest still matches the actual manifest.
            for(var entry:latest.entrySet()) {
                var prior=entry.getValue();String path=prior.path("path").asText();
                if(!path.isBlank()&&!prior.path("afterDigest").asText().equals(current.get(path))) {
                    var stale=(tools.jackson.databind.node.ObjectNode)prior.deepCopy();
                    stale.putNull("content");if(stale.has("committedContent"))stale.putNull("committedContent");
                    stale.put("stale",true);entry.setValue(stale);reads.remove("files.read:"+path);
                }
            }
        }
        sourceFiles=source.path("files").deepCopy();sourceDigest=digest;
        String path=arguments.path("path").asText(),key=name+":"+path;
        boolean read=name.equals("files.read")||name.equals("files.list");
        int seen=read?reads.merge(key,1,Integer::sum):0;
        if(seen>1)repeatedReads++;
        var observed=new LinkedHashMap<String,Object>();observed.put("tool",name);observed.put("path",path);
        for(String field:List.of("callId","status","errorCode","content","beforeDigest","afterDigest"))observed.put(field,actual.path(field).deepCopy());
        if((name.equals("files.update")||name.equals("files.create"))&&arguments.path("content").isTextual()) {
            String content=arguments.path("content").asText(),committed=actual.path("afterDigest").asText();
            if(!hash(content).equals(committed)||!committed.equals(current.get(path)))throw new AgentFailure("AGENT_CHECKPOINT_INVALID");
            // This is digest-checked committed write content, not a fabricated files.read receipt.
            observed.put("committedContent",content);observed.put("contentOrigin","COMMITTED_WRITE_DIGEST_MATCHED");
        }
        // Do not duplicate full source text when a genuine later read supersedes the committed write projection.
        if(name.equals("files.read"))for(var entry:latest.entrySet())if(entry.getValue().path("path").asText().equals(path)
                &&entry.getValue().path("afterDigest").equals(actual.path("afterDigest"))&&entry.getValue().has("committedContent")) {
            var receipt=(tools.jackson.databind.node.ObjectNode)entry.getValue().deepCopy();receipt.remove("committedContent");entry.setValue(receipt);
        }
        latest.put(key,json.valueToTree(observed));
        if(Set.of("files.create","files.update","files.delete").contains(name))
            repeatedPatch=changed&&!writtenStates.add(digest);
        // Two repeated unchanged reads receive explicit feedback; a third stops with the existing CONTROL terminal.
        if(seen>3)throw new AgentFailure("AGENT_REPAIR_NO_PROGRESS");
        return seen>1;
    }
    private static String hash(String content) {
        try{return "sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException unavailable){throw new AgentFailure("AGENT_CHECKPOINT_INVALID");}
    }
}
