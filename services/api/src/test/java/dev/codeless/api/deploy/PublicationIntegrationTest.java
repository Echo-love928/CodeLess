package dev.codeless.api.deploy;

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
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "codeless.model.provider=deterministic-mock","CODELESS_DEMO_PASSWORD=demo-password-for-test-only","CODELESS_ADMIN_PASSWORD=admin-password-for-test-only",
    "codeless.agent.enabled=true","codeless.agent.repair.enabled=false","codeless.agent.repository-root=../..",
    "codeless.agent.private-root=target/deploy-integration/runtime","codeless.versions.root=target/deploy-integration/versions",
    "CODELESS_FILE_WORKSPACE_ROOT=target/deploy-integration/workspaces","CODELESS_FILE_AUDIT_ROOT=target/deploy-integration/audit",
    "codeless.deploy.root=target/deploy-integration/records","codeless.deploy.worker-enabled=false"})
@Import(PublicationIntegrationTest.HostingConfiguration.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PublicationIntegrationTest extends PostgresTestBase {
    @TestConfiguration static class HostingConfiguration {
        @Bean @Primary FixtureHosting fixtureHosting() {return new FixtureHosting();}
    }
    /** Only hosting/probe are fixtures. Version generation, PG, Docker build and Chromium remain real. */
    static class FixtureHosting implements DeploymentGateway {
        final Map<UUID,Integer> publishes=new ConcurrentHashMap<>();
        final Map<UUID,Payload> payloads=new ConcurrentHashMap<>();
        volatile String mode="PASS";
        volatile CountDownLatch entered,release;
        public String publish(Payload payload,Instant deadline) {
            publishes.merge(payload.publicationId(),1,Integer::sum);payloads.put(payload.publicationId(),payload);
            if(entered!=null) {
                entered.countDown();
                try {if(!release.await(20,TimeUnit.SECONDS)) throw new IllegalStateException("DEPLOYMENT_TIMEOUT");}
                catch(InterruptedException failure) {Thread.currentThread().interrupt();throw new IllegalStateException(failure);}
            }
            if("UNAVAILABLE".equals(mode)) throw new IllegalStateException("HOSTING_UNAVAILABLE");
            if("PRIVATE_URL".equals(mode)) return "https://127.0.0.1/private";
            return "https://hosting.example.test/publications/"+payload.publicationId();
        }
        public Probe probe(Payload payload,String url,Instant deadline) {
            return switch(mode) {
                case "FAIL" -> new Probe(false,payload.versionId(),payload.artifactDigest());
                case "UNKNOWN" -> new Probe(null,payload.versionId(),payload.artifactDigest());
                case "WRONG_VERSION" -> new Probe(true,UUID.randomUUID(),payload.artifactDigest());
                case "WRONG_DIGEST" -> new Probe(true,payload.versionId(),"sha256:"+"0".repeat(64));
                default -> new Probe(true,payload.versionId(),payload.artifactDigest());
            };
        }
    }
    @Value("${local.server.port}") int port;
    @Autowired JdbcClient jdbc;
    @Autowired ApplicationService applications;
    @Autowired TaskQueueService queue;
    @Autowired TaskStageRunner loop;
    @Autowired AgentJournal journal;
    @Autowired AgentRunStore store;
    @Autowired FileToolService tools;
    @Autowired ArtifactRepository artifacts;
    @Autowired SnapshotStore snapshots;
    @Autowired PublicationService publications;
    @Autowired DeploymentRecords records;
    @Autowired FixtureHosting hosting;
    final JsonMapper json=JsonMapper.builder().build();
    final HttpClient client=HttpClient.newHttpClient();
    UUID owner,app,ready,shell,failed,successful;
    String digest,source;
    Login login,other;
    record Login(String cookie,String csrf) {}
    String base() {return "http://127.0.0.1:"+port+"/api/v0/";}
    HttpResponse<String> get(String route,Login session) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create(base()+route)).GET();
        if(session!=null) builder.header("Cookie",session.cookie());
        return client.send(builder.build(),HttpResponse.BodyHandlers.ofString());
    }
    HttpResponse<String> post(Object body,String key,Login session,boolean csrf) throws Exception {
        var b=HttpRequest.newBuilder(URI.create(base()+"publications")).header("Content-Type","application/json");
        if(session!=null) {b.header("Cookie",session.cookie());if(csrf) b.header("X-CSRF-Token",session.csrf());}
        if(key!=null) b.header("Idempotency-Key",key);
        return client.send(b.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
    }
    Login login(String email,String password) throws Exception {
        var r=get("auth/csrf",null);String token=json.readTree(r.body()).path("token").asText();
        String first=r.headers().firstValue("set-cookie").orElseThrow().split(";",2)[0];
        var logged=client.send(HttpRequest.newBuilder(URI.create(base()+"auth/login")).header("Cookie",first).header("X-CSRF-Token",token)
            .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("email",email,"password",password)))).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(logged.statusCode()).isEqualTo(200);
        return new Login(logged.headers().firstValue("set-cookie").orElseThrow().split(";",2)[0],token);
    }
    Map<String,Object> body(UUID version,String hash) {return Map.of("applicationId",app,"versionId",version,"artifactDigest",hash);}
    String key() {return UUID.randomUUID().toString();}
    UUID request() throws Exception {
        var r=post(body(ready,digest),key(),login,true);assertThat(r.statusCode()).as(r.body()).isEqualTo(202);
        assertThat(r.headers().firstValue("Cache-Control")).contains("no-store");return UUID.fromString(json.readTree(r.body()).path("id").asText());
    }
    void report(String name,Object value) throws Exception {
        Path root=Path.of(System.getenv().getOrDefault("CODELESS_DEPLOY_EVIDENCE_DIR","target/deploy-integration/evidence"));
        Files.createDirectories(root);Files.writeString(root.resolve(name+".json"),json.writeValueAsString(value));
    }
    @BeforeAll void readyFixture() throws Exception {
        var runtime=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO().start();
        assertThat(runtime.waitFor(300,TimeUnit.SECONDS)).isTrue();assertThat(runtime.exitValue()).isZero();
        login=login("demo@codeless.local","demo-password-for-test-only");other=login("admin@codeless.local","admin-password-for-test-only");
        owner=jdbc.sql("SELECT id FROM platform_users WHERE email='demo@codeless.local'").query(UUID.class).single();
        var application=applications.create(owner,"D15 immutable publishing",null,"STATIC");app=application.id();shell=application.baseVersionId();
        UUID task=queue.create(owner,app,"生成静态个人展示页，展示 Ada Lovelace 与作品",null).id();
        var claim=queue.claim().orElseThrow();assertThat(claim.taskId()).isEqualTo(task);
        for(var stage:List.of(TaskStatus.PLAN,TaskStatus.GENERATE,TaskStatus.VERIFY)) {
            var r=loop.execute(claim,stage);
            if(r.next()==TaskStatus.FAILED) report("prerequisite-failed",Map.of("stage",stage,"failureCode",Objects.toString(r.failureCode(),"UNKNOWN"),"runnerResult",AgentJournal.latest(journal.read(task),"runner.result")));
            assertThat(r.next()).as("real prerequisite %s: %s",stage,r.failureCode()).isNotEqualTo(TaskStatus.FAILED);
            loop.advance(queue,claim,r,r.next()==TaskStatus.READY?EventType.STAGE_COMPLETED:EventType.STAGE_STARTED);
        }
        assertThat(queue.find(owner,task).orElseThrow().status()).isEqualTo(TaskStatus.READY);
        ready=applications.find(owner,app).orElseThrow().latestReadyVersionId();source=artifacts.findVersion(ready).orElseThrow().sourceDigest();
        var outcome=snapshots.outcome(ready,source,"VERIFIED");digest=outcome.artifactDigest();
        failed=UUID.randomUUID();artifacts.createDraftVersion(failed,app,100,source);
        jdbc.sql("UPDATE application_versions SET status='FAILED' WHERE id=?").param(failed).update();
        report("prerequisite",Map.of("versionId",ready,"sourceDigest",source,"validation",outcome,"realPostgresDockerChromium",true,"modelProvider","deterministic-mock","hostingProvider","explicit-fixture-not-public-hosting"));
    }
    @BeforeEach void reset() {hosting.mode="PASS";hosting.entered=null;hosting.release=null;}
    @Test @Order(1) void d15aT1RejectsDraftFailureUnauthorizedAndWrongArtifact() throws Exception {
        var results=new LinkedHashMap<String,Integer>();
        for(UUID version:List.of(shell,failed)) {var r=post(body(version,digest),key(),login,true);assertThat(r.statusCode()).isEqualTo(409);results.put(version.equals(shell)?"DRAFT":"FAILED",r.statusCode());}
        for(var test:List.of(Map.entry("ANONYMOUS",401),Map.entry("OTHER_OWNER",404),Map.entry("CSRF",403),Map.entry("WRONG_DIGEST",409))) {
            var r=post(body(ready,test.getKey().equals("WRONG_DIGEST")?"sha256:"+"0".repeat(64):digest),key(),test.getKey().equals("ANONYMOUS")?null:test.getKey().equals("OTHER_OWNER")?other:login,!test.getKey().equals("CSRF"));
            assertThat(r.statusCode()).as(test.getKey()+r.body()).isEqualTo(test.getValue());results.put(test.getKey(),r.statusCode());
        }
        assertThat(jdbc.sql("SELECT count(*) FROM publications WHERE application_id=?").param(app).query(Integer.class).single()).isZero();
        report("D15-A-T1",Map.of("responses",results,"publicationCount",0,"failedVersionFixture","SQL FAILED; real READY prerequisite"));
    }
    @Test @Order(2) void d15aT2ConcurrentDraftEditingDoesNotChangePayload() throws Exception {
        UUID id=request();var before=snapshots.outcome(ready,source,"VERIFIED");
        hosting.entered=new CountDownLatch(1);hosting.release=new CountDownLatch(1);
        try(var pool=Executors.newSingleThreadExecutor()) {
            var work=pool.submit(()->publications.process(id));
            try {
                assertThat(hosting.entered.await(10,TimeUnit.SECONDS)).isTrue();
                UUID task=queue.create(owner,app,"并发编辑新草稿",null).id();var claim=queue.claim().orElseThrow();assertThat(claim.taskId()).isEqualTo(task);
                queue.advance(claim,TaskStatus.GENERATE,EventType.STAGE_STARTED,"Draft fixture",null);
                var created=tools.execute(task,claim.token(),"files.create",json.writeValueAsString(Map.of("path","src/pages/HomePage.vue","content","<template>concurrent new draft</template>")));
                assertThat(created.status()).isEqualTo("SUCCEEDED");var draft=store.draft(claim,tools.snapshot(task,claim.token()),json.createArrayNode());
                var draftId=UUID.fromString(draft.path("versionId").asText());var manifest=snapshots.source(draftId,draft.path("sourceDigest").asText()).manifest();
                var changed=tools.execute(task,claim.token(),"files.update",json.writeValueAsString(Map.of("path","src/pages/HomePage.vue","content","<template>changed again</template>","expectedDigest",manifest.files().getFirst().digest())));
                assertThat(changed.status()).isEqualTo("SUCCEEDED");
                var modelDeploy=tools.execute(task,claim.token(),"deploy.publish","{}");assertThat(modelDeploy.status()).isEqualTo("FAILED");
                assertThat(modelDeploy.errorCode()).isEqualTo("FILE_TOOL_UNKNOWN");
                queue.advance(claim,TaskStatus.VERIFY,EventType.STAGE_STARTED,"Unavailable fixture",null);
                store.failedBuild(claim,draft,json.readTree("{\"status\":\"FAILED\",\"build\":null,\"verification\":null}"));
                queue.advance(claim,TaskStatus.FAILED,EventType.TASK_FAILED,"Unavailable fixture","RUNNER_UNAVAILABLE");
            } finally {hosting.release.countDown();}
            work.get(30,TimeUnit.SECONDS);
        }
        assertThat(snapshots.outcome(ready,source,"VERIFIED")).isEqualTo(before);
        var payload=hosting.payloads.get(id);assertThat(payload.versionId()).isEqualTo(ready);assertThat(payload.artifactDigest()).isEqualTo(digest);
        for(var asset:payload.assets()) assertThat(asset.bytes()).isEqualTo(snapshots.readArtifact(ready,source,asset.path()));
        var deployment=publications.deployment(owner,id);assertThat(deployment.phase()).isEqualTo("SUCCEEDED");successful=id;
        report("D15-A-T2",Map.of("deployment",deployment,"concurrentDraftChanged",true,"frozenPayloadUnchanged",true,"modelDeployTool","FAILED / FILE_TOOL_UNKNOWN","hostingProvider","explicit-fixture-not-public-hosting"));
    }
    @Test @Order(3) void d15aT3ConcurrentClicksAndReplayCreateOneLogicalPublication() throws Exception {
        String key=key();var ids=new HashSet<UUID>();
        try(var pool=Executors.newFixedThreadPool(6)) {
            var futures=new ArrayList<Future<HttpResponse<String>>>();
            for(int i=0;i<6;i++) futures.add(pool.submit(()->post(body(ready,digest),key,login,true)));
            for(var future:futures) {var r=future.get(20,TimeUnit.SECONDS);assertThat(r.statusCode()).as(r.body()).isEqualTo(202);ids.add(UUID.fromString(json.readTree(r.body()).path("id").asText()));}
        }
        assertThat(ids).hasSize(1);UUID id=ids.iterator().next();
        try(var pool=Executors.newFixedThreadPool(4)) {
            var work=new ArrayList<Future<?>>();for(int i=0;i<4;i++) work.add(pool.submit(()->publications.process(id)));for(var f:work) f.get(30,TimeUnit.SECONDS);
        }
        assertThat(hosting.publishes.get(id)).isEqualTo(1);
        var replay=post(body(ready,digest),key,login,true);assertThat(replay.statusCode()).isEqualTo(202);assertThat(json.readTree(replay.body()).path("id").asText()).isEqualTo(id.toString());
        assertThat(post(body(ready,"sha256:"+"0".repeat(64)),key,login,true).statusCode()).isEqualTo(409);
        assertThat(post(body(shell,digest),key,login,true).statusCode()).isEqualTo(409);
        var restarted=new DeploymentRecords(Path.of("target/deploy-integration/records"));assertThat(restarted.binding(id)).isEqualTo(records.binding(id));assertThat(restarted.events(id)).isEqualTo(records.events(id));
        successful=id;report("D15-A-T3",Map.of("clicks",6,"workers",4,"logicalIds",ids,"hostingCalls",1,"replay",json.readTree(replay.body()),"restartLedgerEqual",true));
    }
    @Test @Order(4) void d15aT4FailedOrUnknownProbesPreserveLastSuccess() throws Exception {
        var previous=artifacts.findPublication(successful).orElseThrow();var failedCases=new ArrayList<Object>();
        for(String mode:List.of("FAIL","UNKNOWN","WRONG_VERSION","WRONG_DIGEST","UNAVAILABLE","PRIVATE_URL")) {
            hosting.mode=mode;UUID id=request();publications.process(id);publications.process(id);
            var d=publications.deployment(owner,id);assertThat(d.phase()).isEqualTo("FAILED");assertThat(d.publication().url()).isNull();
            assertThat(d.latestSuccessful().id()).isEqualTo(successful);assertThat(d.latestSuccessful().url()).isEqualTo(previous.url());
            assertThat(artifacts.findPublication(successful).orElseThrow()).isEqualTo(previous);assertThat(hosting.publishes.get(id)).isEqualTo(1);
            failedCases.add(Map.of("fixtureMode",mode,"deployment",d));
        }
        var panel=get("applications/"+app+"/publications",login);assertThat(panel.statusCode()).isEqualTo(200);
        assertThat(json.readTree(panel.body()).path("latestSuccessful").path("id").asText()).isEqualTo(successful.toString());
        report("D15-A-T4",Map.of("failedCases",failedCases,"lastSuccessfulUnchanged",true,"panel",json.readTree(panel.body()),"realPublicHosting",false));
    }
    @Test @Order(5) void boundaryReadsStrictInputAndInterruptedWorkerAreFailClosed() throws Exception {
        UUID id=request();
        for(String route:List.of("publications/"+id,"publications/"+id+"/deployment","applications/"+app+"/publications")) {
            assertThat(get(route,null).statusCode()).isEqualTo(401);assertThat(get(route,other).statusCode()).isEqualTo(404);
        }
        assertThat(post(body(ready,digest),null,login,true).statusCode()).isEqualTo(400);
        assertThat(post(body(ready,digest),"../escape",login,true).statusCode()).isEqualTo(400);
        var extra=new HashMap<>(body(ready,digest));extra.put("url","https://127.0.0.1");assertThat(post(extra,key(),login,true).statusCode()).isEqualTo(400);
        extra.remove("url");extra.put("publish",true);assertThat(post(extra,key(),login,true).statusCode()).isEqualTo(400);
        records.append(id,"PUBLISHING",null);publications.process(id);
        var interrupted=publications.deployment(owner,id);assertThat(interrupted.failureCode()).isEqualTo("DEPLOYMENT_INTERRUPTED");assertThat(hosting.publishes).doesNotContainKey(id);
        report("boundaries",Map.of("interrupted",interrupted,"unauthorizedRead",404,"anonymousRead",401,"strictInput",400,"republishedAfterInterruption",false));
    }
    @Test @Order(6) void artifactTamperingAfterRequestPreventsHosting() throws Exception {
        UUID id=request();var o=snapshots.outcome(ready,source,"VERIFIED");String path=o.artifact().files().getFirst().path();
        Path artifact=Path.of("target/deploy-integration/versions",ready.toString(),"outcome","artifact").resolve(path);byte[] original=Files.readAllBytes(artifact);
        try {
            Files.writeString(artifact,"tampered");publications.process(id);
            assertThat(hosting.publishes).doesNotContainKey(id);var d=publications.deployment(owner,id);
            assertThat(d.failureCode()).isEqualTo("DEPLOYMENT_SNAPSHOT_INVALID");assertThat(d.latestSuccessful().id()).isEqualTo(successful);
            assertThat(post(body(ready,digest),key(),login,true).statusCode()).isEqualTo(503);
            report("tampering",Map.of("deployment",d,"hostingCalls",0,"newRequest",503));
        } finally {Files.write(artifact,original);}
        assertThat(snapshots.outcome(ready,source,"VERIFIED")).isEqualTo(o);
    }
}
