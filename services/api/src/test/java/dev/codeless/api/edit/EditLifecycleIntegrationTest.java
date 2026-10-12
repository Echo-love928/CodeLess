package dev.codeless.api.edit;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.agent.*;
import dev.codeless.api.apps.ApplicationService;
import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import dev.codeless.api.versions.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
        "codeless.model.provider=deterministic-mock", "CODELESS_DEMO_PASSWORD=demo-password-for-test-only",
        "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only", "codeless.agent.enabled=true",
        "codeless.agent.repair.enabled=false", "codeless.agent.repository-root=../..",
        "codeless.agent.private-root=target/edit-integration/runtime", "codeless.versions.root=target/edit-integration/versions",
        "CODELESS_FILE_WORKSPACE_ROOT=target/edit-integration/workspaces", "CODELESS_FILE_AUDIT_ROOT=target/edit-integration/audit"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class EditLifecycleIntegrationTest extends PostgresTestBase {
    static final int TLS=freePort(),CONTROL=freePort();
    static int freePort() {try(var socket=new java.net.ServerSocket(0)){return socket.getLocalPort();}catch(Exception failure){throw new IllegalStateException(failure);}}
    @DynamicPropertySource static void preview(DynamicPropertyRegistry registry) {
        registry.add("CODELESS_PREVIEW_SIGNING_KEY",()->"11".repeat(32));registry.add("CODELESS_PREVIEW_REGISTRY_KEY",()->"44".repeat(32));
        registry.add("CODELESS_PREVIEW_ORIGIN",()->"https://preview.codeless-preview.test:"+TLS);
        registry.add("CODELESS_PLATFORM_ORIGIN",()->"https://platform.codeless.test:"+TLS);
        registry.add("CODELESS_PREVIEW_GATEWAY_INTERNAL_ORIGIN",()->"http://127.0.0.1:"+CONTROL);
    }
    @Value("${local.server.port}") int port;
    @Autowired JdbcClient jdbc;
    @Autowired TaskQueueService queue;
    @Autowired ApplicationService apps;
    @Autowired TaskStageRunner loop;
    @Autowired AgentJournal journal;
    @Autowired AgentRunStore store;
    @Autowired FileToolService tools;
    @Autowired SnapshotStore snapshots;
    final JsonMapper json=JsonMapper.builder().build();
    final HttpClient http=HttpClient.newHttpClient();
    record Login(String cookie,String csrf) {}
    static Login login,other;
    static UUID owner,app,base,current;
    static JsonNode originalSource,originalSnapshot;
    static String baseDigest;
    String url(String route) {return "http://127.0.0.1:"+port+"/api/v0/"+route;}
    HttpResponse<String> get(String route,Login session) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create(url(route))).GET();
        if(session!=null) builder.header("Cookie",session.cookie());
        return http.send(builder.build(),HttpResponse.BodyHandlers.ofString());
    }
    HttpResponse<String> post(String route,Object body,String key,Login session,boolean csrf) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create(url(route))).header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        if(session!=null) {builder.header("Cookie",session.cookie());if(csrf) builder.header("X-CSRF-Token",session.csrf());}
        if(key!=null) builder.header("Idempotency-Key",key);
        return http.send(builder.build(),HttpResponse.BodyHandlers.ofString());
    }
    Login login(String email,String password) throws Exception {
        var first=get("auth/csrf",null);assertThat(first.statusCode()).isEqualTo(200);
        var initial=new Login(first.headers().firstValue("set-cookie").orElseThrow().split(";",2)[0],json.readTree(first.body()).path("token").asText());
        var result=post("auth/login",Map.of("email",email,"password",password),null,initial,true);
        assertThat(result.statusCode()).isEqualTo(200);
        return new Login(result.headers().firstValue("set-cookie").orElseThrow().split(";",2)[0],initial.csrf());
    }
    Map<String,Object> request(UUID version,String prompt) {return Map.of("baseVersionId",version,"prompt",prompt,"source",Map.of("type","CHAT","messageId","message-12"));}
    HttpResponse<String> edit(UUID version,String prompt,String key) throws Exception {return post("applications/"+app+"/edits",request(version,prompt),key,login,true);}
    UUID task(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(202);
        return UUID.fromString(json.readTree(response.body()).path("task").path("id").asText());
    }
    TaskQueueService.Claim claim(UUID task) {var result=queue.claim().orElseThrow();assertThat(result.taskId()).isEqualTo(task);return result;}
    TaskStageRunner.StageResult stage(TaskQueueService.Claim claim,TaskStatus stage,TaskStatus expected) throws Exception {
        var result=loop.execute(claim,stage);
        if(result.next()!=expected) report("failure-"+claim.taskId(),Map.of("stage",stage,"actualNext",result.next(),"failureCode",Objects.requireNonNullElse(result.failureCode(),"UNKNOWN")));
        assertThat(result.next()).as("%s %s",stage,result.failureCode()).isEqualTo(expected);
        loop.advance(queue,claim,result,result.next()==TaskStatus.READY?EventType.STAGE_COMPLETED:result.next()==TaskStatus.FAILED?EventType.TASK_FAILED:EventType.STAGE_STARTED);
        return result;
    }
    JsonNode draft(UUID task) {return AgentJournal.latest(journal.read(task),"draft");}
    void report(String name,Object value) throws Exception {
        Path root=Path.of(System.getenv().getOrDefault("CODELESS_EDIT_EVIDENCE_DIR","target/edit-integration/evidence"));
        Files.createDirectories(root);Files.writeString(root.resolve(name+".json"),json.writeValueAsString(value));
    }
    @BeforeAll static void prepare() throws Exception {
        Process p=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO().start();
        assertThat(p.waitFor(300,TimeUnit.SECONDS)).isTrue();assertThat(p.exitValue()).isZero();
    }
    @BeforeEach void prerequisites(TestInfo info) {
        if(info.getTestMethod().orElseThrow().getAnnotation(Order.class).value()>1)
            assertThat(current).as("Real baseline/edit prerequisite unavailable; later cases must not claim success").isNotNull();
    }
    @Test @Order(1) void d12aT1EditCreatesNewDraftFromBaseThenRealReadyWithoutOverwriteOrPublication() throws Exception {
        login=login("demo@codeless.local","demo-password-for-test-only");other=login("admin@codeless.local","admin-password-for-test-only");
        owner=jdbc.sql("SELECT id FROM platform_users WHERE email='demo@codeless.local'").query(UUID.class).single();
        app=apps.create(owner,"Conversation edit acceptance",null,"STATIC").id();
        UUID original=queue.create(owner,app,"生成静态个人展示页，展示 Ada Lovelace 与作品",null).id();var first=claim(original);
        stage(first,TaskStatus.PLAN,TaskStatus.GENERATE);stage(first,TaskStatus.GENERATE,TaskStatus.VERIFY);stage(first,TaskStatus.VERIFY,TaskStatus.READY);
        base=UUID.fromString(draft(original).path("versionId").asText());baseDigest=draft(original).path("sourceDigest").asText();
        originalSource=json.readTree(get("versions/"+base+"/files/content?path=src/components/ProfileCard.vue",login).body());
        originalSnapshot=json.readTree(get("versions/"+base+"/snapshot",login).body());
        var accepted=edit(base,"将展示人物改为 Hedy Lamarr","edit-12");UUID edited=task(accepted);
        assertThat(task(edit(base,"将展示人物改为 Hedy Lamarr","edit-12"))).isEqualTo(edited);
        assertThat(json.readTree(get("tasks/"+edited+"/edit",login).body()).path("source").path("messageId").asText()).isEqualTo("message-12");
        var claimed=claim(edited);stage(claimed,TaskStatus.PLAN,TaskStatus.GENERATE);stage(claimed,TaskStatus.GENERATE,TaskStatus.VERIFY);
        var candidate=draft(edited);UUID next=UUID.fromString(candidate.path("versionId").asText());
        assertThat(next).isNotEqualTo(base);
        var pending=json.readTree(get("versions/"+next,login).body());assertThat(pending.path("status").asText()).isEqualTo("DRAFT");
        assertThat(pending.path("taskId").asText()).isEqualTo(edited.toString());
        assertThat(snapshots.readSource(next,candidate.path("sourceDigest").asText(),"src/pages/HomePage.vue"))
                .isEqualTo(snapshots.readSource(base,baseDigest,"src/pages/HomePage.vue"));
        assertThat(snapshots.readSource(next,candidate.path("sourceDigest").asText(),"src/components/ProfileCard.vue")).contains("Hedy Lamarr");
        assertThat(json.readTree(get("versions/"+base+"/files/content?path=src/components/ProfileCard.vue",login).body())).isEqualTo(originalSource);
        assertThat(json.readTree(get("versions/"+base+"/snapshot",login).body())).isEqualTo(originalSnapshot);
        assertThat(apps.find(owner,app).orElseThrow().latestReadyVersionId()).isEqualTo(base);
        stage(claimed,TaskStatus.VERIFY,TaskStatus.READY);current=next;
        assertThat(apps.find(owner,app).orElseThrow().latestReadyVersionId()).isEqualTo(current);
        assertThat(jdbc.sql("SELECT count(*) FROM publications WHERE application_id=?").param(app).query(Integer.class).single()).isZero();
        report("D12-A-T1",Map.of("baseVersionId",base,"versionId",current,"taskId",edited,"draft",pending,
                "edit",json.readTree(accepted.body()),"baseSnapshot",originalSnapshot,"verifiedSnapshot",json.readTree(get("versions/"+current+"/snapshot",login).body()),
                "realPostgresDockerChromium",true,"unchangedHomeFile",true,"publications",0));
    }
    @Test @Order(2) void d12aT2StaleBaseReturns409AndRetainsRequirementAndSource() throws Exception {
        int before=jdbc.sql("SELECT count(*) FROM generation_tasks WHERE application_id=?").param(app).query(Integer.class).single();
        var response=edit(base,"保留这条需求供用户核对后重提",null);assertThat(response.statusCode()).isEqualTo(409);
        var error=json.readTree(response.body());assertThat(error.path("code").asText()).isEqualTo("EDIT_VERSION_CONFLICT");
        assertThat(error.path("details").path("prompt").asText()).isEqualTo("保留这条需求供用户核对后重提");
        assertThat(error.path("details").path("messageId").asText()).isEqualTo("message-12");
        assertThat(error.path("details").path("currentVersionId").asText()).isEqualTo(current.toString());
        assertThat(jdbc.sql("SELECT count(*) FROM generation_tasks WHERE application_id=?").param(app).query(Integer.class).single()).isEqualTo(before);
        report("D12-A-T2",Map.of("httpStatus",response.statusCode(),"response",error,"noTaskCreated",true));
    }
    @Test @Order(3) void d12aT3ConcurrentRequestsAllowOneQueuedEditAndBlockOrdinaryGeneration() throws Exception {
        var start=new CountDownLatch(1);var responses=new ArrayList<HttpResponse<String>>();
        try(var executor=Executors.newFixedThreadPool(8)) {
            var futures=new ArrayList<Future<HttpResponse<String>>>();
            for(int i=0;i<8;i++) futures.add(executor.submit(() -> {start.await();return edit(current,"再次修改介绍",null);}));
            start.countDown();for(var future:futures) responses.add(future.get(30,TimeUnit.SECONDS));
        }
        assertThat(responses.stream().filter(r -> r.statusCode()==202).count()).isEqualTo(1);
        for(var rejected:responses.stream().filter(r -> r.statusCode()!=202).toList()) {
            assertThat(rejected.statusCode()).isEqualTo(409);assertThat(json.readTree(rejected.body()).path("code").asText()).isEqualTo("EDIT_TASK_ACTIVE");
        }
        UUID winner=task(responses.stream().filter(r -> r.statusCode()==202).findFirst().orElseThrow());
        var normal=post("tasks",Map.of("applicationId",app,"prompt","生成新应用"),null,login,true);
        assertThat(normal.statusCode()).isEqualTo(409);
        assertThat(jdbc.sql("SELECT count(*) FROM generation_tasks WHERE application_id=? AND queue_state IN ('QUEUED','RUNNING')")
                .param(app).query(Integer.class).single()).isEqualTo(1);
        queue.cancel(owner,winner);
        report("D12-A-T3",Map.of("statuses",responses.stream().map(HttpResponse::statusCode).toList(),"taskId",winner,"ordinaryGenerationStatus",normal.statusCode(),"activeCountBeforeCancel",1));
    }
    @Test @Order(4) void d12aT4CancelRejectsLateWorkerAndPreservesOriginalUsableVersion() throws Exception {
        UUID edited=task(edit(current,"修改后取消",null));var claim=claim(edited);
        stage(claim,TaskStatus.PLAN,TaskStatus.GENERATE);stage(claim,TaskStatus.GENERATE,TaskStatus.VERIFY);
        var cancelled=post("tasks/"+edited+"/cancel",Map.of(),null,login,true);assertThat(cancelled.statusCode()).isEqualTo(200);
        assertThat(json.readTree(cancelled.body()).path("failureCode").asText()).isEqualTo("CANCELLED");
        var late=loop.execute(claim,TaskStatus.VERIFY);assertThat(late.next()).isEqualTo(TaskStatus.FAILED);assertThat(late.failureCode()).isEqualTo("AGENT_LEASE_INVALID");
        assertThatThrownBy(() -> loop.advance(queue,claim,new TaskStageRunner.StageResult(TaskStatus.READY,"late",null),EventType.STAGE_COMPLETED)).isInstanceOf(RuntimeException.class);
        assertThat(apps.find(owner,app).orElseThrow().latestReadyVersionId()).isEqualTo(current);
        for(UUID id:List.of(base,current)) {
            assertThat(get("versions/"+id+"/snapshot",login).statusCode()).isEqualTo(200);
            assertThat(get("versions/"+id+"/files/content?path=src/components/ProfileCard.vue",login).statusCode()).isEqualTo(200);
        }
        var preview=realCancelledPreview();
        assertThat(json.readTree(get("versions/"+base+"/snapshot",login).body())).isEqualTo(originalSnapshot);
        UUID replacement=task(edit(current,"取消后可以继续修改",null));queue.cancel(owner,replacement);
        report("D12-A-T4",Map.of("taskId",edited,"cancel",json.readTree(cancelled.body()),"lateWorkerCode",late.failureCode(),
                "latestReadyVersionId",current,"originalVersionId",base,"originalSourceAndPreviewHttpStatus",200,"preview",preview,"replacementTaskId",replacement));
    }
    JsonNode realCancelledPreview() throws Exception {
        Path root=Path.of("target/edit-integration/preview-"+UUID.randomUUID()).toAbsolutePath();Files.createDirectories(root);
        Path input=root.resolve("input.json");
        Files.writeString(input,json.writeValueAsString(Map.of("apiOrigin","http://127.0.0.1:"+port,"app",app,"versions",List.of(base,current),
                "cookie",login.cookie(),"csrf",login.csrf(),"tlsPort",TLS,"controlPort",CONTROL,"evidence",root.toString(),
                "privateRoot",Path.of("target/edit-integration/runtime").toAbsolutePath().toString(),
                "sourceRoot",Path.of("target/edit-integration/workspaces").toAbsolutePath().toString())));
        Path log=root.resolve("command.log");
        Process process=new ProcessBuilder("node","../../tests/edit/lifecycle/cancel-preview.mjs",input.toString()).redirectErrorStream(true).redirectOutput(log.toFile()).start();
        try {
            assertThat(process.waitFor(90,TimeUnit.SECONDS)).as("Preview timeout; private log %s",log).isTrue();
            assertThat(process.exitValue()).as(Files.readString(log)).isZero();
            var result=json.readTree(Files.readString(root.resolve("preview.json")));
            report("cancel-preview",result);return result;
        } finally {
            if(process.isAlive()){process.descendants().forEach(ProcessHandle::destroyForcibly);process.destroyForcibly();}
            Files.deleteIfExists(input);
        }
    }
    @Test @Order(5) void unauthorizedMalformedUnavailableBasesAndIdempotencyCollisionsFailClosed() throws Exception {
        var body=request(current,"边界测试");
        assertThat(post("applications/"+app+"/edits",body,null,null,false).statusCode()).isEqualTo(401);
        assertThat(post("applications/"+app+"/edits",body,null,login,false).statusCode()).isEqualTo(403);
        assertThat(post("applications/"+app+"/edits",body,null,other,true).statusCode()).isEqualTo(404);
        for(Object malformed:List.of(Map.of("baseVersionId",current,"prompt"," ","source",Map.of("type","CHAT")),
                Map.of("baseVersionId","1-1-1-1-1","prompt","x","source",Map.of("type","CHAT")),
                Map.of("baseVersionId",current,"prompt","x","source",Map.of("type","CHAT","sourceFile","../secret")),
                Map.of("baseVersionId",current,"prompt","x","source",Map.of("type","COMPONENT")),
                Map.of("baseVersionId",current,"prompt","x","source",Map.of("type","CHAT"),"publish",true)))
            assertThat(post("applications/"+app+"/edits",malformed,null,login,true).statusCode()).isEqualTo(400);
        assertThat(edit(UUID.randomUUID(),"不存在的基版本",null).statusCode()).isEqualTo(409);
        UUID task=task(edit(current,"幂等请求","boundary-key"));
        assertThat(edit(current,"另一需求","boundary-key").statusCode()).isEqualTo(409);
        assertThat(edit(base,"幂等请求","boundary-key").statusCode()).isEqualTo(409);
        assertThat(post("tasks",Map.of("applicationId",app,"prompt","幂等请求"),"boundary-key",login,true).statusCode()).isEqualTo(409);
        assertThat(get("tasks/"+task+"/edit",other).statusCode()).isEqualTo(404);
        queue.cancel(owner,task);
        assertThat(task(edit(current,"幂等请求","boundary-key"))).isEqualTo(task); // Cancelled replay never creates a new task.
        UUID normal=queue.create(owner,app,"ordinary queued task","ordinary-key").id();
        assertThat(edit(current,"ordinary queued task","ordinary-key").statusCode()).isEqualTo(409);
        assertThat(edit(current,"不同键修改",null).statusCode()).isEqualTo(409);queue.cancel(owner,normal);
        report("boundaries",Map.of("anonymous",401,"csrf",403,"otherOwner",404,"invalidInputs",400,"missingBase",409,"idempotencyCollision",409));
    }
    @Test @Order(6) void realFailedEditBuildCannotReplaceUsableVersion() throws Exception {
        UUID task=task(edit(current,"展示人物修改",null));var claim=claim(task);
        stage(claim,TaskStatus.PLAN,TaskStatus.GENERATE);
        // Seed and use the actual file tools, then freeze syntactically invalid Vue; runner/build is real.
        var source=store.editSource(claim).orElseThrow();tools.seed(task,claim.token(),source);
        var result=tools.execute(task,claim.token(),"files.update",json.writeValueAsString(Map.of("path","src/components/ProfileCard.vue",
                "expectedDigest",source.manifest().files().stream().filter(f -> f.path().equals("src/components/ProfileCard.vue")).findFirst().orElseThrow().digest(),
                "content","<script setup lang=\"ts\">const broken = ;</script><template>broken</template>")));
        assertThat(result.status()).isEqualTo("SUCCEEDED");
        var actions=json.readTree("[{\"type\":\"navigate\",\"path\":\"/\"},{\"type\":\"expectText\",\"target\":{\"testId\":\"profile-name\"},\"value\":\"Hedy Lamarr\"}]");
        var draft=store.draft(claim,tools.snapshot(task,claim.token()),actions);
        queue.advance(claim,TaskStatus.VERIFY,EventType.STAGE_STARTED,"Actual invalid Vue build fixture",null);
        var failed=stage(claim,TaskStatus.VERIFY,TaskStatus.FAILED);
        var actual=AgentJournal.latest(journal.read(task),"runner.result");
        assertThat(actual.path("build").path("exitCode").asInt()).isNotZero();
        assertThat(apps.find(owner,app).orElseThrow().latestReadyVersionId()).isEqualTo(current);
        assertThat(get("versions/"+current+"/files",login).statusCode()).isEqualTo(200);
        report("real-build-failure",Map.of("taskId",task,"versionId",draft.path("versionId"),"failureCode",failed.failureCode(),
                "buildStatus",actual.path("build").path("status"),"exitCode",actual.path("build").path("exitCode"),"latestReadyVersionId",current));
    }
    @Test @Order(7) void optimisticCommitRejectsBaseChangedAfterRealVerification() throws Exception {
        UUID task=task(edit(current,"并发提交防护",null));var claim=claim(task);
        stage(claim,TaskStatus.PLAN,TaskStatus.GENERATE);stage(claim,TaskStatus.GENERATE,TaskStatus.VERIFY);
        var result=loop.execute(claim,TaskStatus.VERIFY);assertThat(result.next()).isEqualTo(TaskStatus.READY);
        // Simulate a separate authorized writer changing the available-version pointer while verification ran.
        jdbc.sql("UPDATE applications SET latest_ready_version_id=?,row_version=row_version+1 WHERE id=?").params(base,app).update();
        var view=loop.advance(queue,claim,result,EventType.STAGE_COMPLETED);
        assertThat(view.status()).isEqualTo(TaskStatus.FAILED);assertThat(view.failureCode()).isEqualTo("EDIT_VERSION_CONFLICT");
        assertThat(apps.find(owner,app).orElseThrow().latestReadyVersionId()).isEqualTo(base);
        var candidate=draft(task);assertThat(json.readTree(get("versions/"+candidate.path("versionId").asText(),login).body()).path("status").asText()).isEqualTo("FAILED");
        assertThat(jdbc.sql("SELECT count(*) FROM publications WHERE application_id=?").param(app).query(Integer.class).single()).isZero();
        jdbc.sql("UPDATE applications SET latest_ready_version_id=? WHERE id=?").params(current,app).update();
        report("commit-conflict",Map.of("taskId",task,"expectedBaseVersionId",current,"actualCurrentVersionId",base,"failureCode",view.failureCode(),"candidateStatus","FAILED"));
    }
    @Test @Order(8) void recordRuntimeModelUsageSeparatelyWithoutInventedTokens() throws Exception {
        var calls=jdbc.sql("""
                SELECT m.task_id,m.stage,m.provider,m.status,m.input_tokens,m.output_tokens FROM model_calls m
                JOIN generation_tasks t ON t.id=m.task_id WHERE t.application_id=? ORDER BY m.created_at,m.id
                """).param(app).query((rs,n) -> {
                    var row=new LinkedHashMap<String,Object>();row.put("taskId",rs.getObject("task_id").toString());
                    for(String key:List.of("stage","provider","status"))row.put(key,rs.getString(key));
                    row.put("inputTokens",rs.getObject("input_tokens"));row.put("outputTokens",rs.getObject("output_tokens"));return row;
                }).list();
        assertThat(calls).isNotEmpty();assertThat(calls).allSatisfy(row -> assertThat(row.get("provider")).isEqualTo("deterministic-mock"));
        report("runtime-usage",Map.of("provider","deterministic-mock","requests",calls.size(),"paidModelRequests",0,
                "inputTokens","UNKNOWN","outputTokens","UNKNOWN","totalTokens","UNKNOWN","usageSource","persisted model_calls","calls",calls));
    }
}
