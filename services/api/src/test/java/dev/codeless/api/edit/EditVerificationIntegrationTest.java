package dev.codeless.api.edit;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.agent.*;
import dev.codeless.api.apps.ApplicationService;
import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.model.*;
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
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Named model proposals only. Every VERIFY uses real PostgreSQL, Docker/Vue build and Chromium. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
        "codeless.model.provider=deterministic-mock", "CODELESS_DEMO_PASSWORD=demo-password-for-test-only",
        "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only", "codeless.agent.enabled=true",
        "codeless.agent.repository-root=../..", "codeless.agent.private-root=target/edit-verification/runtime",
        "codeless.versions.root=target/edit-verification/versions", "CODELESS_FILE_WORKSPACE_ROOT=target/edit-verification/workspaces",
        "CODELESS_FILE_AUDIT_ROOT=target/edit-verification/audit", "codeless.model.audit-root=target/edit-verification/models"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class EditVerificationIntegrationTest extends PostgresTestBase {
    static final String TARGET="src/components/ProfileCard.vue";
    static final String STYLE="<style scoped>section { color: #3344aa; }</style>";
    static final String SYNTAX="<script setup lang=\"ts\">const broken = ;</script>";
    static final int TLS=freePort(),CONTROL=freePort();
    static int freePort() {try(var s=new ServerSocket(0)){return s.getLocalPort();}catch(Exception e){throw new IllegalStateException(e);}}
    @DynamicPropertySource static void preview(DynamicPropertyRegistry r) {
        r.add("CODELESS_PREVIEW_SIGNING_KEY",()->"11".repeat(32));r.add("CODELESS_PREVIEW_REGISTRY_KEY",()->"44".repeat(32));
        r.add("CODELESS_PREVIEW_ORIGIN",()->"https://preview.codeless-preview.test:"+TLS);
        r.add("CODELESS_PLATFORM_ORIGIN",()->"https://platform.codeless.test:"+TLS);
        r.add("CODELESS_PREVIEW_GATEWAY_INTERNAL_ORIGIN",()->"http://127.0.0.1:"+CONTROL);
    }
    @Value("${local.server.port}") int port;
    @Autowired JdbcClient jdbc;
    @Autowired TaskQueueService queue;
    @Autowired ApplicationService apps;
    @Autowired TaskStageRunner initial;
    @Autowired AgentJournal journal;
    @Autowired AgentRunStore store;
    @Autowired FileToolService files;
    @Autowired SnapshotStore snapshots;
    @Autowired ModelCallRepository calls;
    @Autowired ModelCallAudit audit;
    @Autowired PlanValidator plans;
    @Autowired FileToolRegistry registry;
    @Autowired BuildGateway gateway;
    @Autowired AgentEvidence evidence;
    final JsonMapper json=JsonMapper.builder().build();
    final HttpClient http=HttpClient.newHttpClient();
    record Login(String cookie,String csrf) {}
    UUID owner,app,base,current,failedVersion;String baseDigest,currentDigest;Login login,other;
    JsonNode baselineSource,baselineSnapshot;
    Path evidenceRoot() {return Path.of(System.getenv().getOrDefault("CODELESS_EDIT_VERIFICATION_EVIDENCE_DIR","target/edit-verification/evidence"));}
    void report(String name,Object value) throws Exception {Files.createDirectories(evidenceRoot());Files.writeString(evidenceRoot().resolve(name+".json"),json.writeValueAsString(value));}
    HttpResponse<String> request(String method,String route,Object body,Login auth,boolean csrf) throws Exception {
        var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v0/"+route));
        if(auth!=null){b.header("Cookie",auth.cookie());if(csrf)b.header("X-CSRF-Token",auth.csrf());}
        if(method.equals("GET"))b.GET();else b.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        return http.send(b.build(),HttpResponse.BodyHandlers.ofString());
    }
    Login login(String email,String password) throws Exception {
        var first=request("GET","auth/csrf",null,null,false);assertThat(first.statusCode()).isEqualTo(200);
        var auth=new Login(first.headers().firstValue("set-cookie").orElseThrow().split(";",2)[0],json.readTree(first.body()).path("token").asText());
        var result=request("POST","auth/login",Map.of("email",email,"password",password),auth,true);assertThat(result.statusCode()).isEqualTo(200);
        return new Login(result.headers().firstValue("set-cookie").orElseThrow().split(";",2)[0],auth.csrf());
    }
    JsonNode get(String route) throws Exception {var r=request("GET",route,null,login,false);assertThat(r.statusCode()).as(r.body()).isEqualTo(200);return json.readTree(r.body());}
    UUID edit() throws Exception {
        var r=request("POST","applications/"+app+"/component-edits",Map.of("baseVersionId",current,"prompt","修改文案和颜色；仅目标源文件",
                "selection",Map.of("componentId","profile-card","versionId",current,"sourceDigest",currentDigest)),login,true);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(202);return UUID.fromString(json.readTree(r.body()).path("task").path("id").asText());
    }
    String restoreRoute(UUID target) {return "applications/"+app+"/versions/"+target+"/restore";}
    HttpResponse<String> restore(UUID target,UUID expected) throws Exception {return request("POST",restoreRoute(target),Map.of("expectedCurrentVersionId",expected),login,true);}
    TaskQueueService.Claim claim(UUID id) {var c=queue.claim().orElseThrow();assertThat(c.taskId()).isEqualTo(id);return c;}
    void run(TaskStageRunner executor,TaskQueueService.Claim c,TaskStatus stage,TaskStatus expected) throws Exception {
        var result=executor.execute(c,stage);
        if(result.next()!=expected)report("unexpected-"+c.taskId(),Map.of("stage",stage,"next",result.next(),"code",Objects.requireNonNullElse(result.failureCode(),"UNKNOWN")));
        assertThat(result.next()).as("%s %s",stage,result.failureCode()).isEqualTo(expected);
        var task=executor.advance(queue,c,result,expected==TaskStatus.FAILED?EventType.TASK_FAILED:expected==TaskStatus.READY?EventType.STAGE_COMPLETED:EventType.STAGE_STARTED);
        assertThat(task.status()).isEqualTo(expected);
    }
    JsonNode draft(UUID task) {return AgentJournal.latest(journal.read(task),"draft");}
    UUID version(JsonNode d) {return UUID.fromString(d.path("versionId").asText());}
    void pointer(UUID expected) {assertThat(apps.find(owner,app).orElseThrow().latestReadyVersionId()).isEqualTo(expected);}
    JsonNode source(UUID version) throws Exception {return get("versions/"+version+"/files/content?path="+TARGET);}
    void retainSource(UUID version,String digest) throws Exception {
        var source=snapshots.source(version,digest);Path root=evidenceRoot().resolve("source").resolve(version.toString());
        for(var f:source.manifest().files()){Path path=root.resolve(f.path());Files.createDirectories(path.getParent());Files.writeString(path,snapshots.readSource(version,digest,f.path()));}
        Files.writeString(root.resolve("manifest.json"),json.writeValueAsString(source.manifest()));
    }
    AgentLoop fixture(String mode) {
        ModelProvider provider=new ModelProvider() {
            public String id(){return "deterministic-mock";}public String model(){return "d14-edit-"+mode+"-fixture";}
            public Reply call(Prompt prompt,int max,java.time.Duration timeout) {
                var input=json.readTree(prompt.getUserMessage().getText());String phase=input.path("phase").asText();Object out;
                if("GENERATE".equals(phase)) {
                    var target=input.path("editContext").path("sourceFiles").get(0);
                    if(input.path("observations").isEmpty()) out=Map.of("type","tool","name","files.update","arguments",Map.of("path",TARGET,
                            "expectedDigest",target.path("digest").asText(),"content",target.path("content").asText().replace("Ada Lovelace","Hedy Lamarr")
                                    +(target.path("content").asText().contains(STYLE)?"":STYLE)+(mode.equals("normal")?"":SYNTAX)));
                    else out=Map.of("type","done","actions",List.of(Map.of("type","navigate","path","/"),Map.of("type","expectText","target",Map.of("testId","profile-name"),"value","Hedy Lamarr")));
                } else {
                    assertThat(phase).isEqualTo("REPAIR");assertThat(input.path("sourceFiles").size()).isEqualTo(1);
                    assertThat(input.path("failure").path("code").asText()).isEqualTo("AGENT_BUILD_EXIT");
                    if(mode.equals("no-progress"))out=input.path("completionProposal");
                    else if(input.path("observations").isEmpty())out=Map.of("type","tool","name","files.read","arguments",Map.of("path",TARGET));
                    else if(input.path("observations").size()==1) {
                        var observed=input.path("observations").get(0);
                        out=Map.of("type","tool","name","files.update","arguments",Map.of("path",TARGET,"expectedDigest",observed.path("afterDigest").asText(),
                                "content",observed.path("content").asText().replace(SYNTAX,"")));
                    } else out=input.path("completionProposal");
                }
                return new Reply(json.writeValueAsString(out),new Evidence(model(),"d14-explicit-fixture","d14-explicit-fixture",new Usage(31,17,48,null)));
            }
        };
        return new AgentLoop(store,new AgentModel(provider,calls,audit,store),plans,registry,files,gateway,evidence,true);
    }
    @BeforeAll void baseline() throws Exception {
        var p=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO().start();assertThat(p.waitFor(300,TimeUnit.SECONDS)).isTrue();assertThat(p.exitValue()).isZero();
        login=login("demo@codeless.local","demo-password-for-test-only");other=login("admin@codeless.local","admin-password-for-test-only");
        owner=jdbc.sql("SELECT id FROM platform_users WHERE email='demo@codeless.local'").query(UUID.class).single();
        app=apps.create(owner,"D14 edit verification",null,"STATIC").id();UUID task=queue.create(owner,app,"生成静态个人展示页",null).id();var c=claim(task);
        run(initial,c,TaskStatus.PLAN,TaskStatus.GENERATE);run(initial,c,TaskStatus.GENERATE,TaskStatus.VERIFY);run(initial,c,TaskStatus.VERIFY,TaskStatus.READY);
        base=current=version(draft(task));baseDigest=currentDigest=draft(task).path("sourceDigest").asText();
        baselineSource=source(base);baselineSnapshot=get("versions/"+base+"/snapshot");retainSource(base,baseDigest);
    }
    @Test @Order(1) void d14T1TextColorOnlyPromotesAfterRealBuildAndBrowser() throws Exception {
        UUID task=edit();var c=claim(task);var executor=fixture("normal");
        run(executor,c,TaskStatus.PLAN,TaskStatus.GENERATE);run(executor,c,TaskStatus.GENERATE,TaskStatus.VERIFY);
        var d=draft(task);UUID next=version(d);assertThat(next).isNotEqualTo(base);pointer(base);
        assertThat(get("versions/"+next).path("status").asText()).isEqualTo("DRAFT");
        assertThat(source(next).path("content").asText()).contains("Hedy Lamarr",STYLE);
        run(executor,c,TaskStatus.VERIFY,TaskStatus.READY);pointer(next);current=next;currentDigest=d.path("sourceDigest").asText();
        assertThat(source(base)).isEqualTo(baselineSource);assertThat(get("versions/"+base+"/snapshot")).isEqualTo(baselineSnapshot);
        var before=snapshots.source(base,baseDigest).manifest();var after=snapshots.source(current,currentDigest).manifest();
        for(var f:before.files())if(!f.path().equals(TARGET))assertThat(after.files().stream().filter(n->n.path().equals(f.path())).findFirst().orElseThrow().digest()).isEqualTo(f.digest());
        retainSource(current,currentDigest);
        report("D14-A-T1",Map.of("taskId",task,"baseVersionId",base,"versionId",current,"before",before,"after",after,"validation",get("versions/"+current+"/snapshot"),"realPostgresDockerChromium",true));
    }
    @Test @Order(2) void d14T2RealSyntaxErrorRepairsWithinOriginalScopeAndAcceptance() throws Exception {
        UUID old=current,task=edit();var c=claim(task);var executor=fixture("repair");
        run(executor,c,TaskStatus.PLAN,TaskStatus.GENERATE);run(executor,c,TaskStatus.GENERATE,TaskStatus.VERIFY);var broken=draft(task);
        run(executor,c,TaskStatus.VERIFY,TaskStatus.REPAIR);pointer(old);
        var failure=AgentJournal.latest(journal.read(task),"repair.failure");assertThat(failure.path("diagnostic").asText()).containsIgnoringCase("error");
        var failed=get("versions/"+version(broken)+"/snapshot");assertThat(failed.path("status").asText()).isEqualTo("FAILED");
        assertThat(failed.path("validation").path("report").path("exitCode").asInt()).isNotZero();
        run(executor,c,TaskStatus.REPAIR,TaskStatus.GENERATE);run(executor,c,TaskStatus.GENERATE,TaskStatus.VERIFY);var fixed=draft(task);
        assertThat(fixed.path("actions")).isEqualTo(broken.path("actions"));assertThat(version(fixed)).isNotEqualTo(version(broken));pointer(old);
        run(executor,c,TaskStatus.VERIFY,TaskStatus.READY);current=version(fixed);currentDigest=fixed.path("sourceDigest").asText();pointer(current);
        assertThat(source(version(broken)).path("content").asText()).contains(SYNTAX);assertThat(source(current).path("content").asText()).doesNotContain(SYNTAX);
        assertThat(queue.find(owner,task).orElseThrow().repairAttempts()).isEqualTo(1);
        retainSource(version(broken),broken.path("sourceDigest").asText());retainSource(current,currentDigest);
        report("D14-A-T2",Map.of("taskId",task,"oldVersionId",old,"failure",failure,"failedSnapshot",failed,"readySnapshot",get("versions/"+current+"/snapshot"),"originalActions",broken.path("actions"),"repairAttempts",1));
    }
    @Test @Order(3) void d14T3UnchangedSyntaxFailureStopsAndKeepsUsablePointerAndDifference() throws Exception {
        UUID old=current,task=edit();var oldSource=source(old);var c=claim(task);var executor=fixture("no-progress");
        run(executor,c,TaskStatus.PLAN,TaskStatus.GENERATE);run(executor,c,TaskStatus.GENERATE,TaskStatus.VERIFY);var first=draft(task);
        run(executor,c,TaskStatus.VERIFY,TaskStatus.REPAIR);pointer(old);
        run(executor,c,TaskStatus.REPAIR,TaskStatus.GENERATE);run(executor,c,TaskStatus.GENERATE,TaskStatus.VERIFY);
        run(executor,c,TaskStatus.VERIFY,TaskStatus.FAILED);pointer(old);failedVersion=version(draft(task));
        var stopped=queue.find(owner,task).orElseThrow();assertThat(stopped.failureCode()).isEqualTo("AGENT_REPAIR_NO_PROGRESS");assertThat(stopped.repairAttempts()).isEqualTo(1);
        assertThat(source(old)).isEqualTo(oldSource);
        for(var d:List.of(first,draft(task))){assertThat(source(version(d)).path("content").asText()).contains(SYNTAX);retainSource(version(d),d.path("sourceDigest").asText());}
        var failed=get("versions/"+failedVersion+"/snapshot");assertThat(failed.path("validation").path("report").path("exitCode").asInt()).isNotZero();
        assertThat(request("POST","applications/"+app+"/versions/"+failedVersion+"/preview-credentials",Map.of(),login,true).statusCode()).isEqualTo(409);
        assertThat(restore(failedVersion,current).statusCode()).isEqualTo(409);
        report("D14-A-T3",Map.of("task",stopped,"latestReadyVersionId",old,"failedSnapshot",failed,"failure",AgentJournal.latest(journal.read(task),"repair.failure"),"editAssociation",get("tasks/"+task+"/edit")));
    }
    @Test @Order(4) void d14T4ExplicitRestoreKeepsHistoricalSourceAndPublicationAndRealPreview() throws Exception {
        UUID newest=current;var newestSource=source(newest);var newestSnapshot=get("versions/"+newest+"/snapshot");
        // Database-only historical publication fixture. No hosting/publishing action is executed.
        UUID publication=UUID.randomUUID();jdbc.sql("INSERT INTO publications(id,application_id,version_id,requested_by,status,url,published_at) VALUES (?,?,?,?,'PUBLISHED','https://history.example.test/frozen',clock_timestamp())").params(publication,app,newest,owner).update();
        var publications=jdbc.sql("SELECT * FROM publications WHERE application_id=? ORDER BY id").param(app).query().listOfRows();
        var response=restore(base,newest);assertThat(response.statusCode()).as(response.body()).isEqualTo(200);pointer(base);
        assertThat(response.headers().firstValue("cache-control")).contains("no-store");
        assertThat(json.readTree(response.body()).path("previousVersionId").asText()).isEqualTo(newest.toString());
        assertThat(source(base)).isEqualTo(baselineSource);assertThat(get("versions/"+base+"/snapshot")).isEqualTo(baselineSnapshot);
        assertThat(source(newest)).isEqualTo(newestSource);assertThat(get("versions/"+newest+"/snapshot")).isEqualTo(newestSnapshot);
        assertThat(jdbc.sql("SELECT * FROM publications WHERE application_id=? ORDER BY id").param(app).query().listOfRows()).isEqualTo(publications);
        current=base;currentDigest=baseDigest;
        var preview=realPreview(newest);UUID next=edit();queue.cancel(owner,next);
        report("D14-A-T4",Map.of("restore",json.readTree(response.body()),"historicalSourceUnchanged",true,"historicalSnapshotsUnchanged",true,"publicationId",publication,"publishedVersionId",newest,"preview",preview,"editAfterRestoreTaskId",next));
    }
    JsonNode realPreview(UUID newest) throws Exception {
        Path root=Path.of("target/edit-verification/preview-"+UUID.randomUUID()).toAbsolutePath();Files.createDirectories(root);Path input=root.resolve("input.json"),log=root.resolve("command.log");
        Files.writeString(input,json.writeValueAsString(Map.of("apiOrigin","http://127.0.0.1:"+port,"app",app,"versions",List.of(base,newest),"cookie",login.cookie(),"csrf",login.csrf(),"tlsPort",TLS,"controlPort",CONTROL,"evidence",root.toString(),"privateRoot",Path.of("target/edit-verification/runtime").toAbsolutePath().toString(),"sourceRoot",Path.of("target/edit-verification/workspaces").toAbsolutePath().toString())));
        var p=new ProcessBuilder("node","../../tests/edit/verification/preview.mjs",input.toString()).redirectErrorStream(true).redirectOutput(log.toFile()).start();
        try {
            assertThat(p.waitFor(90,TimeUnit.SECONDS)).as("Private preview log %s",log).isTrue();assertThat(p.exitValue()).as(Files.readString(log)).isZero();
            var result=json.readTree(Files.readString(root.resolve("preview.json")));Files.createDirectories(evidenceRoot().resolve("screenshots"));
            for(var version:result.path("versions")){String name=version.path("screenshot").path("path").asText();Files.copy(root.resolve(name),evidenceRoot().resolve("screenshots").resolve(name));}
            return result;
        } finally {if(p.isAlive()){p.descendants().forEach(ProcessHandle::destroyForcibly);p.destroyForcibly();}Files.deleteIfExists(input);}
    }
    @Test @Order(5) void restoreRejectsUnauthorizedStaleMalformedActiveAndUnavailableTargets() throws Exception {
        var body=Map.of("expectedCurrentVersionId",current);String route=restoreRoute(base);
        assertThat(request("POST",route,body,null,false).statusCode()).isEqualTo(401);
        assertThat(request("POST",route,body,login,false).statusCode()).isEqualTo(403);
        assertThat(request("POST",route,body,other,true).statusCode()).isEqualTo(404);
        for(Object invalid:List.of(Map.of(),Map.of("expectedCurrentVersionId","1-1-1-1-1"),Map.of("expectedCurrentVersionId",current,"publish",true),Map.of("expectedCurrentVersionId",3)))
            assertThat(request("POST",route,invalid,login,true).statusCode()).isEqualTo(400);
        assertThat(restore(UUID.randomUUID(),current).statusCode()).isEqualTo(404);
        UUID foreignApp=apps.create(owner,"other owned application",null,"STATIC").id();UUID foreign=apps.find(owner,foreignApp).orElseThrow().baseVersionId();
        assertThat(restore(foreign,current).statusCode()).isEqualTo(404);
        UUID shell=apps.find(owner,app).orElseThrow().baseVersionId();assertThat(restore(shell,current).statusCode()).isEqualTo(409);
        var stale=restore(base,failedVersion);assertThat(json.readTree(stale.body()).path("code").asText()).isEqualTo("RESTORE_VERSION_CONFLICT");
        UUID active=edit();var queued=restore(base,current);assertThat(json.readTree(queued.body()).path("code").asText()).isEqualTo("RESTORE_TASK_ACTIVE");
        claim(active);assertThat(restore(base,current).statusCode()).isEqualTo(409);queue.cancel(owner,active);pointer(current);
        Path volume=Path.of("target/edit-verification/versions").toAbsolutePath().normalize();Path source=volume.resolve(base.toString()).resolve("source").resolve(TARGET);
        assertThat(source.normalize().startsWith(volume)).isTrue();byte[] original=Files.readAllBytes(source);
        try {Files.writeString(source,"corrupt");var corrupt=restore(base,current);assertThat(corrupt.statusCode()).isEqualTo(503);assertThat(json.readTree(corrupt.body()).path("code").asText()).isEqualTo("SNAPSHOT_DIGEST_MISMATCH");pointer(current);}
        finally {Files.write(source,original);}
        Path present=volume.resolve(base.toString()),hidden=volume.resolve(".unavailable-"+base);Files.move(present,hidden);
        try {var missing=restore(base,current);assertThat(missing.statusCode()).isEqualTo(409);pointer(current);}finally {Files.move(hidden,present);}
        jdbc.sql("UPDATE applications SET status='ARCHIVED' WHERE id=?").param(app).update();
        try {assertThat(restore(base,current).statusCode()).isEqualTo(409);pointer(current);}finally {jdbc.sql("UPDATE applications SET status='ACTIVE' WHERE id=?").param(app).update();}
        report("restore-boundaries",Map.of("anonymous",401,"csrf",403,"otherOwner",404,"foreignVersion",404,"stale","RESTORE_VERSION_CONFLICT","active","RESTORE_TASK_ACTIVE","corrupt",503,"missing",409,"archived",409));
    }
    @Test @Order(6) void concurrentRestoreWithSameExpectedPointerHasOneWinner() throws Exception {
        var start=new CountDownLatch(1);List<HttpResponse<String>> results=new ArrayList<>();
        UUID target=jdbc.sql("SELECT id FROM application_versions WHERE application_id=? AND status='VERIFIED' AND id<>? ORDER BY number DESC LIMIT 1").params(app,current).query(UUID.class).single();
        try(var pool=Executors.newFixedThreadPool(4)) {
            var futures=new ArrayList<Future<HttpResponse<String>>>();UUID expected=current;
            for(int i=0;i<4;i++)futures.add(pool.submit(()->{start.await();return restore(target,expected);}));start.countDown();
            for(var f:futures)results.add(f.get(30,TimeUnit.SECONDS));
        }
        assertThat(results.stream().filter(r->r.statusCode()==200).count()).isEqualTo(1);
        for(var r:results.stream().filter(r->r.statusCode()!=200).toList()){assertThat(r.statusCode()).isEqualTo(409);assertThat(json.readTree(r.body()).path("code").asText()).isEqualTo("RESTORE_VERSION_CONFLICT");}
        pointer(target);var repeat=restore(target,target);assertThat(repeat.statusCode()).isEqualTo(200);
        report("restore-concurrency",Map.of("statuses",results.stream().map(HttpResponse::statusCode).toList(),"winnerVersionId",target,"sameCurrentNoop",200));
    }
    @Test @Order(7) void runtimeLedgerPreservesUnknownBaselineUsageAndSeparateFixtureAccounting() throws Exception {
        var usage=jdbc.sql("SELECT provider,model,input_tokens,output_tokens FROM model_calls WHERE task_id IN (SELECT id FROM generation_tasks WHERE application_id=?) ORDER BY created_at,id").param(app).query().listOfRows();
        assertThat(usage).isNotEmpty();assertThat(usage.stream().anyMatch(row->row.get("input_tokens")==null && row.get("output_tokens")==null)).isTrue();
        var meters=new ArrayList<Object>();
        for(var task:jdbc.sql("SELECT id FROM generation_tasks WHERE application_id=? ORDER BY created_at,id").param(app).query(UUID.class).list()) {
            var entries=journal.read(task);meters.add(Map.of("taskId",task,"budget",RuntimeBudget.meter(entries),"usage",
                    entries.stream().filter(e->"model.usage".equals(e.path("kind").asText())).map(e->e.path("payload")).toList()));
        }
        report("runtime-usage",Map.of("provider","deterministic-mock","modelQualityClaim",false,"paidRequests",0,"measuredTokens","UNKNOWN","fixtureCountersAreMeasured",false,"calls",usage,"journalMeters",meters));
    }
}
