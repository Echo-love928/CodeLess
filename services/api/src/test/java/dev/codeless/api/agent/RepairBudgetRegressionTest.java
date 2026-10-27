package dev.codeless.api.agent;

import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
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
import tools.jackson.databind.node.*;
import static org.assertj.core.api.Assertions.*;

/**
 * D24-A round 2 regressions for B's paid batch 1ff42488 (CAT-01, CAT-03, FAULT-CODE-02). The class compiles and runs
 * unchanged on the pre-fix tree f208767, where each of the three tasks fails as the paid one did, and passes on the fix;
 * the two controls fail identically on both trees. One fixed synthetic model policy drives every task: read the files it
 * wants while a read is offered, write one full-file patch of the failing page, answer any further request with the
 * task's reply. Replies cross the production DeepSeek wire to loopback with provider-like max_tokens truncation; the
 * database, file tools, the failed and fixed builds and the browser are real. Token counts are declared synthetic
 * (0.3 token per UTF-8 byte, an estimate), never measured, and no paid model is called.
 */
@SpringBootTest(properties={"codeless.model.provider=deterministic-mock","codeless.agent.enabled=true","codeless.agent.repository-root=../..",
        "codeless.agent.private-root=target/repair-integration/runtime","CODELESS_FILE_WORKSPACE_ROOT=target/repair-integration/workspaces",
        "CODELESS_FILE_AUDIT_ROOT=target/repair-integration/file-audit","codeless.model.audit-root=target/repair-integration/models"})
