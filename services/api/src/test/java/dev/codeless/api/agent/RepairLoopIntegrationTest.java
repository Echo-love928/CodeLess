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
                if(phase.equals("GENERATE"))assertThat(prompt.getSystemMessage().getText()).contains("The top-level type is either \"tool\" or \"done\"","Invalid replies terminate")
                    .doesNotContain("json_object","response_format");
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
                if(mode.equals("repeated-bad") && input.path("repairAttempt").asInt()>1)
                    throw new ModelFailure("MODEL_NETWORK");
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
                } else if(mode.equals("bare")) content="{\"type\":\"done\"}"; // Only before a write: none is solicited after one (D24-A round 2).
                else if(mode.equals("read-loop")) content=json.writeValueAsString(Map.of("type","tool","name","files.read","arguments",Map.of("path",PAGE)));
                else if(mode.equals("limit")) {
                    // Each round's changing write ends its proposal (D24-A round 2), so every round starts with no observation.
                    assertThat(observed).isZero();
                    String digest="";for(var entry:input.path("sourceFiles"))if(entry.path("path").asText().equals(PAGE))digest=entry.path("digest").asText();
                    content=json.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of(
                            "path",PAGE,"expectedDigest",digest,"content",BROKEN+"\n<!-- attempt "+input.path("repairAttempt").asInt()+" -->")));
                } else if(observed==0) content=json.writeValueAsString(Map.of("type","tool","name","files.read","arguments",Map.of("path",PAGE)));
                else if(observed==1) {
                    JsonNode actual=input.path("observations").get(0);
                    assertThat(actual.path("content").asText()).isEqualTo(mode.equals("browser")?BROWSER_ERROR:mode.equals("locator")?NO_CARD:BROKEN);
                    content=json.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of(
                            "path",PAGE,"expectedDigest",actual.path("afterDigest").asText(),"content",mode.equals("repeated-bad")?NO_CARD:FIXED)));
                    if(mode.equals("host-complete")) {
                        // Synthetic exhaustion (as in D10AT3): reserve whatever is left, and charge this patch request in full.
                        var lease=new TaskQueueService.Claim(seed.task(),jdbc.sql("SELECT lease_token FROM generation_tasks WHERE id=?").param(seed.task()).query(UUID.class).single(),TaskStatus.REPAIR);
                        long left=RuntimeBudget.TOKENS-RuntimeBudget.meter(journal.read(seed.task())).chargedTokens();
                        store.reserve(lease,TaskStatus.REPAIR,"model.request",(int)left);
                        int input0=RuntimeBudget.inputReservation(prompt.getSystemMessage().getText(),prompt.getUserMessage().getText());
                        return new Reply(content,new Evidence(model(),"explicit-fixture-request","explicit-fixture-response",new Usage(input0,max,input0+max,null)));
                    }
                } else throw new AssertionError("No REPAIR request follows an actual patch (D24-A round 2)");
            }
            Usage usage=mode.equals("unknown")?Usage.unknown():new Usage(31,17,48,null);
            return new Reply(content,new Evidence(model(),"explicit-fixture-request","explicit-fixture-response",usage));
        }
    }
    @Test void lowBudgetRepairPatchesFromSeededSourcesWithoutWeakeningActionsOrExceedingCaps() throws Exception {
        // CAT-02 scenario: 30,000 tokens are charged before REPAIR. Until D24-A round 2 two dependency reads left 9,950
        // tokens, so the write needed compacted schemas and the host completed on budget exhaustion. Now the failed
        // candidate's own bytes are seeded, a read is not offered because it could starve the patch, and the first
        // request funds the full output allowance; the unknown-usage write is still charged its whole reservation.
        for(boolean incorrect:List.of(false,true)) {
            var seed=seed();var generation=new Fixture("fix",seed);var repairCalls=new AtomicInteger();
            ModelProvider provider=new ModelProvider() {
                public String id(){return "deterministic-mock";}
                public String model(){return "synthetic-cat02-budget-context";}
                public Reply call(Prompt prompt,int max,Duration timeout) {
                    var input=json.readTree(prompt.getUserMessage().getText());String content;Usage usage;
                    if(!input.path("phase").asText().equals("REPAIR")) {
                        var reply=generation.call(prompt,max,timeout);var node=json.readTree(reply.content());
                        if(node.path("name").asText().equals("files.create")&&node.path("arguments").path("path").asText().equals(PAGE))
                            ((tools.jackson.databind.node.ObjectNode)node.path("arguments")).put("content",BROKEN+"\n<!-- synthetic budget padding "+"x".repeat(2400)+" -->");
                        usage=new Usage(31,17,48,null);
                        if(input.path("phase").asText().equals("GENERATE")&&node.path("type").asText().equals("done")) {
                            var lease=new TaskQueueService.Claim(seed.task(),jdbc.sql("SELECT lease_token FROM generation_tasks WHERE id=?").param(seed.task()).query(UUID.class).single(),TaskStatus.GENERATE);
                            long pending=RuntimeBudget.inputReservation(prompt.getSystemMessage().getText(),prompt.getUserMessage().getText())+max;
                            long settled=RuntimeBudget.meter(journal.read(seed.task())).chargedTokens()-pending;
                            int synthetic=(int)(30000-settled-48);
                            store.reserve(lease,TaskStatus.GENERATE,"model.request",synthetic-2);
                            store.reserve(lease,TaskStatus.GENERATE,"model.request",1);
                            store.reserve(lease,TaskStatus.GENERATE,"model.request",1);
                        }
                        content=node.toString();
                    } else if(repairCalls.getAndIncrement()>0) {
                        // The incorrect patch failed the unchanged original acceptance, and round 2 is now funded: it starts
                        // from that frozen candidate. This model gives up with a bare done, so the unchanged source is rebuilt
                        // and stops as no progress; formerly the budget was already exhausted after round 1.
                        assertThat(incorrect).isTrue();assertThat(repairCalls.get()).isEqualTo(2);
                        assertThat(input.path("repairAttempt").asInt()).isEqualTo(2);assertThat(input.path("observations")).isEmpty();
                        assertThat(input.path("tools").valueStream().map(t->t.path("name").asText()).toList()).doesNotContain("files.read","files.list");
                        JsonNode seeded=null;for(var file:input.path("repairSources").path("files"))if(file.path("path").asText().equals(PAGE))seeded=file;
                        // Below a full-size write the failed page is still seeded, since the compacted request can be funded.
                        assertThat(seeded).isNotNull();assertThat(seeded.path("content").asText()).isEqualTo(NO_CARD);
                        assertThat(max).isLessThan(RuntimeBudget.OUTPUT_TOKENS);
                        content="{\"type\":\"done\"}";usage=Usage.unknown();
                    } else {
                        assertThat(input.path("budget").path("tokensRemaining").asInt()).isEqualTo(20000);
                        assertThat(input.path("observations")).isEmpty();
                        assertThat(input.path("tools").valueStream().map(t->t.path("name").asText()).toList())
                                .contains("files.update").doesNotContain("files.read","files.list");
                        assertThat(input.path("repairProgress").path("next").asText()).isEqualTo("PATCH_FROM_REPAIR_SOURCES");
                        assertThat(input.path("repairSources").path("origin").asText()).isEqualTo("FROZEN_FAILED_CANDIDATE_DIGEST_MATCHED");
                        JsonNode seeded=null;for(var file:input.path("repairSources").path("files"))if(file.path("path").asText().equals(PAGE))seeded=file;
                        assertThat(seeded).isNotNull();assertThat(seeded.path("content").asText()).contains("synthetic budget padding");
                        content=json.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of("path",PAGE,
                                "expectedDigest",seeded.path("digest").asText(),"content",incorrect?NO_CARD:FIXED)));
                        assertThat(max).isEqualTo(RuntimeBudget.OUTPUT_TOKENS);
                        usage=Usage.unknown(); // Charge the entire reservation, not a guessed usage.
                    }
                    return new Reply(content,new Evidence(model(),"explicit-synthetic-cat02-request","explicit-synthetic-cat02-response",usage));
                }
            };
            var task=run(seed,provider);var events=journal.read(seed.task());
            assertThat(repairCalls.get()).as(task.failureCode()).isEqualTo(incorrect?2:1);
            assertThat(task.status()).as(task.failureCode()).isEqualTo(incorrect?TaskStatus.FAILED:TaskStatus.READY);
            if(incorrect)assertThat(task.failureCode()).isEqualTo("AGENT_REPAIR_NO_PROGRESS");
            var contexts=events.stream().filter(e->e.path("kind").asText().equals("repair.context")).map(e->e.path("payload")).toList();
            assertThat(contexts).hasSize(repairCalls.get()).allSatisfy(c->assertThat(c.path("seeded").get(0).path("path").asText()).isEqualTo(PAGE));
            if(incorrect)assertThat(contexts.getLast().path("seeded")).hasSize(1);
            var repairUsage=events.stream().filter(e->e.path("kind").asText().equals("model.usage")&&e.path("stage").asText().equals("REPAIR")).map(e->e.path("payload")).toList();
            assertThat(repairUsage).hasSize(repairCalls.get()).allSatisfy(usage->{assertThat(usage.path("estimated").asBoolean()).isTrue();
                assertThat(usage.path("chargedTokens")).isEqualTo(usage.path("reservationTokens"));});
            var meter=RuntimeBudget.meter(events);
            assertThat(meter.chargedTokens()).isEqualTo(30000+repairUsage.stream().mapToLong(u->u.path("chargedTokens").asLong()).sum()).isLessThanOrEqualTo(50000);
            assertThat(meter.models()).isEqualTo(7+repairCalls.get());assertThat(meter.tools()).isLessThanOrEqualTo(20);
            var origins=events.stream().filter(e->e.path("kind").asText().equals("repair.done")).map(e->e.path("payload").path("origin").asText()).toList();
            assertThat(origins).isEqualTo(incorrect?List.of("HOST_COMMITTED_PATCH","MODEL"):List.of("HOST_COMMITTED_PATCH"));
            var done=AgentJournal.latest(events,"repair.done");
            var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
            assertThat(drafts).hasSize(incorrect?3:2).allSatisfy(draft->assertThat(draft.path("actions")).isEqualTo(done.path("actions")));
            if(incorrect)assertThat(drafts.getLast().path("sourceDigest")).isEqualTo(drafts.get(1).path("sourceDigest"));
            var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
            assertThat(results).hasSize(incorrect?3:2);assertThat(results.get(1).path("build").path("status").asText()).isEqualTo("SUCCEEDED");
            assertThat(results.get(1).path("verification").path("status").asText()).isEqualTo(incorrect?"FAILED":"PASSED");
            assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo(incorrect?"FAILED":"PASSED");
            report("D21-CAT02-budget-context-"+incorrect,seed,Map.of("syntheticAccounting",true,"paidModelCalls",0,"originalActionsUnchanged",true,"realBuildAndBrowser",true));
        }
    }
    @Test void recordedJsonObjectReplyStopsGenerateBeforeAnyRunnerOrRepair() throws Exception {
        var seed=seed();var provider=new Fixture("invalid-generate",seed);
        new TaskScheduler(queue,loop(provider,(draft,deadline)->{throw new AssertionError("invalid proposal must never launch runner");})).tick();
        assertRecordedInvalidTerminal(seed,provider,"GENERATE",4,0);
        assertThat(RuntimeBudget.meter(journal.read(seed.task())).tools()).isEqualTo(2);
    }
    @Test void repeatedCommittedPatchIsReallyVerifiedInsteadOfSpendingTheRemainingCallsOnRewrites() throws Exception {
        // Before D24-A round 2 the same committed patch had to be resent once (HOST_REPEATED_PATCH). Now the first actual
        // change ends the proposal: the fixture fails on any later REPAIR request, and the patch is verified right away.
        var seed=seed();var provider=new Fixture("repeated-patch",seed);
        var task=run(seed,provider);var events=journal.read(seed.task());
        assertThat(task.status()).as(task.failureCode()).isEqualTo(TaskStatus.READY);
        assertThat(task.repairAttempts()).isEqualTo(1);
        assertThat(AgentJournal.latest(events,"repair.done").path("origin").asText()).isEqualTo("HOST_COMMITTED_PATCH");
        assertThat(AgentJournal.latest(events,"runner.result").path("verification").path("status").asText()).isEqualTo("PASSED");
        assertThat(provider.count.get()).isEqualTo(6);
        assertThat(events.stream().filter(e->e.path("stage").asText().equals("REPAIR")&&e.path("kind").asText().equals("tool.result")).count()).isEqualTo(2);
        assertThat(RuntimeBudget.meter(events).chargedTokens()).isLessThanOrEqualTo(RuntimeBudget.TOKENS);
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(2);
    }
    @Test void repeatedBadPatchStillFailsTheOriginalBrowserAcceptance() throws Exception {
        var seed=seed();var provider=new Fixture("repeated-bad",seed);
        var task=run(seed,provider);var events=journal.read(seed.task());
        assertThat(task.status()).isEqualTo(TaskStatus.FAILED);
        assertThat(task.failureCode()).isEqualTo("MODEL_NETWORK"); // Explicit next-round fixture failure, not a retry.
        // The bad patch is verified as soon as it is committed (D24-A round 2; formerly after a resend, HOST_REPEATED_PATCH).
        assertThat(AgentJournal.latest(events,"repair.done").path("origin").asText()).isEqualTo("HOST_COMMITTED_PATCH");
        var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
        assertThat(results).hasSize(2);
        assertThat(results.getLast().path("build").path("status").asText()).isEqualTo("SUCCEEDED");
        assertThat(results.getLast().path("verification").path("failure").asText()).isEqualTo("ACTION_TIMEOUT");
        var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
        assertThat(drafts).hasSize(2);
        assertThat(drafts.getLast().path("actions")).isEqualTo(drafts.getFirst().path("actions"));
        assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
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
        // Read, patch; no completion request follows the patch (D24-A round 2), so 6 model calls instead of 7.
        assertThat(provider.count.get()).isEqualTo(6);assertThat(RuntimeBudget.meter(events).tools()).isEqualTo(10);
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
        // Read, patch; no completion request follows the patch (D24-A round 2), so 6 model calls instead of 7.
        assertThat(provider.count.get()).isEqualTo(6);assertThat(RuntimeBudget.meter(events).tools()).isEqualTo(10);
        assertThat(jdbc.sql("SELECT count(*) FROM application_versions WHERE application_id=? AND status='FAILED'").param(seed.app()).query(Integer.class).single()).isEqualTo(1);
        assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNotNull();
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload").path("sourceDigest").asText()).distinct().count()).isEqualTo(2);
        report("D10-A-T1-T4",seed,Map.of("before",BROKEN,"after",FIXED,"realBuild",true,"realBrowser",true));
    }
    @Test void D10AT2_changingButUnrepairableSourceStopsAfterThreeRounds() throws Exception {
        var seed=seed();var provider=new Fixture("limit",seed);var task=run(seed,provider);
        assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_REPAIR_LIMIT_EXCEEDED");
        // One changing write per round and no completion request after it (D24-A round 2): 4 + 3 model calls, not 4 + 3x2.
        assertThat(task.repairAttempts()).isEqualTo(3);assertThat(provider.count.get()).isEqualTo(7);
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
        // D24-A round 2: replayed verbatim, the recorded read loop now stops earlier. A REPAIR read is offered only while a
        // full-size patch stays fundable after it, so the first recorded read a request no longer offers is refused before
        // any file tool, build or further model call. After the recorded PLAN/GENERATE (31,602 tokens left) the first two
        // REPAIR requests still fund a read, and the third refuses the recorded read 8. The repeated-read stop with reads
        // offered is covered separately.
        var seed=seed();var provider=recordedProvider(seed,"loop");var task=run(seed,provider);
        assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_TOOL_NOT_ALLOWED");
        var events=journal.read(seed.task());var last=provider.inputs.getLast();
        var repairInputs=provider.inputs.stream().filter(i->i.path("phase").asText().equals("REPAIR")).toList();
        assertThat(repairInputs).hasSize(3);assertThat(RecordedRepairFixture.offers(repairInputs.get(0),"files.read")).isTrue();
        assertThat(RecordedRepairFixture.offers(repairInputs.get(1),"files.read")).isTrue();
        assertThat(last.path("phase").asText()).isEqualTo("REPAIR");assertThat(RecordedRepairFixture.offers(last,"files.read")).isFalse();
        assertThat(provider.replayed).isEqualTo(8);assertThat(provider.skipped).isEmpty();
        assertThat(AgentJournal.latest(events,"model.response").path("name").asText()).isEqualTo("files.read");
        assertThat(provider.count).isEqualTo(9);
        assertThat(RuntimeBudget.meter(events).models()).isEqualTo(9);assertThat(RuntimeBudget.meter(events).tools()).isEqualTo(11);
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("tool.result")&&e.path("stage").asText().equals("REPAIR")).count()).isEqualTo(2);
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(1);
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.done")).count()).isZero();
        assertThat(AgentJournal.latest(events,"failure").path("recovery").asText()).isEqualTo("MANUAL_REVIEW_NO_AUTOMATIC_RETRY");
        assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
        report("D10-A-repeated-read-stop",seed,Map.of("recordedProvider",provider.model(),"extraModelCalls",0,"outerRetries",0,
                "offeredRecordedReads",2,"refusedRecordedReadIndex",provider.replayed));
    }
    @Test void unchangedReadLoopWithReadsOfferedStillStopsBeforeAnotherModelOrBuild() throws Exception {
        // With an ample budget REPAIR reads stay offered; the fourth unchanged read of one file still stops with CONTROL.
        var seed=seed();var provider=new Fixture("read-loop",seed);var task=run(seed,provider);
        assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_REPAIR_NO_PROGRESS");
        assertThat(provider.count.get()).isEqualTo(8);var events=journal.read(seed.task());
        var last=provider.inputs.getLast();assertThat(RecordedRepairFixture.offers(last,"files.read")).isTrue();
        assertThat(last.path("repairProgress").path("next").asText()).isEqualTo("PATCH_USING_OBSERVED_DIGEST");
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("tool.result")&&e.path("stage").asText().equals("REPAIR")).count()).isEqualTo(4);
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.read.repeat")).count()).isEqualTo(2);
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(1);
        assertThat(AgentJournal.latest(events,"failure").path("category").asText()).isEqualTo("CONTROL");
        assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
        report("D24-A-offered-read-loop-stop",seed,Map.of("modelCalls",provider.count.get(),"extraModelCalls",0,"outerRetries",0));
    }
    @Test void recordedUnknownPatchUsageKeepsItsFullReservationAndTheHostVerifiesThePatch() throws Exception {
        // Until D24-A this patch was discarded: done could not be reserved, so the task stopped AGENT_MODEL_BUDGET_EXCEEDED
        // with a real, digest-checked fix on disk (D21-A F3). Round 2 no longer solicits recorded reads a request does not
        // offer and verifies the patch as soon as it is committed. The unknown usage still keeps its full reservation, no
        // request beyond the caps is made, and only the real rebuild and browser decide the outcome.
        var seed=seed();var provider=recordedProvider(seed,"unknown-patch");var task=run(seed,provider);
        assertThat(task.status()).as(task.failureCode()).isEqualTo(TaskStatus.READY);
        // The recorded reads 6 and 7 are still offered; the synthetic patch takes the place of the skipped reads 8 and 9.
        assertThat(provider.skipped).containsExactly(8,9);assertThat(provider.replayed).isEqualTo(-1);
        assertThat(provider.count).isEqualTo(9);
        var events=journal.read(seed.task());
        var usage=events.stream().filter(e->e.path("kind").asText().equals("model.usage")&&e.path("stage").asText().equals("REPAIR")).reduce((a,b)->b).orElseThrow().path("payload");
        assertThat(usage.path("estimated").asBoolean()).isTrue();
        assertThat(usage.path("chargedTokens")).isEqualTo(usage.path("reservationTokens"));assertThat(usage.path("usage").path("totalTokens").isNull()).isTrue();
        var done=events.stream().filter(e->e.path("kind").asText().equals("repair.done")).map(e->e.path("payload")).toList();
        assertThat(done).hasSize(1);assertThat(done.getFirst().path("origin").asText()).isEqualTo("HOST_COMMITTED_PATCH");
        var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
        assertThat(drafts).hasSize(2);assertThat(done.getFirst().path("actions")).isEqualTo(drafts.getFirst().path("actions")).isEqualTo(drafts.getLast().path("actions"));
        var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
        assertThat(results).hasSize(2);assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        long recorded=0;for(int i=0;i<10;i++)if(!provider.skipped.contains(i))recorded+=provider.recordedUsage(i).path("totalTokens").asLong();
        var meter=RuntimeBudget.meter(events);assertThat(meter.models()).isEqualTo(provider.count);
        assertThat(meter.chargedTokens()).isEqualTo(recorded+usage.path("chargedTokens").asLong()).isLessThanOrEqualTo(RuntimeBudget.TOKENS);
        assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNotNull();
        report("D24-A-recorded-unknown-budget-host-completion",seed,Map.of("recordedProvider",provider.model(),"doneProviderCalled",false,"outerRetries",0,
                "meter",meter,"realBuildAndBrowser",true,"skippedRecordedReads",provider.skipped));
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
        // D24-A round 2 solicits no reply after a write, so a bare {"type":"done"} can only precede one. It still means
        // "verify with the host-owned original actions"; the unchanged failing source then stops without a READY claim.
        var seed=seed();var provider=new Fixture("bare",seed);var task=run(seed,provider);
        assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_REPAIR_NO_PROGRESS");
        var events=journal.read(seed.task());assertThat(provider.count.get()).isEqualTo(5);
        assertThat(AgentJournal.latest(events,"model.response")).isEqualTo(json.readTree("{\"type\":\"done\"}"));
        assertThat(AgentJournal.latest(events,"repair.done").path("origin").asText()).isEqualTo("MODEL");
        var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
        assertThat(drafts).hasSize(2);assertThat(drafts.getLast().path("actions")).isEqualTo(drafts.getFirst().path("actions"));
        assertThat(drafts.getLast().path("sourceDigest")).isEqualTo(drafts.getFirst().path("sourceDigest"));
        assertThat(AgentJournal.latest(events,"repair.done").path("actions")).isEqualTo(drafts.getFirst().path("actions"));
        assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(2);
        assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
        report("D24-A-bare-repair-done",seed,Map.of("modelCalls",provider.count.get(),"outerRetries",0,"realBuildAndBrowser",true));
    }
    @Test void hostVerifiesAnActualPatchWhenNoFurtherRequestCanBeFunded() throws Exception {
        var seed=seed();var provider=new Fixture("host-complete",seed);var task=run(seed,provider);
        assertThat(task.status()).as(task.failureCode()).isEqualTo(TaskStatus.READY);assertThat(provider.count.get()).isEqualTo(6);
        var events=journal.read(seed.task());var done=AgentJournal.latest(events,"repair.done");
        // Formerly HOST_BUDGET_EXHAUSTED; since D24-A round 2 every actual patch is verified as soon as it is committed.
        assertThat(done.path("origin").asText()).isEqualTo("HOST_COMMITTED_PATCH");
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
    /**
     * D24-A round 3: takes tool slots at GENERATE's recorded done, before the failed build, so REPAIR starts with a fixed
     * slot count. A read offer then turns on the slot rule, an exact count, not on a token margin that moves with the
     * prompt's line endings: the 20-line REPAIR prompt is 20 bytes longer with CRLF, and the read rule counts the input twice.
     */
    private java.util.function.Consumer<JsonNode> takeToolSlots(Seed seed,int slots) {
        return reply->{
            var lease=new TaskQueueService.Claim(seed.task(),jdbc.sql("SELECT lease_token FROM generation_tasks WHERE id=?").param(seed.task()).query(UUID.class).single(),TaskStatus.GENERATE);
            for(int i=0;i<slots;i++)store.reserve(lease,TaskStatus.GENERATE,"tool.request",0);
        };
    }
    private List<JsonNode> repairRequests(RecordedRepairWireFixture wire) {
        return wire.requests.stream().map(r -> json.readTree(r.path("messages").get(1).path("content").asText()))
                .filter(input -> input.path("phase").asText().equals("REPAIR")).toList();
    }
    @Test void completePaidProtocolErrorSurvivesRealWireParsingAndStopsWithoutRepairOrRetry() throws Exception {
        // The exact recorded final reply still ends the task. Recorded reads a request no longer offers are skipped
        // (D24-A round 2), so it arrives earlier, with its own recorded usage; skipped replies are never charged. After the
        // recorded PLAN/GENERATE (30,696 tokens left) the first REPAIR request still funds a read, so the recorded read 6
        // replays; the second offers none, so the recorded read 7 is skipped and the recorded bytes 8 follow.
        var seed=seed();Path directory=Path.of("../../docs/evidence/D10/M1/17f440cf-7970-46cc-b598-dd2d91a20ade");
        var provider=recordedProvider(seed,"recorded-invalid",directory);
        try(var wire=new dev.codeless.api.model.RecordedRepairWireFixture(provider)) {
            var task=run(seed,wire);var events=journal.read(seed.task());
            assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_MODEL_PROTOCOL_INVALID");
            assertThat(provider.replayed).isEqualTo(8);assertThat(provider.skipped).containsExactly(7);
            int calls=8;long charged=0;
            for(int i=0;i<9;i++)if(!provider.skipped.contains(i))charged+=provider.recordedUsage(i).path("totalTokens").asLong();
            assertThat(provider.count).isEqualTo(calls);assertThat(wire.requests).hasSize(calls);wire.assertHealthy();
            assertThat(RuntimeBudget.meter(events)).isEqualTo(new RuntimeBudget.Meter(calls,calls+2,charged));
            assertThat(AgentJournal.latest(events,"model.response")).isEqualTo(json.readTree("{\"type\":\"json_object\",\"error\":\"Invalid protocol reply.\"}"));
            assertThat(AgentJournal.latest(events,"failure").path("category").asText()).isEqualTo("MODEL_INTERFACE");
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(1);
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.done")).count()).isZero();
            assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
            var fingerprints=events.stream().filter(e->e.path("kind").asText().equals("model.input")).map(e->e.path("payload")).toList();
            assertThat(fingerprints).hasSize(calls);for(int i=0;i<calls;i++)assertThat(fingerprints.get(i).path("transport").path("bodyDigest").asText()).isEqualTo(wire.digests.get(i));
            var input=json.readTree(wire.requests.getLast().path("messages").get(1).path("content").asText());
            assertThat(RecordedRepairFixture.offers(input,"files.read")).isFalse();assertThat(input.path("observations")).hasSize(1);
            assertThat(input.path("repairProgress").path("next").asText()).startsWith("PATCH_");
            assertThat(input.path("budget").path("tokensRemaining").asLong()).isEqualTo(50000-charged+provider.recordedUsage(8).path("totalTokens").asLong());
            report("D10-A-protocol31-invalid",seed,Map.of("originTask","17f440cf-7970-46cc-b598-dd2d91a20ade","skippedRecordedReads",provider.skipped,
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
    @Test void capturedWrappedDoneStopsWithoutUnwrappingOrRetry() throws Exception {
        // The exact 657 wrapped-done bytes used to follow 720f's actual patch. D24-A round 2 solicits no reply after a write,
        // so they are placed at the first REPAIR request, before any write: still terminal, never unwrapped or retried.
        var seed=seed();var provider=new CapturedDoneRepairFixture("wrapped-first",recordedFault(seed));
        try(var wire=new RecordedRepairWireFixture(provider)) {
            var task=run(seed,wire);var events=journal.read(seed.task());wire.assertHealthy();
            assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_MODEL_PROTOCOL_INVALID");
            assertThat(provider.count).isEqualTo(7);assertThat(provider.replayed).containsExactly(0,1,2,3,4,5,11);assertThat(provider.skipped).containsExactly(6,7,8,9,10);
            long charged=provider.replayed.stream().mapToLong(i->provider.recordedUsage(i).path("totalTokens").asLong()).sum();
            assertThat(RuntimeBudget.meter(events)).isEqualTo(new RuntimeBudget.Meter(7,9,charged));
            assertThat(AgentJournal.latest(events,"model.response").path("type").asText()).isEqualTo("json_object");
            assertThat(AgentJournal.latest(events,"failure").path("category").asText()).isEqualTo("MODEL_INTERFACE");
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.done")).count()).isZero();
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("draft")).count()).isEqualTo(1);
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(1);
            assertThat(events.stream().filter(e->e.path("stage").asText().equals("REPAIR")&&e.path("kind").asText().equals("tool.result")).count()).isZero();
            assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
            assertThat(Files.readString(Path.of("target/repair-integration/workspaces",seed.task().toString(),"source",PAGE))).contains("../components/M1MissingCard.vue");
            report("D10-A-wrapped-done720f-invalid",seed,Map.of("originTask",provider.recording.path("originTask").asText(),"completeReplyBytes",657,
                "placement","FIRST_REPAIR_REQUEST_BEFORE_ANY_WRITE","paidCalls",0,"outerRetries",0,"actualPatchExecuted",false,"modelQualityEvidence",false,"wireDigests",wire.digests));
        }
    }
    @Test void repairReadThatTheRequestDoesNotOfferCannotConsumeAFileTool() throws Exception {
        // Formerly the last call after a patch offered no tools and refused a read. D24-A round 2 makes no call after a
        // patch at all and offers a REPAIR read only while a full-size patch stays fundable and another call and five tool
        // slots (read, write, snapshot, two verification) remain; replayed verbatim, the first recorded 720f read a request
        // no longer offers is refused before it can take a tool slot. Six slots taken before REPAIR fix which request that
        // is: the first REPAIR request (five slots left) still offers the recorded read 6, the second (four left) cannot
        // offer 7. Round 3: on tokens alone the second request missed the read by 30 tokens with the prompt checked out as
        // CRLF and funded it with 10 to spare as LF, so CI replayed the read 7 and reached READY.
        var seed=seed();var provider=new CapturedDoneRepairFixture("verbatim",recordedFault(seed).andThen(takeToolSlots(seed,6)));
        try(var wire=new RecordedRepairWireFixture(provider)) {
            var task=run(seed,wire);var events=journal.read(seed.task());wire.assertHealthy();
            assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_TOOL_NOT_ALLOWED");
            var repairs=repairRequests(wire);var last=repairs.getLast();
            assertThat(repairs.stream().map(r -> r.path("budget").path("toolCallsRemaining").asInt()).toList()).containsExactly(5,4);
            assertThat(RecordedRepairFixture.offers(repairs.getFirst(),"files.read")).isTrue();
            assertThat(RecordedRepairFixture.offers(last,"files.read")).isFalse();assertThat(RecordedRepairFixture.offers(last,"files.update")).isTrue();
            assertThat(last.path("repairProgress").path("next").asText()).startsWith("PATCH_");
            assertThat(provider.count).isEqualTo(8);assertThat(provider.replayed).containsExactly(0,1,2,3,4,5,6,7);assertThat(provider.skipped).isEmpty();
            assertThat(AgentJournal.latest(events,"model.response").path("name").asText()).isEqualTo("files.read");
            // Nine slots before REPAIR, six taken and one for the read 6: the refused read 7 took none.
            assertThat(RuntimeBudget.meter(events).models()).isEqualTo(8);assertThat(RuntimeBudget.meter(events).tools()).isEqualTo(16);
            assertThat(events.stream().filter(e->e.path("stage").asText().equals("REPAIR")&&e.path("kind").asText().equals("tool.result")).count()).isEqualTo(1);
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.done")).count()).isZero();
            assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
            report("D10-A-last-repair-tool-denied",seed,Map.of("originTask",provider.recording.path("originTask").asText(),"replayedVerbatim",true,
                "toolSlotsTakenBeforeRepair",6,"paidCalls",0,"outerRetries",0,"refusedToolExecuted",false,"wireDigests",wire.digests));
        }
    }
    @Test void capturedPatchIsVerifiedWithoutACompletionRequestWithinOriginalBudget() throws Exception {
        // 720f's recorded patch is verified as soon as it is committed, so the synthetic completion this test once needed
        // is gone, and the fixture fails on any REPAIR request after the patch. Recorded reads not offered are skipped. Six
        // slots taken before REPAIR fix the offers whatever the prompt's line endings (round 3, as above): the recorded read
        // 6 is offered with five slots left, 7 is not with four, so the recorded patch 8 follows the read 6, and the patch,
        // the snapshot and the two verification operations use exactly the last four slots.
        var seed=seed();var provider=new CapturedDoneRepairFixture("patch",recordedFault(seed).andThen(takeToolSlots(seed,6)));
        try(var wire=new RecordedRepairWireFixture(provider)) {
            var task=run(seed,wire);var events=journal.read(seed.task());wire.assertHealthy();
            assertThat(task.status()).as(task.failureCode()).isEqualTo(TaskStatus.READY);
            var repairs=repairRequests(wire);
            assertThat(repairs.stream().map(r -> r.path("budget").path("toolCallsRemaining").asInt()).toList()).containsExactly(5,4);
            assertThat(repairs.stream().map(r -> RecordedRepairFixture.offers(r,"files.read")).toList()).containsExactly(true,false);
            assertThat(provider.replayed).containsExactly(0,1,2,3,4,5,6,8);assertThat(provider.skipped).containsExactly(7);
            assertThat(provider.count).isEqualTo(8);
            long charged=provider.replayed.stream().mapToLong(i->provider.recordedUsage(i).path("totalTokens").asLong()).sum();
            var meter=RuntimeBudget.meter(events);assertThat(meter.models()).isEqualTo(8);
            assertThat(meter.tools()).isEqualTo(20);assertThat(meter.chargedTokens()).isEqualTo(charged).isLessThanOrEqualTo(50000);
            var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
            var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
            assertThat(drafts).hasSize(2);assertThat(drafts.getFirst().path("actions")).isEqualTo(drafts.getLast().path("actions"));
            assertThat(drafts.getFirst().path("sourceDigest")).isNotEqualTo(drafts.getLast().path("sourceDigest"));
            assertThat(results.getFirst().path("build").path("exitCode").asInt()).isEqualTo(2);
            assertThat(results.getLast().path("build").path("exitCode").asInt()).isZero();assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
            assertThat(AgentJournal.latest(events,"repair.done").path("origin").asText()).isEqualTo("HOST_COMMITTED_PATCH");
            assertThat(AgentJournal.latest(events,"model.usage").path("estimated").asBoolean()).isFalse(); // The recorded patch usage was measured.
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.read.repeat")).count()).isZero();
            report("D10-A-captured720f-host-verified-patch",seed,Map.of("originTask",provider.recording.path("originTask").asText(),"syntheticCompletion",false,
                "skippedRecordedReads",provider.skipped,"toolSlotsTakenBeforeRepair",6,"paidCalls",0,"outerRetries",0,"realBuildAndBrowser",true,"modelQualityEvidence",false,"wireDigests",wire.digests));
        }
    }
    @Test void exact17ccDuplicateReplyIsRejectedBeforePatchAndKeepsCompleteMeasuredUsage() throws Exception {
        var seed=seed();var provider=new DuplicateTypeRepairFixture(recordedFault(seed));
        try(var wire=new RecordedRepairWireFixture(provider)) {
            var task=run(seed,wire);var events=journal.read(seed.task());wire.assertHealthy();
            assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("MODEL_INVALID_RESPONSE");
            // Recorded reads a request no longer offers are skipped (D24-A round 2): the read 6 is still offered, 7 is not,
            // so the exact bytes arrive one request earlier, after one read instead of two.
            var skipped=provider.setup.skipped;assertThat(skipped).containsExactly(7);int calls=8;
            assertThat(provider.count).isEqualTo(calls);assertThat(wire.requests).hasSize(calls);
            assertThat(RuntimeBudget.meter(events)).isEqualTo(new RuntimeBudget.Meter(calls,calls+2,provider.charged));
            assertThat(RecordedRepairFixture.offers(json.readTree(wire.requests.getLast().path("messages").get(1).path("content").asText()),"files.read")).isFalse();
            assertThat(AgentJournal.latest(events,"model.response").path("name").asText()).isEqualTo("files.read");
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("model.response")).count()).isEqualTo(calls-1);
            assertThat(AgentJournal.latest(events,"model.usage").path("chargedTokens").asInt()).isEqualTo(4548);
            assertThat(AgentJournal.latest(events,"model.usage").path("estimated").asBoolean()).isFalse();
            assertThat(AgentJournal.latest(events,"failure").path("category").asText()).isEqualTo("MODEL_INTERFACE");
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("runner.result")).count()).isEqualTo(1);
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("draft")).count()).isEqualTo(1);
            assertThat(events.stream().filter(e->e.path("stage").asText().equals("REPAIR")&&e.path("kind").asText().equals("tool.result")).count()).isEqualTo(1);
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("repair.done")).count()).isZero();
            assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
            assertThat(jdbc.sql("SELECT input_tokens=3685 AND output_tokens=863 AND error_code='MODEL_INVALID_RESPONSE' FROM model_calls WHERE task_id=? ORDER BY created_at DESC LIMIT 1")
                    .param(seed.task()).query(Boolean.class).single()).isTrue();
            report("D10-A-duplicate17cc-invalid",seed,Map.of("provenance",provider.provenance,"wireDigests",wire.digests,"paidCalls",0,"outerRetries",0,
                    "setupNotHistoricalRequestReplay",true,"completeLastReplyBytesVerified",true,"historicalRequestBodyRead",false));
        }
    }
}
