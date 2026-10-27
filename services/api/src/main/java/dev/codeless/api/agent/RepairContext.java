package dev.codeless.api.agent;

import java.util.*;
import java.util.regex.Pattern;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Model-facing projection only. Full real tool results remain in the durable journal. */
final class RepairContext {
    static final String SOURCE_ORIGIN="FROZEN_FAILED_CANDIDATE_DIGEST_MATCHED";
    static final Set<String> READ_TOOLS=Set.of("files.list","files.read");
    private static final Pattern IMPORT=Pattern.compile("(?:\\bfrom|\\bimport)\\s*['\"](\\.{1,2}/[^'\"\\s]+)['\"]");
    private final JsonMapper json=JsonMapper.builder().build();
    private final Map<String,JsonNode> latest=new LinkedHashMap<>();
    private final Map<String,Integer> reads=new LinkedHashMap<>();
    private final Map<String,String> frozen=new LinkedHashMap<>();
    private final Map<String,String> seeds=new LinkedHashMap<>();
    private JsonNode sourceFiles;
    private String sourceDigest;
    private int repeatedReads;
    private boolean changed;
    RepairContext(JsonNode draft){sourceFiles=draft.path("files").deepCopy();sourceDigest=draft.path("sourceDigest").asText();}
    /** The failed candidate's own frozen text; every file must hash to the digest its draft recorded (D24-A round 2). */
    void frozen(Map<String,String> sources) {
        var recorded=new LinkedHashMap<String,String>();
        for(var file:sourceFiles)recorded.put(file.path("path").asText(),file.path("digest").asText());
        if(!recorded.keySet().equals(sources.keySet()))throw new AgentFailure("AGENT_CHECKPOINT_INVALID");
        for(var source:sources.entrySet())if(!hash(source.getValue()).equals(recorded.get(source.getKey())))throw new AgentFailure("AGENT_CHECKPOINT_INVALID");
        frozen.clear();frozen.putAll(sources);
    }
    Set<String> frozenPaths(){return Collections.unmodifiableSet(frozen.keySet());}
    boolean seed(String path){if(!frozen.containsKey(path)||seeds.containsKey(path))return false;seeds.put(path,hash(frozen.get(path)));return true;}
    void unseed(String path){seeds.remove(path);}
    int seeded(){return seeds.size();}
    /** Content-free record of the seeded files and of the frozen files left to an explicit read. */
    List<Map<String,Object>> seedSummary() {
        var out=new ArrayList<Map<String,Object>>();
        seeds.forEach((path,digest)->out.add(Map.of("path",path,"digest",digest,"bytes",frozen.get(path).getBytes(StandardCharsets.UTF_8).length)));
        return out;
    }
    List<String> unseeded(){return frozen.keySet().stream().filter(path->!seeds.containsKey(path)).sorted().toList();}
    /** Seeded frozen text that no genuine current read or digest-checked write of the same bytes has superseded. */
    JsonNode repairSources() {
        var files=json.createArrayNode();
        seeds.forEach((path,digest)->{
            if(current(path,digest))return;
            var file=files.addObject();file.put("path",path);file.put("digest",digest);file.put("content",frozen.get(path));
        });
        if(files.isEmpty())return null;
        var out=json.createObjectNode();out.put("origin",SOURCE_ORIGIN);out.set("files",files);return out;
    }
    private boolean current(String path,String digest) {
        return latest.values().stream().anyMatch(o->o.path("path").asText().equals(path)&&!o.path("stale").asBoolean()
                &&o.path("afterDigest").asText().equals(digest)&&(o.path("content").isString()||o.path("committedContent").isString()));
    }
    /**
     * Upper bound on what one more read or list can add to the next request: the serialized receipt of the largest
     * readable frozen file not yet in context (exact bytes: the source has not changed), plus framing margin.
     */
    int readGrowth(Collection<String> readable) {
        int largest=receiptBytes("");
        for(String path:readable)if(frozen.containsKey(path)&&!seeds.containsKey(path)&&!current(path,hash(frozen.get(path))))
            largest=Math.max(largest,receiptBytes(frozen.get(path))+path.length());
        return largest+RuntimeBudget.FRAMING_TOKENS;
    }
    private int receiptBytes(String content) {
        var receipt=new LinkedHashMap<String,Object>();receipt.put("tool","files.read");receipt.put("path","");
        receipt.put("callId",new UUID(0,0).toString());receipt.put("status","SUCCEEDED");receipt.put("errorCode",null);receipt.put("content",content);
        receipt.put("beforeDigest","sha256:"+"0".repeat(64));receipt.put("afterDigest","sha256:"+"0".repeat(64));
        return json.writeValueAsString(receipt).getBytes(StandardCharsets.UTF_8).length;
    }
    /**
     * Failure-first seed order over frozen planned files: files the diagnostic names, the page of the failing route, each
     * file's planned relative imports, then the remaining pages, components and data with their imports. Diagnostic text
     * only orders host-owned bytes; it grants no path.
     */
    static List<String> seedOrder(JsonNode plan,JsonNode failure,JsonNode actions,Map<String,String> sources) {
        var planned=new ArrayList<String>();
        for(var file:plan.path("files"))if(sources.containsKey(file.path("path").asText()))planned.add(file.path("path").asText());
        String diagnostic=failure.path("diagnostic").asText("");
        var targets=new ArrayDeque<String>();
        planned.stream().filter(diagnostic::contains).sorted(Comparator.comparingInt(diagnostic::indexOf)).forEach(targets::add);
        String route=null;
        if(failure.path("failedAction").path("index").isInt())
            for(int i=0;i<=failure.path("failedAction").path("index").asInt()&&i<actions.size();i++)
                if(actions.get(i).path("type").asText().equals("navigate"))route=actions.get(i).path("path").asText();
        var routePages=new ArrayList<String>();
        for(var page:plan.path("pages"))if(page.path("route").asText().equals(route)&&planned.contains(page.path("file").asText()))routePages.add(page.path("file").asText());
        // A missing test ID can name a reachable component whose definition must precede its call site (CAT-02).
        // An unrelated/unmounted component with the same marker must not displace the failed page. Both attribute
        // and import text are only ordering hints over already-planned frozen files, never path permissions.
        var reachable=new HashSet<String>();var pending=new ArrayDeque<>(routePages);
        while(!pending.isEmpty()) {
            String path=pending.poll();
            if(reachable.add(path))pending.addAll(imports(path,sources.get(path),sources.keySet()));
        }
        String testId=failure.path("failedAction").path("action").path("target").path("testId").asText("");
        if(!testId.isBlank()) {
            var owner=Pattern.compile("(?<![\\w:-])(?:data-testid|data-ai-component)\\s*=\\s*([\"'])"+Pattern.quote(testId)+"\\1");
            planned.stream().filter(reachable::contains).filter(path->owner.matcher(sources.get(path)).find()).forEach(targets::add);
        }
        routePages.forEach(targets::add);
        var rest=new ArrayDeque<String>();
        for(String prefix:List.of("src/pages/","src/components/","src/data/"))for(String path:planned)if(path.startsWith(prefix))rest.add(path);
        for(String path:planned)if(!rest.contains(path))rest.add(path);
        var order=new LinkedHashSet<String>();
        while(!targets.isEmpty()||!rest.isEmpty()) {
            String next=targets.isEmpty()?rest.poll():targets.poll();
            if(order.add(next))for(String dependency:imports(next,sources.get(next),sources.keySet()))if(!order.contains(dependency))targets.add(dependency);
        }
        return List.copyOf(order);
    }
    static List<String> imports(String file,String content,Set<String> paths) {
        var found=new ArrayList<String>();if(content==null||file.lastIndexOf('/')<0)return found;
        var matcher=IMPORT.matcher(content);String directory=file.substring(0,file.lastIndexOf('/'));
        while(matcher.find()) {
            String resolved=normalize(directory+"/"+matcher.group(1));
            for(String candidate:List.of(resolved,resolved+".ts",resolved+".vue"))if(paths.contains(candidate)){found.add(candidate);break;}
        }
        return found;
    }
    private static String normalize(String path) {
        var parts=new ArrayList<String>();
        for(String part:path.split("/")) {
            if(part.equals("..")){if(parts.isEmpty())return "";parts.removeLast();}
            else if(!part.equals(".")&&!part.isEmpty())parts.add(part);
        }
        return String.join("/",parts);
    }
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
        JsonNode complete=withActionContext(input,originalActions);
        var compact=(tools.jackson.databind.node.ObjectNode)complete.deepCopy();
        compact.set("completionProposal",json.valueToTree(Map.of("type","done")));
        compact.set("originalAcceptance",json.valueToTree(Map.of("retainedByHost",true,"actionCount",originalActions.size(),
                "digest",hash(originalActions.toString()))));
        return compact.toString().getBytes(StandardCharsets.UTF_8).length<complete.toString().getBytes(StandardCharsets.UTF_8).length?compact:complete;
    }
    /**
     * REPAIR must know the state reached by the original actions, even when their large duplicate copy is omitted.
     * Assertions observe without changing state; retain every preceding navigation, reload and interaction in order.
     * The original failed action and host-owned actions are never edited. Uncorrelated failure data gets no invented trace.
     */
    static JsonNode withActionContext(JsonNode input,JsonNode originalActions) {
        var failure=input.path("failure");var failed=failure.path("failedAction");var action=failed.path("action");
        int index=failed.path("index").asInt(-1);
        if(!failure.isObject()||!failed.path("index").isInt()||index<0||index>=originalActions.size()
                ||!action.equals(originalActions.get(index))||!action.path("target").isObject()) return input;
        var json=JsonMapper.builder().build();var context=json.createObjectNode();
        context.put("targetCardinality",1);
        if(action.path("type").asText().equals("expectText"))context.put("textComparison","EXACT_NORMALIZED_INNER_TEXT");
        var preceding=context.putArray("precedingActions");
        for(int i=0;i<index;i++) {
            var prior=originalActions.get(i);
            if(Set.of("navigate","reload","click","fill","select","check").contains(prior.path("type").asText()))preceding.add(prior.deepCopy());
        }
        var complete=(tools.jackson.databind.node.ObjectNode)input.deepCopy();
        ((tools.jackson.databind.node.ObjectNode)complete.path("failure")).set("actionContext",context);
        return complete;
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
    /** True once an actual tool receipt shows source bytes different from the failed candidate's. */
    boolean changed(){return changed;}
    Map<String,Object> progress(){return progress(true);}
    /** The hint never points at a read the request does not offer (D24-A round 2). */
    Map<String,Object> progress(boolean reads){return Map.of("repeatedReads",repeatedReads,"sourceChanged",changed,
            "next",changed?"PROPOSE_COMPLETION_OR_NECESSARY_PATCH":repeatedReads>0?"PATCH_USING_OBSERVED_DIGEST":
                    repairSources()!=null?"PATCH_FROM_REPAIR_SOURCES":!reads?"PATCH_WITHOUT_FURTHER_READS":
                    latest.values().stream().anyMatch(o->o.path("tool").asText().equals("files.read"))?
                            "PATCH_OR_READ_MISSING_DEPENDENCY":"READ_REQUIRED_DEPENDENCIES_ONCE");}
    boolean observe(String name,JsonNode arguments,JsonNode actual) {
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
        // Two repeated unchanged reads receive explicit feedback; a third stops with the existing CONTROL terminal.
        if(seen>3)throw new AgentFailure("AGENT_REPAIR_NO_PROGRESS");
        return seen>1;
    }
    private static String hash(String content) {
        try{return "sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException unavailable){throw new AgentFailure("AGENT_CHECKPOINT_INVALID");}
    }
}
