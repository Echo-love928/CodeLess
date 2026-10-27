package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.edit.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import dev.codeless.api.versions.SnapshotStore;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * dba59d9d failure shapes, not private source or a paid model replay. One fixed synthetic policy reacts to the
 * host's action semantics, prerequisite operations and first seeded owner. Real PostgreSQL, component edit scope,
 * file tools, Docker/Vue builds, Chromium and production DeepSeek wire; declared usage is synthetic, not measured.
 * TASK-03 is a strict-rejection control on both trees, not a claim to repair provider syntax without a retry.
 */
@SpringBootTest(properties={"codeless.model.provider=deterministic-mock","codeless.agent.enabled=true","codeless.agent.repository-root=../..",
        "codeless.agent.private-root=target/repair-integration/runtime","CODELESS_FILE_WORKSPACE_ROOT=target/repair-integration/workspaces",
        "CODELESS_FILE_AUDIT_ROOT=target/repair-integration/file-audit","codeless.model.audit-root=target/repair-integration/models"})
class RoundFiveRegressionTest extends PostgresTestBase {
    @Autowired PlatformRepository repository;@Autowired TaskQueueService queue;@Autowired AgentRunStore store;
    @Autowired AgentJournal journal;@Autowired AgentEvidence evidence;@Autowired PlanValidator validator;
    @Autowired FileToolRegistry registry;@Autowired FileToolService files;@Autowired ModelCallRepository calls;
    @Autowired ModelCallAudit audit;@Autowired BuildGateway gateway;@Autowired JdbcClient jdbc;
    @Autowired EditTaskService edits;@Autowired SnapshotStore snapshots;
    final JsonMapper json=JsonMapper.builder().build();
    static final String HOME="src/pages/HomePage.vue",WORK="src/components/WorkCard.vue";
    static final String CATALOG="src/pages/CatalogPage.vue",DETAIL="src/components/CafeDetail.vue";
    record Seed(UUID owner,UUID app,UUID task) {}
    record Outcome(Seed seed,Policy policy,TaskQueueService.TaskView task,List<JsonNode> events,List<MaxTokensWireFixture.Exchange> exchanges) {}
    @BeforeAll static void runtime() throws Exception {
        var p=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO().start();
        assertThat(p.waitFor(300,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(p.exitValue()).isZero();
    }
    Seed seed() {
        UUID owner=UUID.randomUUID(),app=UUID.randomUUID();repository.createUser(owner,owner+"@round-five.test","D24-A round five");
        repository.createApplication(app,owner,"Synthetic round five",DataMode.STATIC);
        UUID task=queue.create(owner,app,"Generate a static synthetic showcase",null).id();
        jdbc.sql("UPDATE generation_tasks SET created_at='2000-01-01' WHERE id=?").param(task).update();return new Seed(owner,app,task);
    }
    Outcome run(Seed seed,String mode) throws Exception {
        // The shared test database can contain another class's intentionally queued work. This fixture may run only
        // its selected task, including component edits created after the baseline. Do not drain or reset other work.
        jdbc.sql("UPDATE generation_tasks SET created_at=(SELECT min(created_at)-interval '1 second' FROM generation_tasks) WHERE id=?")
                .param(seed.task()).update();
        var policy=new Policy(mode);
        try(var wire=new MaxTokensWireFixture(policy)) {
            var loop=new AgentLoop(store,new AgentModel(wire,calls,audit,store),validator,registry,files,gateway,evidence);
            TaskStageRunner selected=new TaskStageRunner() {
                public StageResult execute(UUID task,TaskStatus stage){throw new AssertionError("Original claim required");}
                public StageResult execute(TaskQueueService.Claim claim,TaskStatus stage){
                    assertThat(claim.taskId()).as("fixture must not execute another task").isEqualTo(seed.task());
                    return loop.execute(claim,stage);
                }
                public TaskQueueService.TaskView advance(TaskQueueService q,TaskQueueService.Claim claim,StageResult result,EventType type){
                    return loop.advance(q,claim,result,type);
                }
            };
            new TaskScheduler(queue,selected).tick();
            var result=new Outcome(seed,policy,queue.find(seed.owner(),seed.task()).orElseThrow(),journal.read(seed.task()),List.copyOf(wire.exchanges));
            report(mode,result);return result;
        } finally {
            var task=queue.find(seed.owner(),seed.task()).orElseThrow();
            if(!Set.of(TaskStatus.READY,TaskStatus.FAILED).contains(task.status()))queue.cancel(seed.owner(),seed.task());
        }
    }
    @Test void cat02ExactTitleAndConditionalDetailPassTheUnchangedOriginalActions() throws Exception {
        var o=run(seed(),"CAT02");assertThat(o.task().status()).as(o.task().failureCode()).isEqualTo(TaskStatus.READY);
        assertThat(o.task().repairAttempts()).isEqualTo(2);assertUnchangedActions(o);
        assertThat(payloads(o,"runner.result")).hasSize(3).allSatisfy(r->assertThat(r.path("build").path("exitCode").asInt(-1)).isZero());
        assertThat(payloads(o,"runner.result").getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        assertThat(o.policy().repairInputs.getLast().path("repairSources").path("files").get(0).path("path").asText()).isEqualTo(DETAIL);
        var context=o.policy().repairInputs.getLast().path("failure").path("actionContext");
        assertThat(context.path("precedingActions")).isEqualTo(json.readTree("[{\"type\":\"navigate\",\"path\":\"/catalog\"},{\"type\":\"click\",\"target\":{\"text\":\"Oak\"}}]"));
        assertThat(context.path("textComparison").asText()).isEqualTo("EXACT_NORMALIZED_INNER_TEXT");
    }
    @Test void edit02SharedInstancesRemainVisibleAndOnlyTheSelectedFileChanges() throws Exception {
        var baseline=run(seed(),"BASE");assertThat(baseline.task().status()).isEqualTo(TaskStatus.READY);
        var base=AgentJournal.latest(baseline.events(),"draft");UUID version=UUID.fromString(base.path("versionId").asText());
        String digest=base.path("sourceDigest").asText();
        var selected=new EditMetadata.Source("COMPONENT",null,"work-card",version,digest,null);
        UUID task=edits.create(baseline.seed().owner(),baseline.seed().app(),version,
                "Change body color to #1d4ed8 for every shared instance; only edit the selected source file",selected,null).task().id();
        var other=seed(); // Deliberately older queued work: the fixture must neither claim nor execute it.
        try {
        var o=run(new Seed(baseline.seed().owner(),baseline.seed().app(),task),"EDIT02");
        assertThat(o.task().status()).as(o.task().failureCode()).isEqualTo(TaskStatus.READY);assertThat(o.task().repairAttempts()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT queue_state='QUEUED' AND lease_token IS NULL FROM generation_tasks WHERE id=?").param(other.task()).query(Boolean.class).single()).isTrue();
        assertThat(jdbc.sql("SELECT count(*) FROM model_calls WHERE task_id=?").param(other.task()).query(Integer.class).single()).isZero();
        assertUnchangedActions(o);
        var repaired=AgentJournal.latest(o.events(),"draft");UUID after=UUID.fromString(repaired.path("versionId").asText());
        for(var f:base.path("files"))if(!f.path("path").asText().equals(WORK))
            assertThat(repaired.path("files").valueStream().filter(n->n.path("path").equals(f.path("path"))).findFirst().orElseThrow()).isEqualTo(f);
        String card=snapshots.readSource(after,repaired.path("sourceDigest").asText(),WORK);
        assertThat(card).contains("#1d4ed8","data-ai-component=\"work-card\"","title === 'First'");
        assertThat(snapshots.readSource(version,digest,WORK)).contains("#000000").doesNotContain("data-testid");
        assertThat(o.policy().repairInputs).allSatisfy(in->{
            assertThat(in.path("scope")).isEqualTo(json.valueToTree(List.of(WORK)));
            assertThat(in.path("repairSources").path("files")).hasSize(1);
            assertThat(in.path("failure").path("actionContext").path("targetCardinality").asInt()).isEqualTo(1);
        });
        // These three original heading assertions execute after the unique marker assertion in real Chromium.
        assertThat(repaired.path("actions")).hasSize(5);
        } finally {queue.cancel(other.owner(),other.task());}
    }
    @Test void task03SameLexicalSyntaxShapeStillStopsWithoutRetryOrFreeze() throws Exception {
        var o=run(seed(),"SYNTAX");assertThat(o.task().status()).isEqualTo(TaskStatus.FAILED);
        assertThat(o.task().failureCode()).isEqualTo("MODEL_INVALID_RESPONSE");assertThat(o.exchanges()).hasSize(4);
        var invalid=AgentJournal.latest(o.events(),"model.invalid");
        assertThat(invalid.path("source").asText()).isEqualTo("PARSER");assertThat(invalid.path("reason").asText()).isEqualTo("SYNTAX");
        assertThat(invalid.path("contentBytes").asInt()).isEqualTo(488);assertThat(invalid.path("line").asInt()).isEqualTo(1);
        assertThat(invalid.path("column").asInt()).isEqualTo(423);assertThat(invalid.path("rootValues")).isEqualTo(json.readTree("[\"UNREADABLE\"]"));
        assertThat(payloads(o,"draft")).isEmpty();assertThat(payloads(o,"runner.result")).isEmpty();
        assertThat(o.exchanges().getLast().finishReason()).isEqualTo("stop");
    }
    @Test void controlBareDoneWithoutChangingSourceStillStopsAsNoProgress() throws Exception {
        var o=run(seed(),"BARE");assertThat(o.task().status()).isEqualTo(TaskStatus.FAILED);
        assertThat(o.task().failureCode()).isEqualTo("AGENT_REPAIR_NO_PROGRESS");assertThat(o.task().repairAttempts()).isEqualTo(1);
        var drafts=payloads(o,"draft");assertThat(drafts).hasSize(2);
        assertThat(drafts.getFirst().path("sourceDigest")).isEqualTo(drafts.getLast().path("sourceDigest"));assertUnchangedActions(o);
    }
    static List<JsonNode> payloads(Outcome o,String kind) {return o.events().stream().filter(e->e.path("kind").asText().equals(kind)).map(e->e.path("payload")).toList();}
    void assertUnchangedActions(Outcome o) {
        var drafts=payloads(o,"draft");assertThat(drafts).isNotEmpty();
        assertThat(drafts).allSatisfy(d->assertThat(d.path("actions")).isEqualTo(drafts.getFirst().path("actions")));
        var meter=RuntimeBudget.meter(o.events());assertThat(meter.models()).isLessThanOrEqualTo(12);assertThat(meter.tools()).isLessThanOrEqualTo(20);assertThat(meter.chargedTokens()).isLessThanOrEqualTo(50000);
    }
    void report(String name,Outcome o) throws Exception {
        Path out=Path.of(System.getenv().getOrDefault("CODELESS_REPAIR_EVIDENCE_DIR","target/round-five-evidence"));Files.createDirectories(out);
        var value=new LinkedHashMap<String,Object>();value.put("scenario",name);value.put("tree",System.getenv().getOrDefault("CODELESS_REGRESSION_TREE","unlabelled"));
        value.put("provenance","SYNTHETIC_DBA59D9D_FAILURE_SHAPES_NOT_ORIGINAL_SOURCE_OR_MODEL_REPLAY");
        value.put("status",o.task().status());value.put("failureCode",o.task().failureCode());value.put("repairAttempts",o.task().repairAttempts());
        value.put("meter",RuntimeBudget.meter(o.events()));value.put("exchanges",o.exchanges());value.put("invalid",payloads(o,"model.invalid"));
        value.put("runs",payloads(o,"runner.result").stream().map(r->Map.of("build",r.path("build").path("status").asText(),
                "buildExit",r.path("build").path("exitCode").asInt(-1),"browser",r.path("verification").path("status").asText(),
                "failure",r.path("verification").path("failure").asText())).toList());
        value.put("failures",payloads(o,"repair.failure").stream().map(f->Map.of("code",f.path("code").asText(),"index",f.path("failedAction").path("index").asInt(-1),"decision",f.path("decision").asText())).toList());
        value.put("seeded",payloads(o,"repair.context").stream().map(c->c.path("seeded").valueStream().map(f->f.path("path").asText()).toList()).toList());
        value.put("repairOrigins",payloads(o,"repair.done").stream().map(d->d.path("origin").asText()).toList());
        var drafts=payloads(o,"draft");value.put("actionsUnchanged",drafts.isEmpty()||drafts.stream().allMatch(d->d.path("actions").equals(drafts.getFirst().path("actions"))));
        value.put("paidCalls",0);value.put("modelQualityEvidence",false);value.put("usage","SYNTHETIC_DECLARED_0_3_TOKEN_PER_UTF8_BYTE_ESTIMATE_NOT_MEASURED");
        Files.writeString(out.resolve("D24-A-r5-"+name+".json"),json.writeValueAsString(value));
    }
    final class Policy implements ModelProvider {
        final String mode;final List<JsonNode> repairInputs=new ArrayList<>();
        Policy(String mode){this.mode=mode;}
        public String id(){return "deterministic-mock";}public String model(){return "d24-r5-"+mode.toLowerCase(Locale.ROOT);}
        public Reply call(Prompt prompt,int max,Duration timeout) {
            var in=json.readTree(prompt.getUserMessage().getText());String phase=in.path("phase").asText();String content;
            boolean catalog=mode.equals("CAT02");
            if(!Set.of("GENERATE","REPAIR").contains(phase))content=plan(prompt,max,timeout,catalog).toString();
            else if(phase.equals("GENERATE")) {
                int observed=in.path("observations").size();
                if(in.has("editContext")) {
                    var target=in.path("editContext").path("sourceFiles").get(0);
                    content=observed==0?update(WORK,target.path("digest").asText(),target.path("content").asText().replace("#000000","#1d4ed8")):done(sharedActions(true));
                } else if(observed<2) {
                    String file=catalog?(observed==0?DETAIL:CATALOG):(observed==0?WORK:HOME);
                    content=json.writeValueAsString(Map.of("type","tool","name","files.create","arguments",Map.of("path",file,"content",source(file))));
                } else if(mode.equals("SYNTAX")) {
                    try{content=json.readTree(Files.readString(Path.of("../../tests/agent/repair/fixtures/d24-r5-syntax-shape.json"))).path("content").asText();}
                    catch(Exception e){throw new IllegalStateException(e);}
                } else content=done(catalog?catalogActions():sharedActions(!mode.equals("BASE")));
            } else {
                repairInputs.add(in.deepCopy());
                var action=in.path("failure").path("failedAction").path("action");var contract=in.path("failure").path("actionContext");
                var sources=in.path("repairSources").path("files");String path=catalog?CATALOG:WORK;
                JsonNode target=sources.valueStream().filter(f->f.path("path").asText().equals(path)).findFirst().orElse(null);
                if(mode.equals("BARE"))content="{\"type\":\"done\"}";
                else if(!catalog) {
                    String current=Objects.requireNonNull(target).path("content").asText();
                    if(contract.path("targetCardinality").asInt()==1)
                        content=update(WORK,target.path("digest").asText(),current.replace("data-ai-component=\"work-card\"","data-ai-component=\"work-card\" :data-testid=\"title === 'First' ? 'work-card' : undefined\""));
                    else if(current.contains("data-testid"))content="{\"type\":\"done\"}";
                    else content=update(WORK,target.path("digest").asText(),current.replace("data-ai-component=\"work-card\"","data-ai-component=\"work-card\" data-testid=\"work-card\""));
                } else if(action.path("target").path("testId").asText().equals("catalog-page")) {
                    String current=Objects.requireNonNull(target).path("content").asText();
                    // Without exact-text semantics the first proposal attaches the marker to the whole container,
                    // matching the paid first repair; on the subsequent mismatch it moves it onto the title.
                    boolean exact=contract.path("textComparison").asText().equals("EXACT_NORMALIZED_INNER_TEXT")||current.contains("data-testid=\"catalog-page\"");
                    String fixed=exact?current.replace(" data-testid=\"catalog-page\"","").replace("<h1>","<h1 data-testid=\"catalog-page\">"):
                            current.replace("data-ai-component=\"catalog-page\"","data-ai-component=\"catalog-page\" data-testid=\"catalog-page\"");
                    content=update(CATALOG,target.path("digest").asText(),fixed);
                } else if(sources.get(0).path("path").asText().equals(DETAIL)&&contract.path("precedingActions").valueStream().anyMatch(a->a.path("type").asText().equals("click"))) {
                    var detail=sources.get(0);content=update(DETAIL,detail.path("digest").asText(),detail.path("content").asText().replace("data-ai-component=\"cafe-detail\"","data-ai-component=\"cafe-detail\" data-testid=\"cafe-detail\""));
                } else {
                    content=update(CATALOG,Objects.requireNonNull(target).path("digest").asText(),target.path("content").asText().replace("<CafeDetail v-if=\"selected\"/>","<CafeDetail v-if=\"selected\"/><div v-else data-testid=\"cafe-detail\"></div>"));
                }
            }
            int input=estimate(prompt.getSystemMessage().getText().getBytes(StandardCharsets.UTF_8).length+prompt.getUserMessage().getText().getBytes(StandardCharsets.UTF_8).length);
            int output=estimate(content.getBytes(StandardCharsets.UTF_8).length);
            return new Reply(content,new Evidence(model(),"explicit-synthetic-r5","explicit-synthetic-r5",new Usage(input,output,input+output,null)));
        }
        ObjectNode plan(Prompt prompt,int max,Duration timeout,boolean catalog) {
            var p=(ObjectNode)json.readTree(new MockModelProvider().call(prompt,max,timeout).content());
            String page=catalog?CATALOG:HOME,component=catalog?DETAIL:WORK,route=catalog?"/catalog":"/";
            p.set("pages",json.valueToTree(List.of(Map.of("route",route,"file",page,"title","Synthetic page","purpose","Show synthetic data"))));
            p.set("components",json.valueToTree(List.of(Map.of("name",catalog?"CafeDetail":"WorkCard","file",component,"purpose","Synthetic reusable component"))));
            p.set("files",json.valueToTree(List.of(Map.of("path",page,"purpose","Synthetic page"),Map.of("path",component,"purpose","Synthetic component"))));
            p.set("acceptance",json.valueToTree(List.of(Map.of("id","A1","route",route,"action","Open page and inspect data","expected","Synthetic content is visible"))));return p;
        }
        String update(String path,String digest,String content) {return json.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of("path",path,"expectedDigest",digest,"content",content)));}
        String done(JsonNode actions) {return json.writeValueAsString(Map.of("type","done","actions",actions));}
        JsonNode catalogActions() {return json.readTree("[{\"type\":\"navigate\",\"path\":\"/catalog\"},{\"type\":\"expectText\",\"target\":{\"testId\":\"catalog-page\"},\"value\":\"Coffee directory\"},{\"type\":\"click\",\"target\":{\"text\":\"Oak\"}},{\"type\":\"expectText\",\"target\":{\"testId\":\"cafe-detail\"},\"value\":\"Oak west Rating 4.9\"}]");}
        JsonNode sharedActions(boolean marker) {
            var actions=json.createArrayNode();actions.addObject().put("type","navigate").put("path","/");
            if(marker)actions.add(json.valueToTree(Map.of("type","expectVisible","target",Map.of("testId","work-card"))));
            for(String name:List.of("First","Second","Third"))actions.add(json.valueToTree(Map.of("type","expectVisible","target",Map.of("role","heading","name",name))));return actions;
        }
        String source(String file) {
            return switch(file) {
                case WORK -> "<script setup lang=\"ts\">defineProps<{title:string}>();</script><template><article data-ai-component=\"work-card\"><h2>{{title}}</h2><p>Shared body</p></article></template><style scoped>p { color: #000000; }</style>";
                case HOME -> "<script setup lang=\"ts\">import WorkCard from '../components/WorkCard.vue';const works=['First','Second','Third'];</script><template><main data-ai-component=\"home-page\"><WorkCard v-for=\"title in works\" :key=\"title\" :title=\"title\"/></main></template>";
                case DETAIL -> "<script setup lang=\"ts\"></script><template><section data-ai-component=\"cafe-detail\"><h2>Oak</h2><p>west Rating 4.9</p></section></template>";
                default -> "<script setup lang=\"ts\">import { ref } from 'vue';import CafeDetail from '../components/CafeDetail.vue';const selected=ref(false);</script><template><main data-ai-component=\"catalog-page\"><h1>Coffee directory</h1><button @click=\"selected=true\">Oak</button><CafeDetail v-if=\"selected\"/></main></template>";
            };
        }
    }
    static int estimate(int bytes){return (bytes*3+9)/10;}
}
