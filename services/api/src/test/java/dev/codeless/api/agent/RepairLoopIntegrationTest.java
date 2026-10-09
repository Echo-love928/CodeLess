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
        final List<JsonNode> inputs=new ArrayList<>();
        Fixture(String mode,Seed seed){this.mode=mode;this.seed=seed;}
        public String id(){return "deterministic-mock";}public String model(){return "d10-repair-"+mode+"-fixture";}
        public Reply call(Prompt prompt,int max,Duration timeout) {
            count.incrementAndGet();var input=json.readTree(prompt.getUserMessage().getText());inputs.add(input);
            String phase=input.path("phase").asText();String content;
            if(Set.of("GENERATE","REPAIR").contains(phase)) {
                assertThat(prompt.getSystemMessage().getText()).startsWith("Application proposal protocol")
                    .contains("never json_object", "Invalid replies terminate", "REPAIR copies input.originalActions exactly into actions");
                assertThat(max).isEqualTo(RuntimeBudget.OUTPUT_TOKENS);
            }
            if(!phase.equals("REPAIR")) {
                var reply=mock.call(prompt,max,timeout);var node=json.readTree(reply.content());
                if(node.path("arguments").path("path").asText().equals(PAGE))
                    ((tools.jackson.databind.node.ObjectNode)node.path("arguments")).put("content",mode.equals("browser")?BROWSER_ERROR:BROKEN);
                content=node.toString();
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
                if(mode.equals("invalid-repair")) return new Reply(recordedInvalidReply(),new Evidence(model(),"explicit-recorded-protocol-fixture","explicit-recorded-protocol-fixture",new Usage(31,17,48,null)));
                if(mode.equals("network")) throw new ModelFailure("MODEL_NETWORK");
                if(mode.equals("cancel")) queue.cancel(seed.owner(),seed.task());
                if(mode.equals("timeout")) jdbc.sql("UPDATE generation_tasks SET deadline_at=clock_timestamp()-interval '1 second',lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=?").param(seed.task()).update();
                int observed=input.path("observations").size();
                if(mode.equals("stuck") || mode.equals("cancel") || mode.equals("timeout") || mode.equals("weaken")) {
                    var actions=input.path("originalActions").deepCopy();
                    if(mode.equals("weaken")) ((tools.jackson.databind.node.ObjectNode)actions.get(1)).put("value","fake success");
                    content=json.writeValueAsString(Map.of("type","done","actions",actions));
                } else if(mode.equals("limit")) {
                    String digest="";for(var entry:input.path("sourceFiles"))if(entry.path("path").asText().equals(PAGE))digest=entry.path("digest").asText();
                    content=observed==0?json.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of(
                            "path",PAGE,"expectedDigest",digest,"content",BROKEN+"\n<!-- attempt "+input.path("repairAttempt").asInt()+" -->"))):
                            json.writeValueAsString(Map.of("type","done","actions",input.path("originalActions")));
                } else if(observed==0) content=json.writeValueAsString(Map.of("type","tool","name","files.read","arguments",Map.of("path",PAGE)));
                else if(observed==1) {
                    JsonNode actual=input.path("observations").get(0);
                    assertThat(actual.path("content").asText()).isEqualTo(mode.equals("browser")?BROWSER_ERROR:BROKEN);
                    content=json.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of(
                            "path",PAGE,"expectedDigest",actual.path("afterDigest").asText(),"content",FIXED)));
                } else content=json.writeValueAsString(Map.of("type","done","actions",input.path("originalActions")));
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
}
