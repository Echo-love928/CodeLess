package dev.codeless.api.agent;

import dev.codeless.api.model.*;
import dev.codeless.api.tasks.TaskQueueService;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import java.time.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
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
    public AgentModel(ModelProvider provider, ModelCallRepository records, ModelCallAudit audit, AgentRunStore store) {
        this.provider=provider;this.records=records;this.audit=audit;this.store=store;
    }
    public JsonNode call(TaskQueueService.Claim claim, TaskStatus stage, String policy, JsonNode input) {
        var context=store.context(claim,stage);
        String user=input.toString();
        // UTF-8 bytes are a conservative input-token reservation for the configured BPE provider;
        // add framing margin and retain reservations even after errors/unknown usage.
        int reserved=policy.getBytes(StandardCharsets.UTF_8).length+user.getBytes(StandardCharsets.UTF_8).length+4096+512;
        store.reserve(claim,stage,"model.request",reserved);
        var attempt=records.startStage(claim.taskId(),claim.token(),provider.id(),provider.model(),stage.name());
        long start=System.nanoTime();
        ModelProvider.Evidence evidence=ModelProvider.Evidence.unknown();
        String error=null;
        try {
            audit.write(record(attempt,claim,stage,evidence,"REQUESTED",null,null));
            Duration remaining=Duration.between(Instant.now(),context.deadline().toInstant());
            Duration timeout=remaining.compareTo(Duration.ofSeconds(60))<0?remaining:Duration.ofSeconds(60);
            if (timeout.toMillis()<1) throw new ModelFailure("MODEL_TIMEOUT");
            var reply=provider.call(new Prompt(List.of(new SystemMessage(policy),new UserMessage(user))),4096,timeout);
            evidence=reply.evidence();
            if (reply.content()==null || reply.content().getBytes(StandardCharsets.UTF_8).length>256*1024)
                throw new ModelFailure("MODEL_RESPONSE_LIMIT",evidence);
            JsonNode result=json.readTree(reply.content());
            if (result==null || !result.isObject()) throw new ModelFailure("MODEL_INVALID_RESPONSE",evidence);
            var usage=evidence.usage();
            if (usage.totalTokens()!=null && usage.totalTokens()>reserved || usage.inputTokens()!=null && usage.outputTokens()!=null
                    && (long)usage.inputTokens()+usage.outputTokens()>reserved)
                throw new ModelFailure("MODEL_BUDGET_EXCEEDED",evidence);
            store.append(claim,stage,"model.response",result);
            return result;
        } catch (ModelFailure failure) { evidence=failure.evidence();error=failure.code();throw failure; }
        catch (AgentFailure failure) {error=failure.getMessage();throw failure;}
        catch (RuntimeException failure) {error="MODEL_INVALID_RESPONSE";throw new ModelFailure(error,evidence);}
        finally {
            var usage=evidence.usage();
            long charged=reserved;
            if(usage.inputTokens()!=null && usage.outputTokens()!=null) {
                charged=(long)usage.inputTokens()+usage.outputTokens();
                if(usage.totalTokens()!=null) charged=Math.max(charged,usage.totalTokens());
            }
            RuntimeException checkpointFailure=null;
            try {store.append(claim,stage,"model.usage",java.util.Map.of("usage",usage,
                    "releasedTokens",Math.max(0,reserved-charged),"reservationTokens",reserved));}
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
    private ModelCallAudit.Record record(ModelCallRepository.Attempt attempt, TaskQueueService.Claim claim, TaskStatus stage,
                                        ModelProvider.Evidence evidence,String status,String error,Long duration) {
        return new ModelCallAudit.Record(attempt.callId(),claim.taskId(),stage.name(),provider.id(),provider.model(),
                evidence.actualModel(),evidence.requestId(),evidence.responseId(),status,duration,evidence.usage(),error,
                attempt.createdAt(),duration==null?null:Instant.now().toString());
    }
}
