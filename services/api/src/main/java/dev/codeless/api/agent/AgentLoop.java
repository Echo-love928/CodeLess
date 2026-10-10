package dev.codeless.api.agent;

import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Truth-driven generation with a bounded VERIFY -> REPAIR -> GENERATE -> VERIFY cycle. */
public final class AgentLoop implements TaskStageRunner {
    private final AgentRunStore store;
    private final AgentModel model;
    private final PlanValidator plans;
    private final FileToolRegistry registry;
    private final FileToolService files;
    private final BuildGateway runner;
    private final AgentEvidence evidence;
    private final JsonMapper json=JsonMapper.builder().build();
    private final String planPolicy,generationPolicy,repairPolicy;
    private final RepairController repairs=new RepairController();
    private final boolean repairEnabled;
    public AgentLoop(AgentRunStore store,AgentModel model,PlanValidator plans,FileToolRegistry registry,
                     FileToolService files,BuildGateway runner,AgentEvidence evidence) {
        this(store,model,plans,registry,files,runner,evidence,true);
    }
    public AgentLoop(AgentRunStore store,AgentModel model,PlanValidator plans,FileToolRegistry registry,
                     FileToolService files,BuildGateway runner,AgentEvidence evidence,boolean repairEnabled) {
        this.store=store;this.model=model;this.plans=plans;this.registry=registry;this.files=files;this.runner=runner;this.evidence=evidence;
        this.repairEnabled=repairEnabled;
        try {
            planPolicy=new ClassPathResource("model/prompts/plan-v1.txt").getContentAsString(StandardCharsets.UTF_8)+"\nJSON schema:\n"+plans.schemaJson();
            String proposalPolicy=new ClassPathResource("model/prompts/agent-proposal-protocol-v1.txt").getContentAsString(StandardCharsets.UTF_8)+"\n";
            generationPolicy=proposalPolicy+new ClassPathResource("model/prompts/agent-generate-v1.txt").getContentAsString(StandardCharsets.UTF_8);
            repairPolicy=proposalPolicy+new ClassPathResource("model/prompts/repair/agent-repair-v1.txt").getContentAsString(StandardCharsets.UTF_8);
        } catch(Exception failure) {throw new AgentFailure("AGENT_CONFIGURATION");}
    }
    public StageResult execute(UUID taskId,TaskStatus stage) {throw new AgentFailure("AGENT_ORIGINAL_CLAIM_REQUIRED");}
    @Override public StageResult execute(TaskQueueService.Claim claim,TaskStatus stage) {
        try {
            var context=store.context(claim,stage);
            var events=store.read(claim,stage);
            // Re-entry after a crash requires an explicit operator decision; never duplicate a
            // charged request, a filesystem mutation or a completed runner execution.
            boolean completedTransition=!events.isEmpty() && events.getLast().path("kind").asText().equals("stage.finished")
                    && events.getLast().path("payload").path("next").asText().equals(stage.name())
                    && !events.getLast().path("stage").asText().equals(stage.name());
            if(events.stream().anyMatch(e -> stage.name().equals(e.path("stage").asText())) && !completedTransition)
                throw new AgentFailure("AGENT_RECOVERY_REQUIRED");
            StageResult result=switch(stage) {
                case PLAN -> {
                    RequestPolicy.validate(context.prompt());
                    var candidate=model.call(claim,stage,planPolicy,json.valueToTree(Map.of("request",context.prompt(),"dataMode",context.dataMode(),"tools",List.of())));
                    var plan=plans.validate(candidate.toString(),context.dataMode());
                    store.append(claim,stage,"plan",plan);
                    yield new StageResult(TaskStatus.GENERATE,"Validated plan saved",null);
                }
                case GENERATE -> {
                    if(context.repairAttempts()>0) {
                        // REPAIR already proposed and applied the patch. GENERATE only freezes its
                        // real bytes, preserving the public v0 REPAIR -> GENERATE -> VERIFY grammar.
                        JsonNode actions=AgentJournal.latest(events,"repair.done").path("actions");
                        yield snapshot(claim,AgentJournal.latest(events,"plan"),actions);
                    }
                    yield generate(claim,context,AgentJournal.latest(events,"plan"),null);
                }
                case VERIFY -> verify(claim,context,AgentJournal.latest(events,"draft"));
                case REPAIR -> {
                    if(!repairEnabled || context.repairAttempts()<1 || context.repairAttempts()>RuntimeBudget.REPAIRS)
                        throw new AgentFailure("AGENT_REPAIR_LIMIT_EXCEEDED");
                    yield generate(claim,context,AgentJournal.latest(events,"plan"),AgentJournal.latest(events,"repair.failure"));
                }
                default -> throw new AgentFailure("AGENT_STAGE_UNSUPPORTED");
            };
            store.append(claim,stage,"stage.finished",Map.of("next",result.next().name()));
            return result;
        } catch(RuntimeException failure) {
            String code=failure instanceof ModelFailure m?m.code():
                    failure instanceof AgentFailure || failure instanceof FileToolFailure?failure.getMessage():"AGENT_INTERNAL_ERROR";
            if(code==null || !code.matches("[A-Z][A-Z0-9_]{1,100}")) code="AGENT_INTERNAL_ERROR";
            try {store.append(claim,stage,"failure",Map.of("code",code,"category",repairs.category(code).name(),
                    "recovery","MANUAL_REVIEW_NO_AUTOMATIC_RETRY"));}
            catch(RuntimeException unavailable) { /* DB state still fails; prior forced checkpoints remain. */ }
            return new StageResult(TaskStatus.FAILED,"Generation stopped; recovery information retained",code);
        }
    }
    private StageResult generate(TaskQueueService.Claim claim,AgentRunStore.Context context,JsonNode plan,JsonNode failure) {
        boolean repair=failure!=null;TaskStatus stage=repair?TaskStatus.REPAIR:TaskStatus.GENERATE;
        var observations=new ArrayList<JsonNode>();
        JsonNode previousDraft=repair?AgentJournal.latest(store.read(claim,stage),"draft"):null;
        JsonNode originalActions=repair?previousDraft.path("actions"):null;
        RepairContext repairContext=repair?new RepairContext(previousDraft):null;
        Set<String> planned=new TreeSet<>();plan.path("files").forEach(f -> planned.add(f.path("path").asText()));
        Set<String> names=new HashSet<>();registry.definitions().path("tools").forEach(t -> names.add(t.path("name").asText()));
        for(int i=0;i<RuntimeBudget.MODEL_CALLS;i++) {
            var input=new LinkedHashMap<String,Object>();input.put("phase",stage.name());input.put("request",context.prompt());
            input.put("dataMode",context.dataMode());input.put("plan",plan);input.put("tools",registry.definitions().path("tools"));
            input.put("observations",repair?repairContext.observations():observations);
            if(repair) {input.put("failure",failure);input.put("originalActions",originalActions);input.put("sourceFiles",repairContext.sourceFiles());
                input.put("repairAttempt",context.repairAttempts());input.put("repairProgress",repairContext.progress());
                var meter=RuntimeBudget.meter(store.read(claim,stage));
                input.put("budget",Map.of("modelCallsRemaining",RuntimeBudget.MODEL_CALLS-meter.models(),
                        "toolCallsRemaining",RuntimeBudget.TOOL_CALLS-meter.tools(),"tokensRemaining",RuntimeBudget.TOKENS-meter.chargedTokens()));}
            JsonNode reply=model.call(claim,stage,repair?repairPolicy:generationPolicy,json.valueToTree(input));
            if(reply.path("type").asText().equals("tool")) {
                closed(reply,Set.of("type","name","arguments"));
                String name=reply.path("name").asText();
                if(!names.contains(name)) throw new AgentFailure("AGENT_TOOL_NOT_ALLOWED");
                JsonNode arguments=reply.path("arguments");
                if(arguments.has("path") && !planned.contains(arguments.path("path").asText())) throw new AgentFailure("AGENT_UNPLANNED_FILE");
                store.reserve(claim,stage,"tool.request",0);
                FileToolService.Result actual=files.execute(claim.taskId(),claim.token(),name,arguments.toString());
                JsonNode observed=json.valueToTree(actual);
                store.append(claim,stage,"tool.result",observed);
                if(!actual.status().equals("SUCCEEDED")) throw new AgentFailure(actual.errorCode());
                if(repair) {
                    boolean repeated=repairContext.observe(name,arguments,observed);
                    if(repeated)store.append(claim,stage,"repair.read.repeat",Map.of("tool",name,"path",arguments.path("path").asText(),
                            "callId",actual.callId(),"progress",repairContext.progress()));
                } else observations.add(observed);
            } else if(reply.path("type").asText().equals("done")) {
                closed(reply,Set.of("type","actions"));
                validateCoverage(plan,reply.path("actions"));
                if(repair) {
                    if(!originalActions.equals(reply.path("actions"))) throw new AgentFailure("AGENT_REPAIR_ACCEPTANCE_CHANGED");
                    store.append(claim,stage,"repair.done",Map.of("actions",originalActions));
                    return new StageResult(TaskStatus.GENERATE,"Repair proposal applied; source must be frozen and verified",null);
                }
                return snapshot(claim,plan,reply.path("actions"));
            } else throw new AgentFailure("AGENT_MODEL_PROTOCOL_INVALID");
        }
        throw new AgentFailure("AGENT_MODEL_BUDGET_EXCEEDED");
    }
    private StageResult snapshot(TaskQueueService.Claim claim,JsonNode plan,JsonNode actions) {
        Set<String> planned=new TreeSet<>();plan.path("files").forEach(f -> planned.add(f.path("path").asText()));
        store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);
        var snapshot=files.snapshot(claim.taskId(),claim.token());
        if(!planned.equals(new TreeSet<>(snapshot.source().files().stream().map(ControlledWorkspace.SourceFile::path).toList())))
            throw new AgentFailure("AGENT_PLAN_FILES_MISMATCH");
        store.draft(claim,snapshot,actions);
        return new StageResult(TaskStatus.VERIFY,"Immutable source candidate saved",null);
    }
    private static void closed(JsonNode value,Set<String> fields) {
        if(!value.isObject() || !new HashSet<>(value.propertyNames()).equals(fields)) throw new AgentFailure("AGENT_MODEL_PROTOCOL_INVALID");
    }
    private static void validateCoverage(JsonNode plan,JsonNode actions) {
        if(!actions.isArray() || actions.isEmpty() || actions.size()>20) throw new AgentFailure("AGENT_ACCEPTANCE_INVALID");
        Set<String> covered=new HashSet<>();String route=null;
        for(JsonNode action:actions) {
            String type=action.path("type").asText();
            if(type.equals("navigate")) {
                route=action.path("path").asText();
                if(!Set.of("/","/tasks","/catalog").contains(route)) throw new AgentFailure("AGENT_ACCEPTANCE_INVALID");
            }
            if(route!=null && Set.of("expectText","expectVisible").contains(type)) covered.add(route);
        }
        for(JsonNode page:plan.path("pages")) if(!covered.contains(page.path("route").asText())) throw new AgentFailure("AGENT_ACCEPTANCE_INCOMPLETE");
    }
    private StageResult verify(TaskQueueService.Claim claim,AgentRunStore.Context context,JsonNode draft) {
        store.reserveVerification(claim);
        JsonNode actual=runner.run(draft,context.deadline());
        store.append(claim,TaskStatus.VERIFY,"runner.result",actual);
        evidence.validate(draft,actual);
        if(!actual.path("status").asText().equals("VERIFIED")) {
            store.failedBuild(claim,draft,actual);
            var failure=repairs.classify(actual);
            String stop=repairEnabled?repairs.stop(failure,draft.path("sourceDigest").asText(),store.read(claim,TaskStatus.VERIFY),context.repairAttempts()):failure.code();
            var diagnostic=new LinkedHashMap<String,Object>();diagnostic.put("code",failure.code());diagnostic.put("category",failure.category().name());
            diagnostic.put("fingerprint",failure.fingerprint());diagnostic.put("diagnostic",failure.diagnostic());
            diagnostic.put("sourceDigest",draft.path("sourceDigest").asText());diagnostic.put("repairAttempts",context.repairAttempts());
            diagnostic.put("decision",stop==null?"REPAIR":stop);
            store.append(claim,TaskStatus.VERIFY,"repair.failure",diagnostic);
            if(stop!=null) throw new AgentFailure(stop);
            return new StageResult(TaskStatus.REPAIR,"Observed source error; bounded repair requested",null);
        }
        return new StageResult(TaskStatus.READY,"PREVIEW_READY pending atomic version commit",null);
    }
    @Override public TaskQueueService.TaskView advance(TaskQueueService queue,TaskQueueService.Claim claim,StageResult result,EventType type) {
        if(result.next()!=TaskStatus.READY) return TaskStageRunner.super.advance(queue,claim,result,type);
        try {
            var events=store.read(claim,TaskStatus.VERIFY);
            var draft=AgentJournal.latest(events,"draft");var actual=AgentJournal.latest(events,"runner.result");
            evidence.validate(draft,actual);
            if(!actual.path("status").asText().equals("VERIFIED")) throw new AgentFailure("AGENT_RUNNER_RESULT_INVALID");
            return store.complete(queue,claim,draft,actual);
        } catch(RuntimeException failure) {
            try {store.append(claim,TaskStatus.VERIFY,"failure",Map.of("code",failure instanceof AgentFailure?failure.getMessage():"AGENT_COMMIT_FAILED",
                    "recovery","RECONCILE_CHECKPOINT_WITH_DATABASE"));} catch(RuntimeException unavailable) { /* retain existing evidence */ }
            throw failure;
        }
    }
}
