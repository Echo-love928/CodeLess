package dev.codeless.api.versions;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.agent.*;
import dev.codeless.api.apps.ApplicationService;
import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
        "codeless.model.provider=deterministic-mock",
        "CODELESS_DEMO_PASSWORD=demo-password-for-test-only","CODELESS_ADMIN_PASSWORD=admin-password-for-test-only",
        "codeless.agent.enabled=true","codeless.agent.repair.enabled=false","codeless.agent.repository-root=../..",
        "codeless.agent.private-root=target/agent-integration/runtime", "codeless.versions.root=target/version-integration/volume",
        "CODELESS_FILE_WORKSPACE_ROOT=target/version-integration/workspaces","CODELESS_FILE_AUDIT_ROOT=target/version-integration/audit"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class VersionHttpIntegrationTest extends PostgresTestBase {
    @Value("${local.server.port}") int port;
    @Autowired JdbcClient jdbc;
    @Autowired ApplicationService applications;
    @Autowired TaskQueueService queue;
    @Autowired TaskStageRunner loop;
    @Autowired AgentRunStore store;
    @Autowired AgentJournal journal;
    @Autowired FileToolService tools;
    @Autowired SnapshotStore snapshots;
    @Autowired ArtifactRepository artifacts;
    final JsonMapper json=JsonMapper.builder().build();
    final HttpClient client=HttpClient.newHttpClient();
    static UUID owner,app,ready,failed,shell;
    static String cookie,otherCookie,csrf;
    record Login(String cookie,String csrf) {}
    String base() {return "http://127.0.0.1:"+port+"/api/v0/";}
    HttpResponse<String> get(String route,String session) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create(base()+route)).GET();
        if(session!=null) builder.header("Cookie",session);
        return client.send(builder.build(),HttpResponse.BodyHandlers.ofString());
    }
    Login login(String email,String password) throws Exception {
        var response=get("auth/csrf",null);assertThat(response.statusCode()).isEqualTo(200);
        String token=json.readTree(response.body()).path("token").asText();
        String first=response.headers().firstValue("set-cookie").orElseThrow().split(";",2)[0];
        var logged=client.send(HttpRequest.newBuilder(URI.create(base()+"auth/login")).header("Cookie",first)
                .header("X-CSRF-Token",token).header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("email",email,"password",password)))).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(logged.statusCode()).isEqualTo(200);
        return new Login(logged.headers().firstValue("set-cookie").orElseThrow().split(";",2)[0],token);
    }
    void report(String name,Object value) throws Exception {
        Path directory=Path.of(System.getenv().getOrDefault("CODELESS_VERSION_EVIDENCE_DIR","target/version-integration/evidence"));
        Files.createDirectories(directory);Files.writeString(directory.resolve(name+".json"),json.writeValueAsString(value));
    }
    @BeforeAll static void runtime() throws Exception {
        Process process=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO().start();
        assertThat(process.waitFor(300,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(process.exitValue()).isZero();
    }
    @Test @Order(1) void d11aT1NewDraftMutationDoesNotChangeVerifiedSourceOrArtifact() throws Exception {
        var login=login("demo@codeless.local","demo-password-for-test-only");cookie=login.cookie();csrf=login.csrf();
        otherCookie=login("admin@codeless.local","admin-password-for-test-only").cookie();
        owner=jdbc.sql("SELECT id FROM platform_users WHERE email='demo@codeless.local'").query(UUID.class).single();
        var application=applications.create(owner,"Versions acceptance",null,"STATIC");app=application.id();shell=application.baseVersionId();
        UUID task=queue.create(owner,app,"生成静态个人展示页，展示 Ada Lovelace 与作品",null).id();
        var originalClaim=queue.claim().orElseThrow();assertThat(originalClaim.taskId()).isEqualTo(task);
        for(TaskStatus stage:List.of(TaskStatus.PLAN,TaskStatus.GENERATE,TaskStatus.VERIFY)) {
            var result=loop.execute(originalClaim,stage);
            assertThat(result.next()).as(result.failureCode()).isNotEqualTo(TaskStatus.FAILED);
            loop.advance(queue,originalClaim,result,result.next()==TaskStatus.READY?EventType.STAGE_COMPLETED:EventType.STAGE_STARTED);
        }
        var taskView=queue.find(owner,task).orElseThrow();assertThat(taskView.status()).as(taskView.failureCode()).isEqualTo(TaskStatus.READY);
        var draft=AgentJournal.latest(journal.read(task),"draft");ready=UUID.fromString(draft.path("versionId").asText());
        var old=get("versions/"+ready+"/files/content?path=src/pages/HomePage.vue",cookie);
        assertThat(old.statusCode()).isEqualTo(200);var oldBytes=json.readTree(old.body());
        var before=snapshots.outcome(ready,draft.path("sourceDigest").asText(),"VERIFIED");
        UUID newTask=queue.create(owner,app,"生成一个新的 Vue 草稿",null).id();var claim=queue.claim().orElseThrow();assertThat(claim.taskId()).isEqualTo(newTask);
        queue.advance(claim,TaskStatus.GENERATE,EventType.STAGE_STARTED,"Test draft",null);
        var created=tools.execute(newTask,claim.token(),"files.create",json.writeValueAsString(Map.of("path","src/pages/HomePage.vue","content","<template>new draft</template>")));
        assertThat(created.status()).isEqualTo("SUCCEEDED");
        var newDraft=store.draft(claim,tools.snapshot(newTask,claim.token()),json.createArrayNode());failed=UUID.fromString(newDraft.path("versionId").asText());
        var manifest=snapshots.source(failed,newDraft.path("sourceDigest").asText()).manifest();
        var updated=tools.execute(newTask,claim.token(),"files.update",json.writeValueAsString(Map.of("path","src/pages/HomePage.vue","content","<template>later draft mutation</template>","expectedDigest",manifest.files().getFirst().digest())));
        assertThat(updated.status()).isEqualTo("SUCCEEDED");
        assertThat(snapshots.readSource(failed,newDraft.path("sourceDigest").asText(),"src/pages/HomePage.vue")).isEqualTo("<template>new draft</template>");
        assertThat(json.readTree(get("versions/"+ready+"/files/content?path=src/pages/HomePage.vue",cookie).body())).isEqualTo(oldBytes);
        assertThat(snapshots.outcome(ready,draft.path("sourceDigest").asText(),"VERIFIED")).isEqualTo(before);
        queue.advance(claim,TaskStatus.VERIFY,EventType.STAGE_STARTED,"Fixture failure",null);
        // Explicit unavailable-worker fixture: unknown build result remains null. Real success above used Docker and Chromium.
        store.failedBuild(claim,newDraft,json.readTree("{\"status\":\"FAILED\",\"build\":null,\"verification\":null}"));
        queue.advance(claim,TaskStatus.FAILED,EventType.TASK_FAILED,"Fixture unavailable","RUNNER_UNAVAILABLE");
        assertThat(applications.find(owner,app).orElseThrow().latestReadyVersionId()).isEqualTo(ready);
        report("D11-A-T1",Map.of("taskId",task,"readyVersionId",ready,"newVersionId",failed,"sourceBeforeAfter",oldBytes,
                "validation",before,"realBuildAndBrowser",true,"newFailureProvider","explicit-unavailable-worker-fixture"));
    }
    @Test @Order(2) void d11aT2FailedAndDraftVersionsCannotBecomePublicationSources() throws Exception {
        for(UUID id:List.of(failed,shell)) {
            assertThatThrownBy(()->artifacts.requestPublication(UUID.randomUUID(),app,id,owner)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            var preview=client.send(HttpRequest.newBuilder(URI.create(base()+"applications/"+app+"/versions/"+id+"/preview-credentials"))
                    .header("Cookie",cookie).header("X-CSRF-Token",csrf).POST(HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString());
            assertThat(preview.statusCode()).isEqualTo(409);
        }
        assertThat(artifacts.requestPublication(UUID.randomUUID(),app,ready,owner).versionId()).isEqualTo(ready);
        var snapshot=get("versions/"+failed+"/snapshot",cookie);assertThat(snapshot.statusCode()).isEqualTo(200);
        var result=json.readTree(snapshot.body());assertThat(result.path("validation").path("report").path("exitCode").isNull()).isTrue();
        report("D11-A-T2",Map.of("failedVersionId",failed,"draftVersionId",shell,"rejectedPublicationSources",2,
                "previewStatus",409,"failedSnapshot",result,"latestReadyVersionId",applications.find(owner,app).orElseThrow().latestReadyVersionId()));
    }
    @Test @Order(3) void d11aT3VersionReadHashesMatchManifestAndRealPreviewBinding() throws Exception {
        var manifests=new ArrayList<JsonNode>();
        for(UUID id:List.of(ready,failed)) {
            var response=get("versions/"+id+"/files",cookie);assertThat(response.statusCode()).isEqualTo(200);var manifest=json.readTree(response.body());
            assertThat(LocalVolumeSnapshotStore.hash(json.writeValueAsBytes(manifest.path("files")))).isEqualTo(manifest.path("sourceDigest").asText());
            for(var file:manifest.path("files")) {
                var read=get("versions/"+id+"/files/content?path="+file.path("path").asText(),cookie);assertThat(read.statusCode()).isEqualTo(200);
                var content=json.readTree(read.body());byte[] bytes=content.path("content").asText().getBytes(StandardCharsets.UTF_8);
                assertThat(LocalVolumeSnapshotStore.hash(bytes)).isEqualTo(file.path("digest").asText());assertThat(bytes.length).isEqualTo(file.path("bytes").asInt());
                assertThat(content.path("versionId").asText()).isEqualTo(id.toString());assertThat(content.path("sourceDigest")).isEqualTo(manifest.path("sourceDigest"));
                assertThat(read.headers().firstValue("content-type").orElseThrow()).contains("application/json");
                assertThat(read.headers().firstValue("cache-control").orElseThrow()).isEqualTo("no-store");
            }
            manifests.add(manifest);
        }
        var list=get("applications/"+app+"/versions",cookie);assertThat(list.statusCode()).isEqualTo(200);var page=json.readTree(list.body());
        assertThat(page.path("total").asInt()).isEqualTo(3);assertThat(page.path("latestReadyVersionId").asText()).isEqualTo(ready.toString());
        for(String status:List.of("DRAFT","FAILED","VERIFIED")) {
            var filtered=json.readTree(get("applications/"+app+"/versions?status="+status,cookie).body());
            assertThat(filtered.path("total").asInt()).isEqualTo(1);assertThat(filtered.path("items").get(0).path("status").asText()).isEqualTo(status);
        }
        report("D11-A-T3",Map.of("manifests",manifests,"page",page));
    }
    @Test @Order(4) void d11aT4UnauthorizedUsersCannotReadSourceSnapshotOrMetadata() throws Exception {
        var evidence=new LinkedHashMap<String,Object>();
        for(String path:List.of("versions/"+ready,"versions/"+ready+"/files","versions/"+ready+"/files/content?path=src/pages/HomePage.vue",
                "versions/"+ready+"/snapshot","applications/"+app+"/versions")) {
            var anonymous=get(path,null);var other=get(path,otherCookie);assertThat(anonymous.statusCode()).isEqualTo(401);assertThat(other.statusCode()).isEqualTo(404);
            assertThat(other.body()).doesNotContain("Ada Lovelace","sourceDigest","reportDigest");
            evidence.put(path,Map.of("anonymous",anonymous.statusCode(),"otherOwner",other.statusCode()));
        }
        report("D11-A-T4",evidence);
    }
    @Test @Order(5) void emptyListsInvalidPathsMissingSnapshotsAndReadonlyMethodsAreExplicit() throws Exception {
        UUID empty=UUID.randomUUID();jdbc.sql("INSERT INTO applications(id,owner_id,name,data_mode) VALUES (?,?,?,'STATIC')").params(empty,owner,"Empty").update();
        var list=get("applications/"+empty+"/versions",cookie);assertThat(list.statusCode()).isEqualTo(200);assertThat(json.readTree(list.body()).path("items").isEmpty()).isTrue();
        assertThat(get("versions/"+shell+"/files",cookie).statusCode()).isEqualTo(409);
        for(String path:List.of("../secret","C:/secret","src/pages/NUL.vue")) {
            String encoded=URLEncoder.encode(path,StandardCharsets.UTF_8);
            assertThat(get("versions/"+ready+"/files/content?path="+encoded,cookie).statusCode()).isEqualTo(400);
        }
        assertThat(get("applications/"+app+"/versions?status=READY",cookie).statusCode()).isEqualTo(400);
        assertThat(get("applications/"+app+"/versions?size=101",cookie).statusCode()).isEqualTo(400);
        assertThat(get("versions/"+ready+"/files/content?path=src/pages/Missing.vue",cookie).statusCode()).isEqualTo(404);
        var write=client.send(HttpRequest.newBuilder(URI.create(base()+"versions/"+ready+"/files/content?path=src/pages/HomePage.vue"))
                .header("Cookie",cookie).header("X-CSRF-Token",csrf).PUT(HttpRequest.BodyPublishers.ofString("overwrite")).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(write.statusCode()).isEqualTo(405);
        report("boundaries",Map.of("emptyList",json.readTree(list.body()),"shellSnapshot",409,"invalidPath",400,"writeMethod",write.statusCode()));
    }
}