class RepairBudgetRegressionTest extends PostgresTestBase {
    @Autowired PlatformRepository repository;@Autowired TaskQueueService queue;@Autowired AgentRunStore store;
    @Autowired AgentJournal journal;@Autowired AgentEvidence evidence;@Autowired PlanValidator validator;
    @Autowired FileToolRegistry registry;@Autowired FileToolService files;@Autowired ModelCallRepository calls;
    @Autowired ModelCallAudit audit;@Autowired BuildGateway gateway;@Autowired JdbcClient jdbc;
    private final JsonMapper json=JsonMapper.builder().build();
    private static final String PAGE="src/pages/HomePage.vue",CARD="src/components/ProfileCard.vue",PROFILE="src/data/profile.ts",WORKS="src/data/works.ts";
    private static final String DONE="{\"type\":\"done\"}",JSON_OBJECT="{\"type\":\"json_object\"}";
    /**
     * One task's fixed inputs: tokens already charged when GENERATE ends (0 keeps the natural amount), padding bytes, the
     * files the policy wants to see before patching, its reply before or after the write, extra bytes in the patch.
     */
    record Shape(String name,int repairStart,int pagePadding,int dataPadding,List<String> wanted,String beforeWrite,String afterWrite,int patchPadding) {}
    // Successive dependency reads drained the paid task until its next request could not be reserved.
    static final Shape CAT01=new Shape("CAT-01",28500,4000,3000,List.of(PAGE,PROFILE,WORKS,CARD),null,DONE,0);
    // The paid task's final request could output only 723 tokens, less than the whole patch.
    static final Shape CAT03=new Shape("CAT-03",33600,4000,0,List.of(PAGE,CARD),null,DONE,0);
    // The paid task answered the request after its successful write with a root type json_object.
    static final Shape FAULT02=new Shape("FAULT-CODE-02",0,0,0,List.of(PAGE),null,JSON_OBJECT,0);
    static final Shape JSON_FIRST=new Shape("control-json-object-before-write",0,0,0,List.of(PAGE),JSON_OBJECT,DONE,0);
    static final Shape OVERSIZED=new Shape("control-patch-over-output-cap",0,0,0,List.of(PAGE),null,DONE,14000);
    record Seed(UUID owner,UUID app,UUID task) {}
    record Outcome(Shape shape,Seed seed,Policy policy,MaxTokensWireFixture wire,TaskQueueService.TaskView task,List<JsonNode> events) {}
    @BeforeAll static void runtime() throws Exception {
        var process=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO().start();
        assertThat(process.waitFor(300,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(process.exitValue()).isZero();
    }
    @Test void cat01DependencyReadsNoLongerLeaveTheNextRequestUnfunded() throws Exception {
        var outcome=execute(CAT01);assertRepairedWithinOriginalLimits(outcome);
        // The policy still wanted every dependency, yet every REPAIR request kept the full output allowance.
        assertThat(repair(outcome).stream().map(r -> r.get("maxTokens")).toList()).containsOnly(RuntimeBudget.OUTPUT_TOKENS);
    }
    @Test void cat03WholePatchIsEmittedWithinTheOriginalOutputCap() throws Exception {
        var outcome=execute(CAT03);assertRepairedWithinOriginalLimits(outcome);
        // The whole patch is longer than the paid task's final 723-token allowance, and it came back complete.
        var patch=repair(outcome).getLast();
        assertThat((Integer)patch.get("declaredOutputTokens")).isGreaterThan(723).isLessThanOrEqualTo((Integer)patch.get("maxTokens"));
    }
    @Test void faultCode02NoReplyIsSolicitedAfterTheCommittedPatch() throws Exception {
        var outcome=execute(FAULT02);assertRepairedWithinOriginalLimits(outcome);
        // The recorded json_object reply is never asked for: the write ends the proposal and real verification follows.
        assertThat(repair(outcome).stream().map(r -> r.get("reply")).toList()).containsExactly("files.update");
    }
    @Test void controlJsonObjectBeforeAnyWriteIsStillRejectedWithoutRetry() throws Exception {
        var outcome=execute(JSON_FIRST);var events=outcome.events();
        assertThat(outcome.task().status()).isEqualTo(TaskStatus.FAILED);assertThat(outcome.task().failureCode()).isEqualTo("AGENT_MODEL_PROTOCOL_INVALID");
        assertThat(AgentJournal.latest(events,"failure").path("category").asText()).isEqualTo("MODEL_INTERFACE");
        assertThat(AgentJournal.latest(events,"model.response")).isEqualTo(json.readTree(JSON_OBJECT));
        assertThat(repair(outcome).stream().map(r -> r.get("reply")).toList()).containsExactly("json_object");
        assertThat(kinds(events,"runner.result")).hasSize(1);assertThat(kinds(events,"draft")).hasSize(1);assertThat(kinds(events,"repair.done")).isEmpty();
        assertWithinCaps(events);
    }
    @Test void controlPatchOverTheOutputCapStillStopsAsLengthWithoutRetry() throws Exception {
        var outcome=execute(OVERSIZED);var events=outcome.events();
        assertThat(outcome.task().status()).isEqualTo(TaskStatus.FAILED);assertThat(outcome.task().failureCode()).isEqualTo("MODEL_INVALID_RESPONSE");
        assertThat(AgentJournal.latest(events,"failure").path("category").asText()).isEqualTo("MODEL_INTERFACE");
        var invalid=AgentJournal.latest(events,"model.invalid");
        assertThat(invalid.path("reason").asText()).isEqualTo("FINISH_REASON_LENGTH");assertThat(invalid.path("outputTokens").asInt()).isEqualTo(RuntimeBudget.OUTPUT_TOKENS);
        var last=outcome.wire().exchanges.getLast();
        assertThat(last.finishReason()).isEqualTo("length");assertThat(last.maxTokens()).isEqualTo(RuntimeBudget.OUTPUT_TOKENS);assertThat(last.completionTokens()).isEqualTo(RuntimeBudget.OUTPUT_TOKENS);
        assertThat(repair(outcome).getLast().get("reply")).isEqualTo("files.update");
        assertThat(kinds(events,"runner.result")).hasSize(1);assertThat(kinds(events,"draft")).hasSize(1);assertThat(kinds(events,"repair.done")).isEmpty();
        assertWithinCaps(events);
    }
    private void assertRepairedWithinOriginalLimits(Outcome outcome) {
        var events=outcome.events();
        assertThat(outcome.task().status()).as(outcome.task().failureCode()).isEqualTo(TaskStatus.READY);
        assertThat(outcome.task().repairAttempts()).isEqualTo(1);assertWithinCaps(events);
        assertThat(outcome.wire().exchanges).allSatisfy(e -> assertThat(e.finishReason()).isEqualTo("stop"));
        assertThat(kinds(events,"model.invalid")).isEmpty();
        // The patch came from a request funding the full output cap, and nothing was asked after it.
        var last=repair(outcome).getLast();
        assertThat(last.get("reply")).isEqualTo("files.update");assertThat(last.get("maxTokens")).isEqualTo(RuntimeBudget.OUTPUT_TOKENS);
        // The unchanged original actions verified the patch; the failed first candidate stays on record.
        var drafts=kinds(events,"draft");assertThat(drafts).hasSize(2);assertThat(drafts.getLast().path("actions")).isEqualTo(drafts.getFirst().path("actions"));
        var done=AgentJournal.latest(events,"repair.done");assertThat(done.path("actions")).isEqualTo(drafts.getFirst().path("actions"));
        assertThat(done.path("origin").asText()).isEqualTo("HOST_COMMITTED_PATCH");
        var runs=kinds(events,"runner.result");assertThat(runs).hasSize(2);
        assertThat(runs.getFirst().path("build").path("exitCode").asInt(-1)).isPositive();
        assertThat(runs.getFirst().path("build").path("log").path("text").asText()).contains("MissingCard.vue");
        assertThat(runs.getLast().path("build").path("exitCode").asInt(-1)).isZero();
        assertThat(runs.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        assertThat(jdbc.sql("SELECT count(*) FROM application_versions WHERE application_id=? AND status='FAILED'").param(outcome.seed().app())
                .query(Integer.class).single()).isEqualTo(1);
    }
    private static void assertWithinCaps(List<JsonNode> events) {
        var meter=RuntimeBudget.meter(events);
        assertThat(meter.models()).isLessThanOrEqualTo(RuntimeBudget.MODEL_CALLS);assertThat(meter.tools()).isLessThanOrEqualTo(RuntimeBudget.TOOL_CALLS);
        assertThat(meter.chargedTokens()).isLessThanOrEqualTo(RuntimeBudget.TOKENS);
    }
    private static List<Map<String,Object>> repair(Outcome outcome) {
        return outcome.policy().replies.stream().filter(r -> r.get("phase").equals("REPAIR")).toList();
    }
    private static List<JsonNode> kinds(List<JsonNode> events,String kind) {
        return events.stream().filter(e -> e.path("kind").asText().equals(kind)).map(e -> e.path("payload")).toList();
    }
    Seed seed() {
        UUID owner=UUID.randomUUID(),app=UUID.randomUUID();repository.createUser(owner,owner+"@repair-budget.test","D24-A repair budget");
        repository.createApplication(app,owner,"Static showcase",DataMode.STATIC);
        UUID task=queue.create(owner,app,"生成 Ada Lovelace 静态个人展示页",null).id();
        jdbc.sql("UPDATE generation_tasks SET created_at='2000-01-01' WHERE id=?").param(task).update();return new Seed(owner,app,task);
    }
    Outcome execute(Shape shape) throws Exception {
        var seed=seed();var policy=new Policy(shape,seed);
        try(var wire=new MaxTokensWireFixture(policy)) {
            new TaskScheduler(queue,new AgentLoop(store,new AgentModel(wire,calls,audit,store),validator,registry,files,gateway,evidence)).tick();
            var outcome=new Outcome(shape,seed,policy,wire,queue.find(seed.owner(),seed.task()).orElseThrow(),journal.read(seed.task()));
            report(outcome);return outcome;
        }
    }
    /** Content-free evidence, written before any assertion so the pre-fix run records its failure too. */
    void report(Outcome outcome) throws Exception {
        String configured=System.getenv("CODELESS_REPAIR_EVIDENCE_DIR");Path directory=configured==null?Path.of("target/repair-integration/evidence"):Path.of(configured);
        Files.createDirectories(directory);var events=outcome.events();var meter=RuntimeBudget.meter(events);var shape=outcome.shape();
        var out=new LinkedHashMap<String,Object>();
        out.put("scenario",shape.name());out.put("tree",System.getenv().getOrDefault("CODELESS_REGRESSION_TREE","unlabelled"));
        out.put("status",outcome.task().status().name());out.put("failureCode",outcome.task().failureCode());out.put("repairAttempts",outcome.task().repairAttempts());
        out.put("budget",Map.of("models",meter.models(),"tools",meter.tools(),"chargedTokens",meter.chargedTokens(),"caps",Map.of("models",RuntimeBudget.MODEL_CALLS,
                "tools",RuntimeBudget.TOOL_CALLS,"tokens",RuntimeBudget.TOKENS,"outputTokens",RuntimeBudget.OUTPUT_TOKENS)));
        var inputs=new LinkedHashMap<String,Object>();inputs.put("repairStartChargedTokens",shape.repairStart());inputs.put("naturalRepairStartTokens",outcome.policy().natural);
        inputs.put("pagePaddingBytes",shape.pagePadding());inputs.put("dataPaddingBytes",shape.dataPadding());inputs.put("patchPaddingBytes",shape.patchPadding());
        inputs.put("wanted",shape.wanted());out.put("shape",inputs);
        out.put("requests",outcome.wire().exchanges);out.put("replies",outcome.policy().replies);
        out.put("invalid",kinds(events,"model.invalid"));
        out.put("repairDoneOrigins",kinds(events,"repair.done").stream().map(p -> p.path("origin").asText()).toList());
        out.put("repairContext",kinds(events,"repair.context").stream().map(p -> Map.of("seeded",p.path("seeded").valueStream().map(s -> s.path("path").asText()).toList(),
                "omitted",p.path("omitted"))).toList());
        out.put("runs",kinds(events,"runner.result").stream().map(r -> Map.of("build",r.path("build").path("status").asText(),"buildExit",r.path("build").path("exitCode").asInt(-1),
                "verification",r.path("verification").path("status").asText(),"verificationFailure",r.path("verification").path("failure").asText())).toList());
        var drafts=kinds(events,"draft");out.put("drafts",drafts.size());
        out.put("draftActionsUnchanged",drafts.stream().allMatch(d -> d.path("actions").equals(drafts.getFirst().path("actions"))));
        out.put("usage","SYNTHETIC_DECLARED_0_3_TOKEN_PER_UTF8_BYTE_ESTIMATE_NOT_MEASURED");out.put("paidModelCalls",0);out.put("modelQualityEvidence",false);
        Files.writeString(directory.resolve("D24-A-r2-"+shape.name()+".json"),json.writeValueAsString(out));
    }
    /** Synthetic token estimate for UTF-8 bytes: 0.3 token per byte, rounded up (B's paid batch: 0.29-0.32 per reserved byte). */
    static int tokens(int bytes) {return (bytes*3+9)/10;}
    /**
     * One fixed model policy, identical on both trees; it reacts only to what each request offers and contains. GENERATE
     * writes a page whose missing component import fails the real build; REPAIR reads the files the task wants while a
     * read is offered, then writes one full-file patch of the page, then answers any further request with the task's reply.
     */
    final class Policy implements ModelProvider {
        final Shape shape;final Seed seed;final List<Map<String,Object>> replies=new ArrayList<>();Integer natural;
        Policy(Shape shape,Seed seed){this.shape=shape;this.seed=seed;}
        public String id(){return "deterministic-mock";}
        public String model(){return "d24-a-r2-budget-policy";}
        public Reply call(Prompt prompt,int max,Duration timeout) {
            String system=prompt.getSystemMessage().getText(),user=prompt.getUserMessage().getText();
            var input=json.readTree(user);String phase=input.has("phase")?input.path("phase").asText():"PLAN";
            int reservation=RuntimeBudget.inputReservation(system,user);
            var offered=new TreeSet<String>();input.path("tools").forEach(t -> offered.add(t.path("name").asText()));
            String content;boolean prior=false;
            if(phase.equals("PLAN")) {
                var plan=(ObjectNode)json.readTree(new MockModelProvider().call(prompt,max,timeout).content());
                ((ArrayNode)plan.path("files")).add(json.valueToTree(Map.of("path",PROFILE,"purpose","资料数据")));
                ((ArrayNode)plan.path("files")).add(json.valueToTree(Map.of("path",WORKS,"purpose","作品数据")));
                content=plan.toString();
            } else if(phase.equals("GENERATE")) {
                int observed=input.path("observations").size();var order=List.of(CARD,PROFILE,WORKS,PAGE);
                if(observed<order.size()) content=json.writeValueAsString(Map.of("type","tool","name","files.create","arguments",Map.of("path",order.get(observed),"content",source(order.get(observed)))));
                else {
                    content="{\"type\":\"done\",\"actions\":[{\"type\":\"navigate\",\"path\":\"/\"},{\"type\":\"expectText\",\"target\":{\"testId\":\"profile-name\"},\"value\":\"Ada Lovelace\"}]}";
                    prior=true;
                }
            } else {
                var known=new LinkedHashMap<String,String[]>();boolean wrote=false;
                for(var file:input.path("repairSources").path("files")) known.put(file.path("path").asText(),new String[]{file.path("content").asText(),file.path("digest").asText()});
                for(var receipt:input.path("observations")) {
                    if(!receipt.path("status").asText().equals("SUCCEEDED")) continue;
                    if(receipt.path("tool").asText().equals("files.update")) wrote=true;
                    if(receipt.path("tool").asText().equals("files.read") && receipt.path("content").isString())
                        known.put(receipt.path("path").asText(),new String[]{receipt.path("content").asText(),receipt.path("afterDigest").asText()});
                }
                String next=shape.wanted().stream().filter(path -> !known.containsKey(path)).findFirst().orElse(null);
                if(wrote) content=shape.afterWrite();
                else if(shape.beforeWrite()!=null) content=shape.beforeWrite();
                else if(next!=null && offered.contains("files.read")) content=json.writeValueAsString(Map.of("type","tool","name","files.read","arguments",Map.of("path",next)));
                else if(known.containsKey(PAGE)) content=json.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of("path",PAGE,
                        "expectedDigest",known.get(PAGE)[1],"content",known.get(PAGE)[0].replace("../components/MissingCard.vue","../components/ProfileCard.vue")
                                +(shape.patchPadding()>0?"<!-- synthetic oversized patch "+"y".repeat(shape.patchPadding())+" -->\n":""))));
                else content=DONE;
            }
            int output=tokens(content.getBytes(StandardCharsets.UTF_8).length),promptTokens=tokens(reservation);
            if(prior) {
                // Synthetic prior consumption (declared, not measured): GENERATE of the paid tasks' larger apps had
                // already spent this much when REPAIR began. It stays within this call's own reservation.
                long settled=RuntimeBudget.meter(journal.read(seed.task())).chargedTokens()-reservation-max;
                natural=(int)settled+promptTokens+output;
                if(shape.repairStart()>0) {
                    int declared=(int)(shape.repairStart()-settled-output);
                    assertThat(declared).as("synthetic prior consumption within this call's reservation").isBetween(promptTokens,reservation+max-output);
                    promptTokens=declared;
                }
            }
            var parsed=json.readTree(content);var reply=new LinkedHashMap<String,Object>();
            reply.put("phase",phase);reply.put("maxTokens",max);reply.put("inputReservation",reservation);
            reply.put("tokensRemaining",input.path("budget").path("tokensRemaining").isNumber()?input.path("budget").path("tokensRemaining").asInt():null);
            reply.put("offeredRead",offered.contains("files.read"));
            reply.put("reply",phase.equals("PLAN")?"plan":parsed.path("type").asText().equals("tool")?parsed.path("name").asText():parsed.path("type").asText());
            reply.put("path",parsed.path("arguments").path("path").isString()?parsed.path("arguments").path("path").asText():null);
            reply.put("promptTokens",promptTokens);reply.put("declaredOutputTokens",output);replies.add(reply);
            return new Reply(content,new Evidence(model(),"explicit-synthetic-request","explicit-synthetic-response",new Usage(promptTokens,output,promptTokens+output,null)));
        }
        String source(String path) {
            return switch(path) {
                case CARD -> "<template><section data-ai-component=\"profile-card\"><h1 data-testid=\"profile-name\">Ada Lovelace</h1><p>静态个人资料与作品</p></section></template>\n";
                case PROFILE -> "export const profile = { tagline: '静态个人资料与作品' };\n"+padding("// ","",shape.dataPadding());
                case WORKS -> "export const works = ['CodeLess Showcase'];\n"+padding("// ","",shape.dataPadding());
                default -> "<script setup lang=\"ts\">import ProfileCard from '../components/MissingCard.vue';import { profile } from '../data/profile';"
                        +"import { works } from '../data/works';</script><template><main data-ai-component=\"home-page\"><ProfileCard/>"
                        +"<p>{{ profile.tagline }}</p><p>作品：{{ works[0] }}</p></main></template>\n"+padding("<!-- ","-->",shape.pagePadding());
            };
        }
    }
    static String padding(String open,String close,int bytes) {return bytes<=0?"":open+"synthetic budget padding "+"x".repeat(bytes)+" "+close+"\n";}
}
