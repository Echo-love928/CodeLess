package dev.codeless.api.agent;

import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Named provider fixtures; database, file tools, failed/fixed builds and browser are real. */
@SpringBootTest(properties={"codeless.model.provider=deterministic-mock","codeless.agent.enabled=true","codeless.agent.repository-root=../..",
        "codeless.agent.private-root=target/repair-integration/runtime","CODELESS_FILE_WORKSPACE_ROOT=target/repair-integration/workspaces",
        "CODELESS_FILE_AUDIT_ROOT=target/repair-integration/file-audit","codeless.model.audit-root=target/repair-integration/models"})
class RepairLoopIntegrationTest extends PostgresTestBase {
    @Autowired PlatformRepository repository;@Autowired TaskQueueService queue;@Autowired AgentRunStore store;
    @Autowired AgentJournal journal;@Autowired AgentEvidence evidence;@Autowired PlanValidator validator;
    @Autowired FileToolRegistry registry;@Autowired FileToolService files;@Autowired ModelCallRepository calls;
    @Autowired ModelCallAudit audit;@Autowired BuildGateway gateway;@Autowired JdbcClient jdbc;
    private final JsonMapper json=JsonMapper.builder().build();
    private static final String PAGE="src/pages/HomePage.vue";
    private static final String BROKEN="<script setup lang=\"ts\">import ProfileCard from '../components/MissingCard.vue';</script><template><main><ProfileCard/></main></template>";
    private static final String FIXED=BROKEN.replace("MissingCard.vue","ProfileCard.vue");
    private static String recordedInvalidReply() {
        try {return Files.readString(Path.of("../../tests/agent/repair/fixtures/model-json-object.json")).strip();}
        catch(java.io.IOException error){throw new IllegalStateException(error);}
    }
    // Renders visible text but not the component the original acceptance waits for (locator timeout, D24-A).
    private static final String NO_CARD="<script setup lang=\"ts\"></script><template><main><p>作品：CodeLess Showcase</p></main></template>";
    private static final String BROWSER_ERROR="<script setup lang=\"ts\">import { onMounted } from 'vue';"
            +"import ProfileCard from '../components/ProfileCard.vue';"
            +"onMounted(() => { window.setTimeout(() => { throw new Error('D10_A_BROWSER_PAGE_EXCEPTION'); }, 0); });"
            +"</script><template><main><ProfileCard/></main></template>";
    record Seed(UUID owner,UUID app,UUID task) {}
    @BeforeAll static void runtime() throws Exception {
        var process=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO().start();
        assertThat(process.waitFor(300,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(process.exitValue()).isZero();
    }
    Seed seed() {
        UUID owner=UUID.randomUUID(),app=UUID.randomUUID();repository.createUser(owner,owner+"@repair.test","D10 repair");
        repository.createApplication(app,owner,"Static showcase",DataMode.STATIC);
        UUID task=queue.create(owner,app,"生成 Ada Lovelace 静态个人展示页",null).id();
        jdbc.sql("UPDATE generation_tasks SET created_at='2000-01-01' WHERE id=?").param(task).update();return new Seed(owner,app,task);
    }
    AgentLoop loop(ModelProvider provider,BuildGateway runner) {
        return new AgentLoop(store,new AgentModel(provider,calls,audit,store),validator,registry,files,runner,evidence);
    }
    TaskQueueService.TaskView run(Seed seed,ModelProvider provider) {
        new TaskScheduler(queue,loop(provider,gateway)).tick();return queue.find(seed.owner(),seed.task()).orElseThrow();
    }
    final class Fixture implements ModelProvider {
        final String mode;final Seed seed;final MockModelProvider mock=new MockModelProvider();final AtomicInteger count=new AtomicInteger();
        final List<JsonNode> inputs=new ArrayList<>();final List<JsonNode> rejected=new ArrayList<>();
        Fixture(String mode,Seed seed){this.mode=mode;this.seed=seed;}
        public String id(){return "deterministic-mock";}public String model(){return "d10-repair-"+mode+"-fixture";}
        public Reply call(Prompt prompt,int max,Duration timeout) {
            count.incrementAndGet();var input=json.readTree(prompt.getUserMessage().getText());inputs.add(input);
            String phase=input.path("phase").asText();String content;
            if(Set.of("GENERATE","REPAIR").contains(phase)) {
                assertThat(prompt.getSystemMessage().getText()).startsWith("Application proposal protocol");
                if(phase.equals("GENERATE"))assertThat(prompt.getSystemMessage().getText()).contains("never json_object","Invalid replies terminate",
                    "REPAIR copies input.originalActions exactly into actions");
                else assertThat(prompt.getSystemMessage().getText()).contains("Each key occurs exactly once","The root type occurs once",
                    "done is {\"type\":\"done\"}","The host reuses the original actions in input.completionProposal, which cannot change.")
                    .doesNotContain("json_object","response_format","Invalid protocol reply");
                assertThat(max).isEqualTo(RuntimeBudget.OUTPUT_TOKENS);
            }
            if(!phase.equals("REPAIR")) {
                var reply=mock.call(prompt,max,timeout);var node=json.readTree(reply.content());
                if(node.path("arguments").path("path").asText().equals(PAGE))
                    ((tools.jackson.databind.node.ObjectNode)node.path("arguments")).put("content",mode.equals("browser")?BROWSER_ERROR:
                            mode.equals("locator")?NO_CARD:mode.startsWith("rejected")?FIXED:BROKEN);
                content=node.toString();
                if(mode.startsWith("rejected") && node.path("type").asText().equals("done")) {
                    var last=input.path("observations").get(input.path("observations").size()-1);
                    if(!last.path("status").asText().equals("REJECTED")) {
                        var actions=new ArrayList<Object>();actions.add(Map.of("type","navigate","path","/"));
                        for(int i=0;i<20;i++)actions.add(Map.of("type","expectVisible","target",Map.of("testId","profile-name")));
                        content=json.writeValueAsString(Map.of("type","done","actions",actions));
                    } else {
                        rejected.add(last);
                        if(mode.equals("rejected-twice")) content=json.writeValueAsString(Map.of("type","done","actions",List.of(Map.of("type","navigate","path","/"),
                                Map.of("type","click","target",Map.of("testId","toggle-{{item.id}}")),Map.of("type","expectVisible","target",Map.of("testId","profile-name")))));
                    }
                }
                if(mode.equals("invalid-generate") && phase.equals("GENERATE")) {
                    int observed=input.path("observations").size();
                    if(observed==1)content=json.writeValueAsString(Map.of("type","tool","name","files.read","arguments",Map.of("path","src/components/ProfileCard.vue")));
                    if(observed==2)content=recordedInvalidReply();
                }
            } else {
                if(mode.equals("browser")) {
                    assertThat(input.path("failure").path("code").asText()).isEqualTo("AGENT_PAGE_EXCEPTION");
                    assertThat(input.path("failure").path("diagnostic").asText()).contains("D10_A_BROWSER_PAGE_EXCEPTION");
                    assertThat(queue.find(seed.owner(),seed.task()).orElseThrow().status()).isEqualTo(TaskStatus.REPAIR);
                    assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
                }
                if(mode.equals("locator")) {
                    assertThat(input.path("failure").path("code").asText()).isEqualTo("AGENT_ACTION_TIMEOUT");
                    assertThat(input.path("failure").path("category").asText()).isEqualTo("CODE");
                    assertThat(input.path("failure").path("failedAction").path("index").asInt()).isEqualTo(1);
                }
                if(mode.equals("invalid-repair")) return new Reply(recordedInvalidReply(),new Evidence(model(),"explicit-recorded-protocol-fixture","explicit-recorded-protocol-fixture",new Usage(31,17,48,null)));
                if(mode.equals("network")) throw new ModelFailure("MODEL_NETWORK");
                if(mode.equals("cancel")) queue.cancel(seed.owner(),seed.task());
                if(mode.equals("timeout")) jdbc.sql("UPDATE generation_tasks SET deadline_at=clock_timestamp()-interval '1 second',lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=?").param(seed.task()).update();
                int observed=input.path("observations").size();
                if(mode.startsWith("duplicate-")&&observed==1) {
                    var actual=input.path("observations").get(0);
                    String valid=json.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of(
                            "path",PAGE,"expectedDigest",actual.path("afterDigest").asText(),"content",FIXED)));
                    content=mode.equals("duplicate-path")?valid.replace("\"path\":\""+PAGE+"\"","\"path\":\""+PAGE+"\",\"path\":\""+PAGE+"\""):
                            valid.replace("\"type\":\"tool\"","\"type\":\""+(mode.equals("duplicate-type")?"json_object":"tool")+"\",\"type\":\"tool\"");
                    return new Reply(content,new Evidence(model(),"explicit-synthetic-duplicate-key-fixture","explicit-synthetic-duplicate-key-fixture",new Usage(31,17,48,null)));
                }
                if(mode.equals("stuck") || mode.equals("cancel") || mode.equals("timeout") || mode.equals("weaken")) {
                    var actions=input.path("completionProposal").path("actions").deepCopy();
                    if(mode.equals("weaken")) ((tools.jackson.databind.node.ObjectNode)actions.get(1)).put("value","fake success");
                    content=json.writeValueAsString(Map.of("type","done","actions",actions));
                } else if(mode.equals("limit")) {
                    String digest="";for(var entry:input.path("sourceFiles"))if(entry.path("path").asText().equals(PAGE))digest=entry.path("digest").asText();
                    content=observed==0?json.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of(
                            "path",PAGE,"expectedDigest",digest,"content",BROKEN+"\n<!-- attempt "+input.path("repairAttempt").asInt()+" -->"))):
                            json.writeValueAsString(Map.of("type","done","actions",input.path("completionProposal").path("actions")));
                } else if(observed==0) content=json.writeValueAsString(Map.of("type","tool","name","files.read","arguments",Map.of("path",PAGE)));
                else if(observed==1) {
                    JsonNode actual=input.path("observations").get(0);
                    assertThat(actual.path("content").asText()).isEqualTo(mode.equals("browser")?BROWSER_ERROR:mode.equals("locator")?NO_CARD:BROKEN);
                    content=json.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of(
                            "path",PAGE,"expectedDigest",actual.path("afterDigest").asText(),"content",FIXED)));
                    if(mode.equals("host-complete")) {
                        // Synthetic exhaustion (as in D10AT3): reserve whatever is left, and charge this patch request in full.
                        var lease=new TaskQueueService.Claim(seed.task(),jdbc.sql("SELECT lease_token FROM generation_tasks WHERE id=?").param(seed.task()).query(UUID.class).single(),TaskStatus.REPAIR);
                        long left=RuntimeBudget.TOKENS-RuntimeBudget.meter(journal.read(seed.task())).chargedTokens();
                        store.reserve(lease,TaskStatus.REPAIR,"model.request",(int)left);
                        int input0=RuntimeBudget.inputReservation(prompt.getSystemMessage().getText(),prompt.getUserMessage().getText());
                        return new Reply(content,new Evidence(model(),"explicit-fixture-request","explicit-fixture-response",new Usage(input0,max,input0+max,null)));
                    }
                } else content=Set.of("bare","locator").contains(mode)?"{\"type\":\"done\"}":
                        json.writeValueAsString(Map.of("type","done","actions",input.path("completionProposal").path("actions")));
            }
            Usage usage=mode.equals("unknown")?Usage.unknown():new Usage(31,17,48,null);
            return new Reply(content,new Evidence(model(),"explicit-fixture-request","explicit-fixture-response",usage));
        }
    }
    @Test void recordedJsonObjectReplyStopsGenerateBeforeAnyRunnerOrRepair() throws Exception {
        var seed=seed();var provider=new Fixture("invalid-generate",seed);
        new TaskScheduler(queue,loop(provider,(draft,deadline)->{throw new AssertionError("invalid proposal must never launch runner");})).tick();
        assertRecordedInvalidTerminal(seed,provider,"GENERATE",4,0);
        assertThat(RuntimeBudget.meter(journal.read(seed.task())).tools()).isEqualTo(2);
    }
    @Test void recordedJsonObjectReplyStopsRepairWithoutFurtherEditsOrRetries() throws Exception {
        var seed=seed();var provider=new Fixture("invalid-repair",seed);run(seed,provider);
        assertRecordedInvalidTerminal(seed,provider,"REPAIR",5,1);
        assertThat(RuntimeBudget.meter(journal.read(seed.task())).tools()).isEqualTo(5);
        assertThat(journal.read(seed.task()).stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(1);
    }
    private void assertRecordedInvalidTerminal(Seed seed,Fixture provider,String stage,int modelCalls,int repairs) throws Exception {
        var task=queue.find(seed.owner(),seed.task()).orElseThrow();
        assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_MODEL_PROTOCOL_INVALID");
        assertThat(task.repairAttempts()).isEqualTo(repairs);assertThat(provider.count.get()).isEqualTo(modelCalls);
        var events=journal.read(seed.task());assertThat(RuntimeBudget.meter(events).models()).isEqualTo(modelCalls);
        assertThat(AgentJournal.latest(events,"model.response")).isEqualTo(json.readTree(recordedInvalidReply()));
        assertThat(AgentJournal.latest(events,"failure").path("category").asText()).isEqualTo("MODEL_INTERFACE");
        assertThat(jdbc.sql("SELECT count(*) FROM model_calls WHERE task_id=? AND stage=?").params(seed.task(),stage).query(Integer.class).single()).isEqualTo(stage.equals("GENERATE")?3:1);
        assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
        report("D10-A-protocol-"+stage.toLowerCase(Locale.ROOT),seed,Map.of("recordedReply",json.readTree(recordedInvalidReply()),
                "originTask","57776370-dd0b-4ed7-9931-cf6ff55e9ec4","originCandidate","7ea187f","realModelCallsInThisTest",0,"automaticRetries",0));
    }
    @Test void realBrowserPageExceptionRepairsWithoutChangingOriginalAcceptance() throws Exception {
        var seed=seed();var provider=new Fixture("browser",seed);var task=run(seed,provider);
        assertThat(task.status()).as(task.failureCode()).isEqualTo(TaskStatus.READY);assertThat(task.repairAttempts()).isEqualTo(1);
        var events=journal.read(seed.task());var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
        assertThat(results).hasSize(2);
        assertThat(results.getFirst().path("build").path("status").asText()).isEqualTo("SUCCEEDED");
        assertThat(results.getFirst().path("build").path("exitCode").asInt(-1)).isZero();
        var failed=results.getFirst().path("verification");
        assertThat(failed.path("failure").asText()).isEqualTo("PAGE_EXCEPTION");
        assertThat(failed.path("workerExitCode").asInt(-1)).isEqualTo(1);
        assertThat(failed.path("cleanup").path("browserClosed").asBoolean()).isTrue();
        assertThat(failed.path("diagnostics").path("pageErrors").toString()).contains("D10_A_BROWSER_PAGE_EXCEPTION");
        assertThat(results.getLast().path("build").path("exitCode").asInt(-1)).isZero();
        assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        assertThat(results.getLast().path("verification").path("diagnostics").path("pageErrors")).isEmpty();
        var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
        assertThat(drafts).hasSize(2);assertThat(drafts.getFirst().path("sourceDigest")).isNotEqualTo(drafts.getLast().path("sourceDigest"));
        assertThat(drafts.getFirst().path("actions")).isEqualTo(drafts.getLast().path("actions"));
        assertThat(jdbc.sql("SELECT count(*) FROM application_versions WHERE application_id=? AND status='FAILED'").param(seed.app()).query(Integer.class).single()).isEqualTo(1);
        assertThat(provider.count.get()).isEqualTo(7);assertThat(RuntimeBudget.meter(events).tools()).isEqualTo(10);
        report("D10-A-browser-error",seed,Map.of("before",BROWSER_ERROR,"after",FIXED,"realBuild",true,"realBrowser",true,"originalActionsPreserved",true));
    }
    void report(String name,Seed seed,Object extra) throws Exception {
        String configured=System.getenv("CODELESS_REPAIR_EVIDENCE_DIR");Path directory=configured==null?Path.of("target/repair-integration/evidence"):Path.of(configured);
        Files.createDirectories(directory);var events=journal.read(seed.task());
        Files.writeString(directory.resolve(name+".json"),json.writeValueAsString(Map.of("task",queue.find(seed.owner(),seed.task()).orElseThrow(),
                "events",events,"budget",RuntimeBudget.meter(events),"modelProvider","deterministic-mock","modelQualityEvidence",false,"extra",extra)));
    }
    @Test void D10AT1_missingComponentRepairRebuildsAndPassesRealBrowserWithRecordedDiff() throws Exception {
        var seed=seed();var provider=new Fixture("fix",seed);var task=run(seed,provider);
        assertThat(task.status()).as(task.failureCode()).isEqualTo(TaskStatus.READY);assertThat(task.repairAttempts()).isEqualTo(1);
        var events=journal.read(seed.task());var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
        assertThat(results).hasSize(2);assertThat(results.getFirst().path("build").path("exitCode").asInt()).isPositive();
        assertThat(results.getFirst().path("build").path("log").path("text").asText()).contains("MissingCard.vue");
        assertThat(results.getLast().path("build").path("exitCode").asInt(-1)).isZero();
        assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        assertThat(provider.count.get()).isEqualTo(7);assertThat(RuntimeBudget.meter(events).tools()).isEqualTo(10);
        assertThat(jdbc.sql("SELECT count(*) FROM application_versions WHERE application_id=? AND status='FAILED'").param(seed.app()).query(Integer.class).single()).isEqualTo(1);
        assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNotNull();
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload").path("sourceDigest").asText()).distinct().count()).isEqualTo(2);
        report("D10-A-T1-T4",seed,Map.of("before",BROKEN,"after",FIXED,"realBuild",true,"realBrowser",true));
    }
    @Test void D10AT2_changingButUnrepairableSourceStopsAfterThreeRounds() throws Exception {
        var seed=seed();var provider=new Fixture("limit",seed);var task=run(seed,provider);
        assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_REPAIR_LIMIT_EXCEEDED");
        assertThat(task.repairAttempts()).isEqualTo(3);assertThat(provider.count.get()).isEqualTo(10);
        var events=journal.read(seed.task());assertThat(RuntimeBudget.meter(events).tools()).isEqualTo(17);
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(4);
        assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
        report("D10-A-T2-limit",seed,Map.of("actualBuilds",4,"repairRounds",3));
    }
    @Test void D10AT2_sameFailureAndUnchangedSourceStopsEarly() throws Exception {
        var seed=seed();var provider=new Fixture("stuck",seed);var task=run(seed,provider);
        assertThat(task.failureCode()).isEqualTo("AGENT_REPAIR_NO_PROGRESS");assertThat(task.repairAttempts()).isEqualTo(1);
        assertThat(provider.count.get()).isEqualTo(5);report("D10-A-T2-no-progress",seed,Map.of("actualBuilds",2));
    }
    @Test void modelNetworkFailureDuringRepairNeverBecomesMoreCodeEdits() throws Exception {
        var seed=seed();var provider=new Fixture("network",seed);var task=run(seed,provider);
        assertThat(task.failureCode()).isEqualTo("MODEL_NETWORK");assertThat(provider.count.get()).isEqualTo(5);
        assertThat(jdbc.sql("SELECT input_tokens IS NULL AND output_tokens IS NULL FROM model_calls WHERE task_id=? AND stage='REPAIR'").param(seed.task()).query(Boolean.class).single()).isTrue();
        report("D10-A-model-network",seed,Map.of("codeEditsAfterNetworkFailure",0));
    }
    @Test void D10AT3_cancelDuringRepairRetainsUsageAndRejectsLateMutation() throws Exception {
        var seed=seed();var provider=new Fixture("cancel",seed);var task=run(seed,provider);
        assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("CANCELLED");assertThat(provider.count.get()).isEqualTo(5);
        assertThat(jdbc.sql("SELECT input_tokens FROM model_calls WHERE task_id=? AND stage='REPAIR'").param(seed.task()).query(Integer.class).single()).isEqualTo(31);
        report("D10-A-T3-cancel",seed,Map.of("lateResultCommitted",false));
    }
    @Test void D10AT3_expiredDeadlineRecoversAsFailedAndCannotCommitLateResult() throws Exception {
        var seed=seed();var provider=new Fixture("timeout",seed);run(seed,provider);assertThat(queue.recoverOneExpired()).isTrue();
        var task=queue.find(seed.owner(),seed.task()).orElseThrow();assertThat(task.status()).isEqualTo(TaskStatus.FAILED);
        assertThat(task.failureCode()).isEqualTo("INTERRUPTED");assertThat(provider.count.get()).isEqualTo(5);
        report("D10-A-T3-timeout",seed,Map.of("deadlineExpired",true,"wireFailureCode","INTERRUPTED"));
    }
    @Test void originalBrowserAcceptanceCannotBeWeakenedByRepairProposal() throws Exception {
        var seed=seed();var task=run(seed,new Fixture("weaken",seed));assertThat(task.failureCode()).isEqualTo("AGENT_REPAIR_ACCEPTANCE_CHANGED");
        report("D10-A-acceptance-guard",seed,Map.of("weakenedActionsAccepted",false));
    }
    @Test void infrastructureFailureStopsWithoutCallingRepairModel() throws Exception {
        var seed=seed();var provider=new Fixture("fix",seed);
        new TaskScheduler(queue,loop(provider,(draft,deadline)->{throw new AgentFailure("AGENT_RUNNER_UNAVAILABLE");})).tick();
        var task=queue.find(seed.owner(),seed.task()).orElseThrow();assertThat(task.status()).isEqualTo(TaskStatus.FAILED);
        assertThat(task.failureCode()).isEqualTo("AGENT_RUNNER_UNAVAILABLE");assertThat(task.repairAttempts()).isZero();assertThat(provider.count.get()).isEqualTo(4);
        report("D10-A-infrastructure",seed,Map.of("repairModelCalls",0,"runnerFailureFixture",true));
    }
    @Test void verificationNeedsTwoBudgetSlotsBeforeLaunchingAnyRunner() throws Exception {
        var seed=seed();var claim=queue.claim().orElseThrow();var provider=new Fixture("fix",seed);
        var loop=loop(provider,(d,t)->{throw new AssertionError("runner must not start with only one tool slot");});
        var plan=loop.execute(claim,TaskStatus.PLAN);loop.advance(queue,claim,plan,EventType.STAGE_STARTED);
        var generated=loop.execute(claim,TaskStatus.GENERATE);
        while(RuntimeBudget.meter(journal.read(seed.task())).tools()<19)store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);
        loop.advance(queue,claim,generated,EventType.STAGE_STARTED);
        var result=loop.execute(claim,TaskStatus.VERIFY);assertThat(result.failureCode()).isEqualTo("AGENT_TOOL_BUDGET_EXCEEDED");
        loop.advance(queue,claim,result,EventType.TASK_FAILED);
        assertThat(RuntimeBudget.meter(journal.read(seed.task())).tools()).isEqualTo(19);
        report("D10-A-verification-slots",seed,Map.of("runnerStarted",false,"requiredSlots",2));
    }
    @Test void D10AT3_eachBudgetStopsBeforeTheNextUnfundedOperation() throws Exception {
        var outcomes=new ArrayList<Object>();
        for(String exhausted:List.of("models","tokens","tools")) {
            var seed=seed();var claim=queue.claim().orElseThrow();assertThat(claim.taskId()).isEqualTo(seed.task());
            var provider=new Fixture("fix",seed);var loop=loop(provider,(d,t)->{throw new AssertionError("unfunded runner must not start");});
            var plan=loop.execute(claim,TaskStatus.PLAN);
            if(exhausted.equals("models"))for(int i=1;i<12;i++)store.reserve(claim,TaskStatus.PLAN,"model.request",1);
            if(exhausted.equals("tokens"))store.reserve(claim,TaskStatus.PLAN,"model.request",(int)(50000-RuntimeBudget.meter(journal.read(seed.task())).chargedTokens()));
            if(exhausted.equals("tools"))for(int i=0;i<20;i++)store.reserve(claim,TaskStatus.PLAN,"tool.request",0);
            loop.advance(queue,claim,plan,EventType.STAGE_STARTED);
            String code=exhausted.equals("tools")?"AGENT_TOOL_BUDGET_EXCEEDED":"AGENT_MODEL_BUDGET_EXCEEDED";
            var stopped=loop.execute(claim,TaskStatus.GENERATE);assertThat(stopped.next()).isEqualTo(TaskStatus.FAILED);assertThat(stopped.failureCode()).isEqualTo(code);
            loop.advance(queue,claim,stopped,EventType.TASK_FAILED);
            assertThat(provider.count.get()).isEqualTo(exhausted.equals("tools")?2:1);
            assertThat(queue.find(seed.owner(),seed.task()).orElseThrow().failureCode()).isEqualTo(code);
            outcomes.add(Map.of("budget",exhausted,"code",code,"meter",RuntimeBudget.meter(journal.read(seed.task()))));
            report("D10-A-T3-budget-"+exhausted,seed,outcomes.getLast());
        }
    }
    @Test void recordedUnchangedReadLoopStopsBeforeAnotherModelOrBuild() throws Exception {
        var seed=seed();var provider=recordedProvider(seed,"loop");var task=run(seed,provider);
        assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_REPAIR_NO_PROGRESS");
        assertThat(provider.count).isEqualTo(11);var events=journal.read(seed.task());
        assertThat(RuntimeBudget.meter(events).models()).isEqualTo(11);assertThat(RuntimeBudget.meter(events).tools()).isEqualTo(14);
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("tool.result")&&e.path("stage").asText().equals("REPAIR")).count()).isEqualTo(5);
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(1);
        assertThat(AgentJournal.latest(events,"failure").path("category").asText()).isEqualTo("CONTROL");
        assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
        report("D10-A-repeated-read-stop",seed,Map.of("recordedProvider",provider.model(),"extraModelCalls",0,"outerRetries",0));
    }
    @Test void recordedUnknownPatchUsageKeepsItsFullReservationAndTheHostVerifiesThePatch() throws Exception {
        // Until D24-A this patch was discarded: done could not be reserved, so the task stopped AGENT_MODEL_BUDGET_EXCEEDED
        // with a real, digest-checked fix on disk (D21-A F3). The unknown usage still keeps its full reservation, no
        // request beyond the caps is made, and only the real rebuild and browser decide the outcome.
        var seed=seed();var provider=recordedProvider(seed,"unknown-patch");var task=run(seed,provider);
        assertThat(task.status()).as(task.failureCode()).isEqualTo(TaskStatus.READY);assertThat(provider.count).isEqualTo(11);
        var events=journal.read(seed.task());
        var usage=events.stream().filter(e->e.path("kind").asText().equals("model.usage")&&e.path("stage").asText().equals("REPAIR")).reduce((a,b)->b).orElseThrow().path("payload");
        assertThat(usage.path("estimated").asBoolean()).isTrue();
        assertThat(usage.path("chargedTokens")).isEqualTo(usage.path("reservationTokens"));assertThat(usage.path("usage").path("totalTokens").isNull()).isTrue();
        var done=events.stream().filter(e->e.path("kind").asText().equals("repair.done")).map(e->e.path("payload")).toList();
        assertThat(done).hasSize(1);assertThat(done.getFirst().path("origin").asText()).isEqualTo("HOST_BUDGET_EXHAUSTED");
        var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
        assertThat(drafts).hasSize(2);assertThat(done.getFirst().path("actions")).isEqualTo(drafts.getFirst().path("actions")).isEqualTo(drafts.getLast().path("actions"));
        var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
        assertThat(results).hasSize(2);assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        var meter=RuntimeBudget.meter(events);assertThat(meter.models()).isEqualTo(11);assertThat(meter.chargedTokens()).isLessThanOrEqualTo(RuntimeBudget.TOKENS);
        assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNotNull();
        report("D24-A-recorded-unknown-budget-host-completion",seed,Map.of("recordedProvider",provider.model(),"doneProviderCalled",false,"outerRetries",0,
                "meter",meter,"realBuildAndBrowser",true));
    }
    @Test void invalidDoneGetsOneCorrectiveObservationAndThenVerifies() throws Exception {
        var seed=seed();var provider=new Fixture("rejected-once",seed);var task=run(seed,provider);
        assertThat(task.status()).as(task.failureCode()).isEqualTo(TaskStatus.READY);assertThat(provider.count.get()).isEqualTo(5);
        assertThat(provider.rejected).hasSize(1);var observed=provider.rejected.getFirst();
        assertThat(observed.path("tool").asText()).isEqualTo("done");assertThat(observed.path("status").asText()).isEqualTo("REJECTED");
        assertThat(observed.path("errorCode").asText()).isEqualTo("AGENT_ACCEPTANCE_INVALID");assertThat(observed.path("reason").asText()).isEqualTo("TOO_MANY_ACTIONS");
        assertThat(observed.path("limit").asInt()).isEqualTo(20);assertThat(observed.path("actual").asInt()).isEqualTo(21);
        var events=journal.read(seed.task());
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("done.rejected")).count()).isEqualTo(1);
        assertThat(AgentJournal.latest(events,"draft").path("actions").size()).isEqualTo(2);
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(1);
        report("D24-A-done-rejected-once",seed,Map.of("rejection",observed,"modelCalls",5,"outerRetries",0));
    }
    @Test void secondInvalidDoneStopsWithTheOriginalCodeBeforeAnyRunner() throws Exception {
        var seed=seed();var provider=new Fixture("rejected-twice",seed);
        new TaskScheduler(queue,loop(provider,(draft,deadline)->{throw new AssertionError("invalid acceptance must never launch runner");})).tick();
        var task=queue.find(seed.owner(),seed.task()).orElseThrow();
        assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_ACCEPTANCE_INVALID");
        assertThat(provider.count.get()).isEqualTo(5);var events=journal.read(seed.task());
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("done.rejected")).count()).isEqualTo(1);
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("draft")).count()).isZero();
        assertThat(AgentJournal.latest(events,"failure").path("code").asText()).isEqualTo("AGENT_ACCEPTANCE_INVALID");
    }
    @Test void bareDoneFinishesRepairWithTheUnchangedOriginalActions() throws Exception {
        var seed=seed();var provider=new Fixture("bare",seed);var task=run(seed,provider);
        assertThat(task.status()).as(task.failureCode()).isEqualTo(TaskStatus.READY);var events=journal.read(seed.task());
        assertThat(AgentJournal.latest(events,"model.response")).isEqualTo(json.readTree("{\"type\":\"done\"}"));
        assertThat(AgentJournal.latest(events,"repair.done").path("origin").asText()).isEqualTo("MODEL");
        var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
        assertThat(drafts).hasSize(2);assertThat(drafts.getLast().path("actions")).isEqualTo(drafts.getFirst().path("actions"));
        assertThat(AgentJournal.latest(events,"repair.done").path("actions")).isEqualTo(drafts.getFirst().path("actions"));
        report("D24-A-bare-repair-done",seed,Map.of("modelCalls",provider.count.get(),"outerRetries",0,"realBuildAndBrowser",true));
    }
    @Test void hostVerifiesAnActualPatchWhenNoFurtherRequestCanBeFunded() throws Exception {
        var seed=seed();var provider=new Fixture("host-complete",seed);var task=run(seed,provider);
        assertThat(task.status()).as(task.failureCode()).isEqualTo(TaskStatus.READY);assertThat(provider.count.get()).isEqualTo(6);
        var events=journal.read(seed.task());var done=AgentJournal.latest(events,"repair.done");
        assertThat(done.path("origin").asText()).isEqualTo("HOST_BUDGET_EXHAUSTED");
        var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
        assertThat(drafts).hasSize(2);assertThat(done.path("actions")).isEqualTo(drafts.getFirst().path("actions"));
        var meter=RuntimeBudget.meter(events);assertThat(meter.chargedTokens()).isEqualTo(RuntimeBudget.TOKENS);assertThat(meter.models()).isEqualTo(7);
        var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
        assertThat(results).hasSize(2);assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        report("D24-A-host-completion",seed,Map.of("meter",meter,"doneRequests",0,"outerRetries",0,"realBuildAndBrowser",true));
    }
    @Test void locatorTimeoutOnARenderedPageIsRepairedInsteadOfStoppingAsInfrastructure() throws Exception {
        var seed=seed();var provider=new Fixture("locator",seed);var task=run(seed,provider);
        assertThat(task.status()).as(task.failureCode()).isEqualTo(TaskStatus.READY);var events=journal.read(seed.task());
        var failure=events.stream().filter(e->e.path("kind").asText().equals("repair.failure")).findFirst().orElseThrow().path("payload");
        assertThat(failure.path("code").asText()).isEqualTo("AGENT_ACTION_TIMEOUT");assertThat(failure.path("category").asText()).isEqualTo("CODE");
        assertThat(failure.path("decision").asText()).isEqualTo("REPAIR");assertThat(failure.path("diagnostic").asText()).contains("profile-name");
        var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
        assertThat(failure.path("failedAction").path("action")).isEqualTo(drafts.getFirst().path("actions").get(1));
        var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
        assertThat(results.getFirst().path("verification").path("failure").asText()).isEqualTo("ACTION_TIMEOUT");
        assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        report("D24-A-locator-timeout-repair",seed,Map.of("failure",failure,"outerRetries",0,"realBuildAndBrowser",true));
    }
    private RecordedRepairFixture recordedProvider(Seed seed,String mode) {
        return recordedProvider(seed,mode,RepairContextTest.RECORD);
    }
    private RecordedRepairFixture recordedProvider(Seed seed,String mode,Path directory) {
        return new RecordedRepairFixture(mode,recordedFault(seed),directory);
    }
    private java.util.function.Consumer<JsonNode> recordedFault(Seed seed) {
        return reply->{
            var claim=jdbc.sql("SELECT lease_token FROM generation_tasks WHERE id=?").param(seed.task()).query(UUID.class).single();
            var lease=new TaskQueueService.Claim(seed.task(),claim,TaskStatus.GENERATE);
            store.reserve(lease,TaskStatus.GENERATE,"tool.request",0);var read=files.execute(seed.task(),claim,"files.read",json.writeValueAsString(Map.of("path",PAGE)));store.append(lease,TaskStatus.GENERATE,"tool.result",read);assertThat(read.status()).isEqualTo("SUCCEEDED");
            store.reserve(lease,TaskStatus.GENERATE,"tool.request",0);var write=files.execute(seed.task(),claim,"files.update",json.writeValueAsString(Map.of("path",PAGE,"content",read.content().replace("../components/ProfileCard.vue","../components/M1MissingCard.vue"),"expectedDigest",read.afterDigest())));
            store.append(lease,TaskStatus.GENERATE,"tool.result",write);assertThat(write.status()).isEqualTo("SUCCEEDED");
        };
    }
    @Test void completePaidProtocolErrorSurvivesRealWireParsingAndStopsWithoutRepairOrRetry() throws Exception {
        var seed=seed();Path directory=Path.of("../../docs/evidence/D10/M1/17f440cf-7970-46cc-b598-dd2d91a20ade");
        var provider=recordedProvider(seed,"recorded-invalid",directory);
        try(var wire=new dev.codeless.api.model.RecordedRepairWireFixture(provider)) {
            var task=run(seed,wire);var events=journal.read(seed.task());
            assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_MODEL_PROTOCOL_INVALID");
            assertThat(provider.count).isEqualTo(9);assertThat(wire.requests).hasSize(9);wire.assertHealthy();
            assertThat(RuntimeBudget.meter(events)).isEqualTo(new RuntimeBudget.Meter(9,11,28515));
            assertThat(AgentJournal.latest(events,"model.response")).isEqualTo(json.readTree("{\"type\":\"json_object\",\"error\":\"Invalid protocol reply.\"}"));
            assertThat(AgentJournal.latest(events,"failure").path("category").asText()).isEqualTo("MODEL_INTERFACE");
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(1);
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.done")).count()).isZero();
            assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
            var fingerprints=events.stream().filter(e->e.path("kind").asText().equals("model.input")).map(e->e.path("payload")).toList();
            assertThat(fingerprints).hasSize(9);for(int i=0;i<9;i++)assertThat(fingerprints.get(i).path("transport").path("bodyDigest").asText()).isEqualTo(wire.digests.get(i));
            var input=json.readTree(wire.requests.getLast().path("messages").get(1).path("content").asText());
            assertThat(input.path("observations")).hasSize(2);assertThat(input.path("repairProgress").path("next").asText()).isEqualTo("PATCH_OR_READ_MISSING_DEPENDENCY");
            assertThat(input.path("budget").path("tokensRemaining").asLong()).isEqualTo(25090);
            report("D10-A-protocol31-invalid",seed,Map.of("originTask","17f440cf-7970-46cc-b598-dd2d91a20ade",
                    "offlineWireRequests",wire.requests,"wireDigests",wire.digests,"paidCalls",0,"outerRetries",0,"historicalWireCaptured",false));
        }
    }
    @Test void duplicateRootAndArgumentKeysStopBeforeProposedUpdatesThroughProductionWire() throws Exception {
        // Synthetic boundary cases, separate from the exact 17cc6cb9 final reply test below.
        for(String mode:List.of("duplicate-type","duplicate-same-type","duplicate-path")) {
            var seed=seed();var provider=new Fixture(mode,seed);
            try(var wire=new RecordedRepairWireFixture(provider)) {
                var task=run(seed,wire);var events=journal.read(seed.task());
                assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("MODEL_INVALID_RESPONSE");
                assertThat(provider.count.get()).isEqualTo(6);assertThat(wire.requests).hasSize(6);wire.assertHealthy();
                assertThat(RuntimeBudget.meter(events)).isEqualTo(new RuntimeBudget.Meter(6,6,288));
                assertThat(events.stream().filter(e->e.path("stage").asText().equals("REPAIR")&&e.path("kind").asText().equals("tool.result")).count()).isEqualTo(1);
                assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(1);
                assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.done")).count()).isZero();
                assertThat(AgentJournal.latest(events,"model.response").path("name").asText()).isEqualTo("files.read");
                assertThat(AgentJournal.latest(events,"failure").path("category").asText()).isEqualTo("MODEL_INTERFACE");
                assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
                assertThat(jdbc.sql("SELECT input_tokens=31 AND output_tokens=17 AND error_code='MODEL_INVALID_RESPONSE' FROM model_calls WHERE task_id=? AND stage='REPAIR' ORDER BY created_at DESC LIMIT 1")
                        .param(seed.task()).query(Boolean.class).single()).isTrue();
                report("D10-A-"+mode,seed,Map.of("measurement","SYNTHETIC_DUPLICATE_KEY_BOUNDARY","paidCalls",0,"outerRetries",0,"wireDigests",wire.digests));
            }
        }
    }
    @Test void capturedWrappedDoneStopsAfterActualPatchWithoutUnwrappingOrRetry() throws Exception {
        var seed=seed();var provider=new CapturedDoneRepairFixture(false,recordedFault(seed));
        try(var wire=new RecordedRepairWireFixture(provider)) {
            var task=run(seed,wire);var events=journal.read(seed.task());wire.assertHealthy();
            assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_MODEL_PROTOCOL_INVALID");
            assertThat(provider.count).isEqualTo(12);assertThat(RuntimeBudget.meter(events)).isEqualTo(new RuntimeBudget.Meter(12,14,36844));
            assertThat(AgentJournal.latest(events,"model.response").path("type").asText()).isEqualTo("json_object");
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.done")).count()).isZero();
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("draft")).count()).isEqualTo(1);
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(1);
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.read.repeat")).count()).isEqualTo(1);
            assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
            assertThat(Files.readString(Path.of("target/repair-integration/workspaces",seed.task().toString(),"source",PAGE))).contains("../components/ProfileCard.vue");
            report("D10-A-wrapped-done720f-invalid",seed,Map.of("originTask",provider.recording.path("originTask").asText(),"completeReplyBytes",657,
                "paidCalls",0,"outerRetries",0,"actualPatchExecuted",true,"modelQualityEvidence",false,"wireDigests",wire.digests));
        }
    }
    @Test void lastRepairModelCallAfterPatchCannotConsumeAnotherFileTool() throws Exception {
        var seed=seed();var captured=new CapturedDoneRepairFixture(false,recordedFault(seed));
        ModelProvider provider=new ModelProvider() {
            public String id(){return "deterministic-mock";}public String model(){return "synthetic-last-repair-tool-boundary-fixture";}
            public Reply call(Prompt prompt,int max,Duration timeout) {
                var reply=captured.call(prompt,max,timeout);if(captured.count<12)return reply;
                var input=json.readTree(prompt.getUserMessage().getText());
                assertThat(input.path("completionOnly").asBoolean()).isTrue();assertThat(input.path("tools")).isEmpty();
                assertThat(input.path("budget").path("modelCallsRemaining").asInt()).isEqualTo(1);
                return new Reply(json.writeValueAsString(Map.of("type","tool","name","files.read","arguments",Map.of("path",PAGE))),
                    new Evidence(model(),"synthetic-last-tool","synthetic-last-tool",new Usage(31,17,48,json.valueToTree(Map.of("fixture",true,"measurement","SYNTHETIC_LAST_CALL_TOOL_BOUNDARY")))));
            }
        };
        try(var wire=new RecordedRepairWireFixture(provider)) {
            var task=run(seed,wire);var events=journal.read(seed.task());wire.assertHealthy();
            assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_TOOL_NOT_ALLOWED");
            assertThat(captured.count).isEqualTo(12);assertThat(RuntimeBudget.meter(events).tools()).isEqualTo(14);
            assertThat(events.stream().filter(e->e.path("stage").asText().equals("REPAIR")&&e.path("kind").asText().equals("tool.result")).count()).isEqualTo(5);
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.done")).count()).isZero();
            assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
            report("D10-A-last-repair-tool-denied",seed,Map.of("originTask",captured.recording.path("originTask").asText(),"lastReplySynthetic",true,
                "paidCalls",0,"outerRetries",0,"lastToolExecuted",false,"wireDigests",wire.digests));
        }
    }
    @Test void capturedPatchAndSyntheticExactCompletionRebuildWithinOriginalBudget() throws Exception {
        var seed=seed();var provider=new CapturedDoneRepairFixture(true,recordedFault(seed));
        try(var wire=new RecordedRepairWireFixture(provider)) {
            var task=run(seed,wire);var events=journal.read(seed.task());wire.assertHealthy();
            assertThat(task.status()).isEqualTo(TaskStatus.READY);assertThat(provider.count).isEqualTo(10);
            var meter=RuntimeBudget.meter(events);assertThat(meter.models()).isEqualTo(10);assertThat(meter.tools()).isEqualTo(15);assertThat(meter.chargedTokens()).isLessThanOrEqualTo(50000);
            var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
            var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
            assertThat(drafts).hasSize(2);assertThat(drafts.getFirst().path("actions")).isEqualTo(drafts.getLast().path("actions"));
            assertThat(drafts.getFirst().path("sourceDigest")).isNotEqualTo(drafts.getLast().path("sourceDigest"));
            assertThat(results.getFirst().path("build").path("exitCode").asInt()).isEqualTo(2);
            assertThat(results.getLast().path("build").path("exitCode").asInt()).isZero();assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
            assertThat(AgentJournal.latest(events,"model.usage").path("estimated").asBoolean()).isTrue();
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.read.repeat")).count()).isZero();
            report("D10-A-captured720f-synthetic-done",seed,Map.of("originTask",provider.recording.path("originTask").asText(),"syntheticCompletion",true,
                "paidCalls",0,"outerRetries",0,"realBuildAndBrowser",true,"modelQualityEvidence",false,"wireDigests",wire.digests));
        }
    }
    @Test void exact17ccDuplicateReplyIsRejectedBeforePatchAndKeepsCompleteMeasuredUsage() throws Exception {
        var seed=seed();var provider=new DuplicateTypeRepairFixture(recordedFault(seed));
        try(var wire=new RecordedRepairWireFixture(provider)) {
            var task=run(seed,wire);var events=journal.read(seed.task());wire.assertHealthy();
            assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("MODEL_INVALID_RESPONSE");
            assertThat(provider.count).isEqualTo(9);assertThat(wire.requests).hasSize(9);
            assertThat(RuntimeBudget.meter(events)).isEqualTo(new RuntimeBudget.Meter(9,11,29340));
            assertThat(AgentJournal.latest(events,"model.response").path("name").asText()).isEqualTo("files.read");
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("model.response")).count()).isEqualTo(8);
            assertThat(AgentJournal.latest(events,"model.usage").path("chargedTokens").asInt()).isEqualTo(4548);
            assertThat(AgentJournal.latest(events,"model.usage").path("estimated").asBoolean()).isFalse();
            assertThat(AgentJournal.latest(events,"failure").path("category").asText()).isEqualTo("MODEL_INTERFACE");
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(1);
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("draft")).count()).isEqualTo(1);
            assertThat(events.stream().filter(e->e.path("stage").asText().equals("REPAIR")&&e.path("kind").asText().equals("tool.result")).count()).isEqualTo(2);
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.done")).count()).isZero();
            assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
            assertThat(jdbc.sql("SELECT input_tokens=3685 AND output_tokens=863 AND error_code='MODEL_INVALID_RESPONSE' FROM model_calls WHERE task_id=? ORDER BY created_at DESC LIMIT 1")
                    .param(seed.task()).query(Boolean.class).single()).isTrue();
            report("D10-A-duplicate17cc-invalid",seed,Map.of("provenance",provider.provenance,"wireDigests",wire.digests,"paidCalls",0,"outerRetries",0,
                    "setupNotHistoricalRequestReplay",true,"completeLastReplyBytesVerified",true,"historicalRequestBodyRead",false));
        }
    }
}
