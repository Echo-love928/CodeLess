package dev.codeless.api.agent;

import dev.codeless.api.model.*;
import dev.codeless.api.tasks.TaskQueueService;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import java.time.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** The provider only proposes JSON; actual tools and trusted orchestration own all verdicts. */
public final class AgentModel {
    private final ModelProvider provider;
    private final ModelCallRepository records;
    private final ModelCallAudit audit;
    private final AgentRunStore store;
    private final JsonMapper json=JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    private final JsonMapper lenient=JsonMapper.builder().build();
    public AgentModel(ModelProvider provider, ModelCallRepository records, ModelCallAudit audit, AgentRunStore store) {
        this.provider=provider;this.records=records;this.audit=audit;this.store=store;
    }
    /** Output allowance the next request of this size would receive, or null when it cannot be funded. */
    public Integer allowance(RuntimeBudget.Meter meter, String policy, JsonNode input) {
        return RuntimeBudget.outputAllowance(meter,RuntimeBudget.inputReservation(policy,input.toString()));
    }
    public JsonNode call(TaskQueueService.Claim claim, TaskStatus stage, String policy, JsonNode input) {
        var context=store.context(claim,stage);
        String user=input.toString();
        // UTF-8 bytes are a conservative input-token reservation for the configured BPE provider; add framing
        // margin. The output allowance is what remains under the cap (at most 4096), and the provider enforces
        // it as max_tokens, so a request that fits is never refused for an output it was not going to use.
        int inputReservation=RuntimeBudget.inputReservation(policy,user);
        int outputTokens=store.reserveModel(claim,stage,inputReservation);
        int reserved=Math.addExact(inputReservation,outputTokens);
        var attempt=records.startStage(claim.taskId(),claim.token(),provider.id(),provider.model(),stage.name());
        long start=System.nanoTime();
        ModelProvider.Evidence evidence=ModelProvider.Evidence.unknown();
        String error=null;
        Map<String,Object> invalid=null;
        try {
            audit.write(record(attempt,claim,stage,evidence,"REQUESTED",null,null));
            Duration remaining=Duration.between(Instant.now(),context.deadline().toInstant());
            Duration timeout=remaining.compareTo(Duration.ofSeconds(60))<0?remaining:Duration.ofSeconds(60);
            if (timeout.toMillis()<1) throw new ModelFailure("MODEL_TIMEOUT");
            var prompt=new Prompt(List.of(new SystemMessage(policy),new UserMessage(user)));
            // Correlate the actual inputs without persisting task text, generated source or Authorization.
            store.append(claim,stage,"model.input",Map.of("callId",attempt.callId(),"policyDigest",digest(policy),
                    "inputDigest",digest(user),"policyBytes",policy.getBytes(StandardCharsets.UTF_8).length,
                    "inputBytes",user.getBytes(StandardCharsets.UTF_8).length,"roles",List.of("system","user"),
                    "transport",provider.requestMetadata(prompt,outputTokens)));
            ModelProvider.Reply reply;
            try {reply=provider.call(prompt,outputTokens,timeout);}
            catch(ModelFailure failure) {
                if(failure.detail()!=null) invalid=Map.of("source","PROVIDER","reason",failure.detail(),"outputTokens",outputTokens);
                throw failure;
            }
            evidence=reply.evidence();
            if (reply.content()==null || reply.content().getBytes(StandardCharsets.UTF_8).length>256*1024)
                throw new ModelFailure("MODEL_RESPONSE_LIMIT",evidence);
            JsonNode result;
            try {result=json.readTree(reply.content());}
            catch(RuntimeException unparsable) {invalid=shape(reply.content(),unparsable);throw new ModelFailure("MODEL_INVALID_RESPONSE",evidence);}
            if (result==null || !result.isObject()) {invalid=shape(reply.content(),null);throw new ModelFailure("MODEL_INVALID_RESPONSE",evidence);}
            var usage=evidence.usage();
            if (RuntimeBudget.charge(usage,inputReservation,outputTokens).chargedTokens()>reserved)
                throw new ModelFailure("MODEL_BUDGET_EXCEEDED",evidence);
            store.append(claim,stage,"model.response",result);
            return result;
        } catch (ModelFailure failure) { evidence=failure.evidence();error=failure.code();throw failure; }
        catch (AgentFailure failure) {error=failure.getMessage();throw failure;}
        catch (RuntimeException failure) {error="MODEL_INVALID_RESPONSE";throw new ModelFailure(error,evidence);}
        finally {
            var usage=evidence.usage();
            var charge=RuntimeBudget.charge(usage,inputReservation,outputTokens);
            RuntimeException checkpointFailure=null;
            try {
                // Shape only: never the reply text, which can contain generated source.
                if(invalid!=null) store.append(claim,stage,"model.invalid",invalid);
                store.append(claim,stage,"model.usage",Map.of("usage",usage,
                    "releasedTokens",charge.releasedTokens(),"chargedTokens",charge.chargedTokens(),
                    "estimated",charge.estimated(),"meteringSource",charge.source(),"reservationTokens",reserved));
            }
            catch(RuntimeException failure) {checkpointFailure=failure;}
            try {
                audit.write(record(attempt,claim,stage,evidence,error==null?"SUCCEEDED":"FAILED",error,
                        Math.max(0,(System.nanoTime()-start)/1000000)));
            } catch (ModelFailure failure) {
                records.finish(attempt.callId(),failure.code(),evidence.usage());
                throw failure;
            }
            records.finish(attempt.callId(),error,evidence.usage());
            if(checkpointFailure!=null) throw checkpointFailure;
        }
    }
    /**
     * Content-free description of a reply the strict parser refused: byte count, digest, parser position, how many
     * root values a lenient reader finds, and the root object's key names and type value when they are plain words.
     */
    private Map<String,Object> shape(String content,RuntimeException failure) {
        var out=new LinkedHashMap<String,Object>();
        out.put("source","PARSER");
        String message=failure==null?"":String.valueOf(failure.getMessage());
        out.put("reason",failure==null?"ROOT_NOT_OBJECT":message.contains("Duplicate")?"DUPLICATE_KEY":
                message.contains("Trailing token")?"TRAILING_TOKENS":content.isBlank()?"EMPTY":"SYNTAX");
        out.put("contentBytes",content.getBytes(StandardCharsets.UTF_8).length);
        out.put("contentDigest",digest(content));
        if(failure instanceof tools.jackson.core.JacksonException jackson && jackson.getLocation()!=null) {
            out.put("line",jackson.getLocation().getLineNr());out.put("column",jackson.getLocation().getColumnNr());
        }
        var roots=new ArrayList<String>();List<String> keys=List.of();String type=null;
        try(var values=lenient.readerFor(JsonNode.class).<JsonNode>readValues(content)) {
            while(values.hasNextValue() && roots.size()<5) {
                JsonNode value=values.nextValue();
                roots.add(value.isObject()?"OBJECT":value.isArray()?"ARRAY":value.isString()?"STRING":value.getNodeType().name());
                if(roots.size()==1 && value.isObject()) {
                    keys=value.propertyNames().stream().filter(k -> k.matches("[A-Za-z_]{1,40}")).limit(10).toList();
                    if(value.path("type").isString() && value.path("type").asText().matches("[a-z_]{1,40}")) type=value.path("type").asText();
                }
            }
        } catch(RuntimeException unreadable) {roots.add("UNREADABLE");}
        out.put("rootValues",roots);out.put("rootKeys",keys);
        if(type!=null) out.put("rootType",type);
        return out;
    }
    private static String digest(String value) {
        try {return "sha256:"+java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException impossible){throw new AgentFailure("AGENT_CONFIGURATION");}
    }
    private ModelCallAudit.Record record(ModelCallRepository.Attempt attempt, TaskQueueService.Claim claim, TaskStatus stage,
                                        ModelProvider.Evidence evidence,String status,String error,Long duration) {
        return new ModelCallAudit.Record(attempt.callId(),claim.taskId(),stage.name(),provider.id(),provider.model(),
                evidence.actualModel(),evidence.requestId(),evidence.responseId(),status,duration,evidence.usage(),error,
                attempt.createdAt(),duration==null?null:Instant.now().toString());
    }
}
