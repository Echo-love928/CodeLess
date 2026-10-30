package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Exact public failed sources + explicitly authored proposals. Real DB/tools/Docker/Vue/Chromium, no paid model.
 * New proposals are separate from the immutable historical actions. Passing does not establish model quality. */
@SpringBootTest(properties={"codeless.model.provider=deterministic-mock","codeless.agent.enabled=true","codeless.agent.repository-root=../..",
        "codeless.agent.private-root=target/repair-integration/runtime","CODELESS_FILE_WORKSPACE_ROOT=target/repair-integration/workspaces",
        "CODELESS_FILE_AUDIT_ROOT=target/repair-integration/file-audit","codeless.model.audit-root=target/repair-integration/models"})
class D25QualityRegressionTest extends PostgresTestBase {
    @Autowired PlatformRepository repository;@Autowired TaskQueueService queue;@Autowired AgentRunStore store;
    @Autowired AgentJournal journal;@Autowired AgentEvidence evidence;@Autowired PlanValidator validator;
    @Autowired FileToolRegistry registry;@Autowired FileToolService files;@Autowired ModelCallRepository calls;
    @Autowired ModelCallAudit audit;@Autowired BuildGateway gateway;@Autowired JdbcClient jdbc;
    final JsonMapper json=JsonMapper.builder().build();
    final Path resource=Path.of("src/test/resources/d25-quality");
    static final String PAGE="src/pages/CatalogPage.vue",CARD="src/components/CafeCard.vue",DATA="src/data/cafes.ts";
    record Outcome(UUID task,TaskQueueService.TaskView view,List<JsonNode> events,Policy policy) {}
    @BeforeAll static void runtime() throws Exception {
        var p=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO().start();
        assertThat(p.waitFor(300,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(p.exitValue()).isZero();
    }
    JsonNode fixture(String name) throws Exception {
        var f=json.readTree(Files.readString(resource.resolve("fixtures.json"))).path(name);
        for(var file:f.path("digests"))assertThat(hash(f.path("files").path(file.path("path").asText()).asText())).isEqualTo(file.path("digest").asText());
        return f;
    }
    static String hash(String s) throws Exception {return "sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));}
    Map<String,String> sources(JsonNode fixture) {
        var files=new LinkedHashMap<String,String>();fixture.path("files").properties().forEach(e->files.put(e.getKey(),e.getValue().asText()));return files;
    }
    JsonNode actions(Object... steps) {return json.valueToTree(List.of(steps));}
    Map<String,Object> nav(){return Map.of("type","navigate","path","/catalog");}
    Map<String,Object> click(String id){return Map.of("type","click","target",Map.of("testId",id));}
    Map<String,Object> fill(String id,String value){return Map.of("type","fill","target",Map.of("testId",id),"value",value);}
    Map<String,Object> select(String value){return Map.of("type","select","target",Map.of("testId","district-select"),"value",value);}
    Map<String,Object> text(String id,String value){return Map.of("type","expectText","target",Map.of("testId",id),"value",value);}
    Map<String,Object> reload(){return Map.of("type","reload");}
    String bookId(JsonNode f,String title) {
        var matcher=java.util.regex.Pattern.compile("id: (\\d+),\\s*title: '"+java.util.regex.Pattern.quote(title)+"'").matcher(f.path("files").path("src/data/books.ts").asText());
        assertThat(matcher.find()).as("ID from the frozen original data: "+title).isTrue();return "book-"+matcher.group(1);
    }
    Map<String,String> uniqueCafe(JsonNode f) {
        var files=sources(f);
        files.put(CARD,files.get(CARD).replace("class=\"cafe-card\"","class=\"cafe-card\" :data-testid=\"'cafe-card-' + cafe.id\"")
                .replace("class=\"cafe-name\"","class=\"cafe-name\" :data-testid=\"'cafe-name-' + cafe.id\""));
        String detail="src/components/CafeDetail.vue";
        files.put(detail,files.get(detail).replace("<h2 ","<h2 data-testid=\"cafe-detail-title\" "));
        return files;
    }
    JsonNode cafeActions() {
        return actions(nav(),text("result-count","共 6 家咖啡馆"),select("静安区"),text("result-count","共 2 家咖啡馆"),
                fill("search-input","梧桐"),text("result-count","共 0 家咖啡馆"),fill("search-input",""),text("result-count","共 2 家咖啡馆"),
                select("all"),text("result-count","共 6 家咖啡馆"),click("cafe-card-1"),text("cafe-detail-title","云间咖啡"),
                click("cafe-card-2"),text("cafe-detail-title","梧桐树下"),fill("search-input","梧桐"),text("result-count","共 1 家咖啡馆"),
                text("cafe-name-2","梧桐树下"),reload(),text("result-count","共 6 家咖啡馆"));
    }
    Outcome run(String name,JsonNode f,Map<String,String> sources,JsonNode actions,String invalid,boolean repair) throws Exception {
        UUID owner=UUID.randomUUID(),app=UUID.randomUUID();repository.createUser(owner,owner+"@d25.test","D25 offline regression");
        repository.createApplication(app,owner,"D25 deterministic "+name,DataMode.valueOf(f.path("plan").path("dataMode").asText()));
        UUID task=queue.create(owner,app,f.path("prompt").asText(),null).id();
        jdbc.sql("UPDATE generation_tasks SET created_at=(SELECT min(created_at)-interval '1 second' FROM generation_tasks) WHERE id=?").param(task).update();
        var policy=new Policy(f,sources,actions,invalid,repair);
        try(var wire=new RecordedRepairWireFixture(policy)) {
            var loop=new AgentLoop(store,new AgentModel(wire,calls,audit,store),validator,registry,files,gateway,evidence,repair);
            var claim=queue.claim().orElseThrow();assertThat(claim.taskId()).isEqualTo(task);
            while(true) {
                var stage=queue.find(owner,task).orElseThrow().status();
                var result=loop.execute(claim,stage);
                loop.advance(queue,claim,result,result.next()==TaskStatus.FAILED?EventType.TASK_FAILED:result.next()==TaskStatus.READY?EventType.STAGE_COMPLETED:EventType.STAGE_STARTED);
                if(Set.of(TaskStatus.READY,TaskStatus.FAILED).contains(result.next()))break;
            }
            wire.assertHealthy();var events=journal.read(task);var view=queue.find(owner,task).orElseThrow();
            var o=new Outcome(task,view,events,policy);report(name,f,o,wire.requests.size());return o;
        } finally {
            var state=queue.find(owner,task).orElseThrow().status();if(!Set.of(TaskStatus.READY,TaskStatus.FAILED).contains(state))queue.cancel(owner,task);
        }
    }
    List<JsonNode> payloads(Outcome o,String kind){return o.events().stream().filter(e->e.path("kind").asText().equals(kind)).map(e->e.path("payload")).toList();}
    void ready(Outcome o) {
        assertThat(o.view().status()).as(o.view().failureCode()).isEqualTo(TaskStatus.READY);
        assertThat(payloads(o,"runner.result").getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        assertThat(payloads(o,"draft")).allSatisfy(d->assertThat(d.path("actions")).isEqualTo(o.policy().actions));
    }
    @Test void duplicateContentTrailingAndTruncatedRepliesRemainTerminalWithoutRetry() throws Exception {
        var f=fixture("cafe");String complete=json.writeValueAsString(Map.of("type","tool","name","files.create","arguments",Map.of("path",DATA,"content",f.path("files").path(DATA).asText())));
        String original=Files.readString(resource.resolve("duplicate-content.reply.txt"));
        assertThat(hash(original)).isEqualTo("sha256:583e3156e013652bb4ac5e85b2c8acff41336f82481480862c787a61df2944a8");
        assertThat(original.getBytes(StandardCharsets.UTF_8)).hasSize(9618);
        var replies=new LinkedHashMap<String,String>();replies.put("original-duplicate-content",original);
        replies.put("trailing-data",complete+" {}");replies.put("truncated-json",complete.substring(0,complete.length()-2));
        for(var entry:replies.entrySet()) {
            var o=run(entry.getKey(),f,sources(f),f.path("actions"),entry.getValue(),false);
            assertThat(o.view().status()).isEqualTo(TaskStatus.FAILED);assertThat(o.view().failureCode()).isEqualTo("MODEL_INVALID_RESPONSE");
            assertThat(o.policy().calls).isEqualTo(2);assertThat(payloads(o,"tool.result")).isEmpty();assertThat(payloads(o,"runner.result")).isEmpty();
            assertThat(payloads(o,"model.invalid").getFirst().path("reason").asText()).isEqualTo(entry.getKey().startsWith("original")?"DUPLICATE_KEY":entry.getKey().equals("trailing-data")?"TRAILING_TOKENS":"SYNTAX");
            assertThat(payloads(o,"model.response")).hasSize(1);assertThat(o.view().repairAttempts()).isZero();
        }
    }
    @Test void originalCafeAmbiguityStillFailsAndNewSingleContentProposalsKeepTheListUsable() throws Exception {
        var f=fixture("cafe");var old=run("cafe-original-ambiguous",f,sources(f),f.path("actions"),null,false);
        assertThat(old.view().status()).isEqualTo(TaskStatus.FAILED);
        assertThat(payloads(old,"runner.result").getFirst().path("verification").path("error").asText()).contains("strict mode violation","resolved to 2 elements");
        var fixed=run("cafe-unique-new-proposal",f,uniqueCafe(f),cafeActions(),null,false);ready(fixed);
        assertThat(fixed.policy().generationWrites).isEqualTo(4);
        assertThat(fixed.policy().sources.get(DATA)).isEqualTo(f.path("files").path(DATA).asText());
    }
    @Test void categoryTextAmbiguityIsRejectedAndRoleSpecificNewActionsSwitchDetailsThenFilterTheList() throws Exception {
        var f=fixture("books");var old=run("books-original-ambiguous",f,sources(f),f.path("actions"),null,false);
        assertThat(old.view().status()).isEqualTo(TaskStatus.FAILED);
        assertThat(payloads(old,"runner.result").getFirst().path("verification").path("error").asText()).contains("strict mode violation","resolved to 3 elements");
        var files=sources(f);files.put(PAGE,files.get(PAGE).replace("<button class=\"book-btn\"","<button :data-testid=\"'book-' + b.id\" class=\"book-btn\""));
        var next=actions(nav(),Map.of("type","click","target",Map.of("role","button","name","科技")),text("result-count","2 本图书"),
                Map.of("type","click","target",Map.of("role","button","name","全部")),click(bookId(f,"三体")),text("detail-author","刘慈欣"),
                click(bookId(f,"代码大全")),text("detail-category","科技"),fill("search-input","刘慈欣"),text("result-count","1 本图书"),
                fill("search-input",""),text("result-count","8 本图书"),reload(),text("result-count","8 本图书"));
        ready(run("books-role-specific-new-proposal",f,files,next,null,false));
    }
    @Test void contradictoryFrozenCategoryActionsStillFailWhileNewActionsExplicitlyResetAll() throws Exception {
        var f=fixture("tools");var old=run("tools-original-contradictory",f,sources(f),f.path("actions"),null,false);
        assertThat(old.view().status()).isEqualTo(TaskStatus.FAILED);
        assertThat(payloads(old,"runner.result").getFirst().path("verification").path("status").asText()).isEqualTo("FAILED");
        var files=sources(f);
        files.put(PAGE,files.get(PAGE).replace("<h1>","<p data-testid=\"tool-count\">{{ filtered.length }} 个工具</p><h1>"));
        var testing=Map.of("type","select","target",Map.of("testId","category-select"),"value","测试");
        var all=Map.of("type","select","target",Map.of("testId","category-select"),"value","全部");
        // An isolated diagnosis of the original contradictory suffix; the full historical sequence above stays intact.
        var contradiction=run("tools-isolated-original-category-contradiction",f,sources(f),
                actions(nav(),testing,fill("search-input","doc"),text("tool-name-docusaurus","Docusaurus")),null,false);
        assertThat(contradiction.view().status()).isEqualTo(TaskStatus.FAILED);
        assertThat(payloads(contradiction,"runner.result").getFirst().path("verification").path("error").asText()).contains("tool-name-docusaurus");
        var next=actions(nav(),testing,fill("search-input","Vitest"),text("tool-count","1 个工具"),fill("search-input",""),text("tool-count","3 个工具"),
                click("tool-name-vitest"),text("detail-name","Vitest"),all,click("tool-name-vite"),text("detail-name","Vite"),
                testing,fill("search-input","doc"),text("empty-state","没有匹配的工具"),fill("search-input",""),text("tool-count","3 个工具"),
                reload(),text("tool-count","9 个工具"));
        ready(run("tools-cumulative-new-proposal",f,files,next,null,false));
        assertThat(files.get("src/data/tools.ts")).isEqualTo(f.path("files").path("src/data/tools.ts").asText());
    }
    @Test void actualRepairInputContainsFrozenCafeTypeAndOneConsumerPatchFixesTheCompilerError() throws Exception {
        var f=fixture("cafeType");var files=uniqueCafe(f);
        assertThat(files.get(CARD)).contains("cafe.signatureDrink");
        var o=run("cafe-consumer-type-repair",f,files,cafeActions(),null,true);ready(o);
        assertThat(o.view().repairAttempts()).isEqualTo(1);
        var runs=payloads(o,"runner.result");assertThat(runs).hasSize(2);
        assertThat(runs.getFirst().path("build").path("log").path("text").asText()).contains("signatureDrink","does not exist on type 'Cafe'");
        assertThat(runs.getLast().path("build").path("exitCode").asInt(-1)).isZero();
        assertThat(o.policy().repairInputs).hasSize(1);
        var input=o.policy().repairInputs.getFirst();var seeded=input.path("repairSources").path("files");
        assertThat(seeded.valueStream().map(x->x.path("path").asText()).toList()).startsWith(CARD,DATA);
        assertThat(seeded.valueStream().filter(x->x.path("path").asText().equals(DATA)).findFirst().orElseThrow().path("content").asText())
                .isEqualTo(f.path("files").path(DATA).asText()).contains("signature: string");
        assertThat(o.policy().repairWrites).containsExactly(CARD);
        var drafts=payloads(o,"draft");assertThat(drafts).hasSize(2);
        for(String path:files.keySet()) {
            var before=drafts.getFirst().path("files").valueStream().filter(x->x.path("path").asText().equals(path)).findFirst().orElseThrow();
            var after=drafts.getLast().path("files").valueStream().filter(x->x.path("path").asText().equals(path)).findFirst().orElseThrow();
            assertThat(before.path("digest").asText()).isEqualTo(hash(files.get(path)));
            assertThat(after.path("digest").asText()).isEqualTo(hash(path.equals(CARD)?files.get(path).replace("cafe.signatureDrink","cafe.signature"):files.get(path)));
        }
        assertThat(payloads(o,"repair.done").getFirst().path("actions")).isEqualTo(cafeActions());
    }
    final class Policy implements ModelProvider {
        final JsonNode fixture,actions;final Map<String,String> sources;final String invalid;final boolean repair;
        final List<JsonNode> repairInputs=new ArrayList<>();final List<String> repairWrites=new ArrayList<>();
        int calls,generationWrites;
        Policy(JsonNode f,Map<String,String> s,JsonNode a,String i,boolean r){fixture=f;sources=s;actions=a;invalid=i;repair=r;}
        public String id(){return "deterministic-mock";}public String model(){return "d25-fixed-proposals-not-model-evaluation";}
        public Reply call(Prompt prompt,int max,Duration timeout) {
            calls++;assertThat(max).isEqualTo(4096);var input=json.readTree(prompt.getUserMessage().getText());String content;
            if(!input.has("phase"))content=fixture.path("plan").toString();
            else if(input.path("phase").asText().equals("REPAIR")) {
                assertThat(repair).isTrue();repairInputs.add(input.deepCopy());
                var frozen=input.path("repairSources").path("files");
                var consumer=frozen.valueStream().filter(x->x.path("path").asText().equals(CARD)).findFirst().orElseThrow();
                var type=frozen.valueStream().filter(x->x.path("path").asText().equals(DATA)).findFirst().orElseThrow();
                assertThat(type.path("content").asText()).contains("signature: string").doesNotContain("signatureDrink");
                repairWrites.add(CARD);content=json.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of("path",CARD,
                        "content",consumer.path("content").asText().replace("cafe.signatureDrink","cafe.signature"),"expectedDigest",consumer.path("digest").asText())));
            } else if(invalid!=null)content=invalid;
            else if(generationWrites<sources.size()) {
                String path=new ArrayList<>(sources.keySet()).get(generationWrites++);
                content=json.writeValueAsString(Map.of("type","tool","name","files.create","arguments",Map.of("path",path,"content",sources.get(path))));
            } else content=json.writeValueAsString(Map.of("type","done","actions",actions));
            return new Reply(content,new Evidence(model(),"offline-d25-"+calls,"offline-d25-"+calls,
                    new Usage(100,100,200,json.valueToTree(Map.of("measurement","DECLARED_SYNTHETIC_NOT_MEASURED","paidRequests",0)))));
        }
    }
    void report(String name,JsonNode f,Outcome o,int wireCalls) throws Exception {
        var meter=RuntimeBudget.meter(o.events());assertThat(meter.models()).isLessThanOrEqualTo(12);assertThat(meter.tools()).isLessThanOrEqualTo(20);
        assertThat(meter.chargedTokens()).isLessThanOrEqualTo(50000);assertThat(o.view().repairAttempts()).isLessThanOrEqualTo(3);
        var out=new LinkedHashMap<String,Object>();out.put("case",name);out.put("measurement","DETERMINISTIC_OFFLINE_NOT_MODEL_EVALUATION");out.put("paidRequests",0);
        out.put("originalBatch",f.path("batch"));out.put("originalSample",f.path("sample"));out.put("originalSourceDigest",f.path("sourceDigest"));
        out.put("historicalActionsDigest",hash(f.path("actions").toString()));out.put("proposedActions",o.policy().actions);out.put("task",o.view());
        out.put("wireRequests",wireCalls);out.put("meterSynthetic",meter);out.put("repairInputs",o.policy().repairInputs);
        for(String kind:List.of("model.invalid","repair.context","runner.result","repair.done","draft"))out.put(kind,payloads(o,kind));
        Path dir=Path.of("target/d25-quality");Files.createDirectories(dir);Files.writeString(dir.resolve(name+".json"),json.writeValueAsString(out));
    }
}
