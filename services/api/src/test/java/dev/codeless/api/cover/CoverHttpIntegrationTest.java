package dev.codeless.api.cover;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.agent.*;
import dev.codeless.api.apps.ApplicationService;
import dev.codeless.api.data.ArtifactRepository;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.deploy.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.FileToolService;
import dev.codeless.api.versions.SnapshotStore;
import java.awt.image.BufferedImage;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "codeless.model.provider=deterministic-mock","CODELESS_DEMO_PASSWORD=demo-password-for-test-only","CODELESS_ADMIN_PASSWORD=admin-password-for-test-only",
    "codeless.agent.enabled=true","codeless.agent.repair.enabled=false","codeless.agent.repository-root=../..",
    "codeless.agent.private-root=target/cover-integration/runtime","codeless.versions.root=target/cover-integration/versions",
    "CODELESS_FILE_WORKSPACE_ROOT=target/cover-integration/workspaces","CODELESS_FILE_AUDIT_ROOT=target/cover-integration/audit",
    "codeless.deploy.root=target/cover-integration/records","codeless.deploy.worker-enabled=false",
    "codeless.deploy.public-origin=https://sites.codeless-public.test","codeless.cover.enabled=true","codeless.cover.worker-enabled=false",
    "codeless.cover.root=target/cover-integration/covers"})
@Import(CoverHttpIntegrationTest.Hosting.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@ActiveProfiles("test")
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class CoverHttpIntegrationTest {
    static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("cover_test").withUsername("codeless_test").withPassword("local-test-only");
    static {DB.start();}
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("CODELESS_DATABASE_URL",()->"jdbc:postgresql://127.0.0.1:1/must_not_connect");r.add("spring.datasource.url",DB::getJdbcUrl);
        r.add("spring.datasource.username",DB::getUsername);r.add("spring.datasource.password",DB::getPassword);
    }
    @TestConfiguration static class Hosting {
        @Bean @Primary DeploymentGateway fixtureHosting() {return new DeploymentGateway() {
            public String publish(Payload p,Instant d) {return "https://d"+p.publicationId().toString().replace("-","")+".sites.codeless-public.test/";}
            public Probe probe(Payload p,String u,Instant d) {return new Probe(true,p.versionId(),p.artifactDigest());}
        };}
    }
    @Value("${local.server.port}") int port;
    @Autowired JdbcClient jdbc;@Autowired ApplicationService apps;@Autowired TaskQueueService queue;@Autowired TaskStageRunner loop;
    @Autowired AgentJournal journal;@Autowired AgentRunStore runStore;@Autowired FileToolService files;
    @Autowired SnapshotStore snapshots;@Autowired ArtifactRepository artifacts;@Autowired PublicationService publications;@Autowired CoverService covers;
    final HttpClient client=HttpClient.newHttpClient();UUID owner,app,version,publication;String source,artifact,imageDigest,record;byte[] image;
    Login login,admin,other;final Path coverRoot=Path.of("target/cover-integration/covers/queue");
    record Login(String cookie,String csrf) {}
    String url(String path) {return "http://127.0.0.1:"+port+"/api/v0/"+path;}
    HttpResponse<byte[]> get(String path,Login session) throws Exception {
        var b=HttpRequest.newBuilder(URI.create(url(path))).GET();if(session!=null) b.header("Cookie",session.cookie());
        return client.send(b.build(),HttpResponse.BodyHandlers.ofByteArray());
    }
    Login login(String email,String password) throws Exception {
        var csrf=get("auth/csrf",null);var token=CoverStore.JSON.readTree(csrf.body()).path("token").asText();
        var initial=csrf.headers().firstValue("set-cookie").orElseThrow().split(";",2)[0];
        var response=client.send(HttpRequest.newBuilder(URI.create(url("auth/login"))).header("Cookie",initial).header("X-CSRF-Token",token)
                .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofByteArray(CoverStore.JSON.writeValueAsBytes(Map.of("email",email,"password",password)))).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);return new Login(response.headers().firstValue("set-cookie").orElseThrow().split(";",2)[0],token);
    }
    void stage(TaskQueueService.Claim claim,TaskStatus from,TaskStatus to) {
        var result=loop.execute(claim,from);assertThat(result.next()).as("%s %s",from,result.failureCode()).isEqualTo(to);
        loop.advance(queue,claim,result,to==TaskStatus.READY?EventType.STAGE_COMPLETED:to==TaskStatus.FAILED?EventType.TASK_FAILED:EventType.STAGE_STARTED);
    }
    String route() {return "publications/"+publication+"/cover";}
    Path job() {return coverRoot.resolve(publication+"/job.json");}
    @BeforeAll void prepare() throws Exception {
        var nativeRuntime=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO().start();
        assertThat(nativeRuntime.waitFor(300,TimeUnit.SECONDS)).isTrue();assertThat(nativeRuntime.exitValue()).isZero();
        login=login("demo@codeless.local","demo-password-for-test-only");admin=login("admin@codeless.local","admin-password-for-test-only");
        owner=jdbc.sql("SELECT id FROM platform_users WHERE email='demo@codeless.local'").query(UUID.class).single();
        var second=UUID.randomUUID();jdbc.sql("INSERT INTO platform_users(id,email,display_name,status) VALUES(?,'cover-other@codeless.local','Other','ACTIVE')").param(second).update();
        jdbc.sql("INSERT INTO auth_credentials(user_id,password_hash,role) SELECT ?,password_hash,'USER' FROM auth_credentials WHERE user_id=?").params(second,owner).update();
        other=login("cover-other@codeless.local","demo-password-for-test-only");
        app=apps.create(owner,"Cover controlled fixture",null,"STATIC").id();var task=queue.create(owner,app,"生成静态个人展示页，展示 Ada Lovelace 与作品",null).id();
        var claim=queue.claim().orElseThrow();assertThat(claim.taskId()).isEqualTo(task);
        stage(claim,TaskStatus.PLAN,TaskStatus.GENERATE);stage(claim,TaskStatus.GENERATE,TaskStatus.VERIFY);stage(claim,TaskStatus.VERIFY,TaskStatus.READY);
        version=apps.find(owner,app).orElseThrow().latestReadyVersionId();source=artifacts.findVersion(version).orElseThrow().sourceDigest();artifact=snapshots.outcome(version,source,"VERIFIED").artifactDigest();
        publication=publications.request(owner,app,version,artifact,UUID.randomUUID().toString()).id();publications.process(publication);
        assertThat(covers.binding(owner,publication).entryPath()).isEqualTo("/");
        Files.createDirectory(coverRoot.resolve(publication.toString()));var png=coverRoot.resolve(publication+"/cover.png");
        // PNG fixture tests HTTP bytes/ownership only; native capture and real public TLS are separate tests.
        ImageIO.write(new BufferedImage(1280,720,BufferedImage.TYPE_INT_RGB),"png",png.toFile());image=Files.readAllBytes(png);
        imageDigest="sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(image));
        var n=CoverStore.JSON.valueToTree(new CoverStore.View(publication,app,version,source,artifact,"/","SUCCEEDED",1,null,imageDigest,(long)image.length));
        record=n.toString();Files.writeString(job(),record);
    }
    @AfterEach void restoreFixture() throws Exception {Files.writeString(job(),record);Files.write(coverRoot.resolve(publication+"/cover.png"),image);}
    @Test @Order(1) void ownerGetsCheckedMetadataAndPngAnonymousAndForeignUsersCannotRead() throws Exception {
        var before=Files.readAllBytes(job());var response=get(route(),login);assertThat(response.statusCode()).as(new String(response.body())).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        var n=CoverStore.JSON.readTree(response.body());assertThat(n.get("failureCode").isNull()).isTrue();assertThat(n.path("entryPath").asText()).isEqualTo("/");
        var png=get(route()+"/image?digest="+imageDigest,login);assertThat(png.statusCode()).isEqualTo(200);assertThat(png.body()).isEqualTo(image);
        assertThat(png.headers().firstValue("Content-Type")).contains("image/png");
        for(var path:List.of(route(),route()+"/image?digest="+imageDigest)) {
            assertThat(get(path,null).statusCode()).isEqualTo(401);assertThat(get(path,other).statusCode()).isEqualTo(404);assertThat(get(path,admin).statusCode()).isEqualTo(404);
        }
        assertThat(Files.readAllBytes(job())).isEqualTo(before);
    }
    @Test @Order(2) void missingAndWrongDigestNeverCreateOrRecapture() throws Exception {
        assertThat(get(route()+"/image",login).statusCode()).isEqualTo(404);
        assertThat(get(route()+"/image?digest=sha256:"+"0".repeat(64),login).statusCode()).isEqualTo(404);
        Files.delete(job());assertThat(get(route(),login).statusCode()).isEqualTo(404);assertThat(Files.exists(job())).isFalse();
    }
    @Test @Order(3) void corruptAndMismatchedRecordsAndImagesAreNotReturned() throws Exception {
        Files.writeString(job(),record+" {}");assertThat(get(route(),login).statusCode()).isEqualTo(503);
        Files.writeString(job(),record.replace(version.toString(),UUID.randomUUID().toString()));assertThat(get(route(),login).statusCode()).isEqualTo(404);
        Files.writeString(job(),record);Files.write(coverRoot.resolve(publication+"/cover.png"),new byte[24]);
        assertThat(get(route(),login).statusCode()).isEqualTo(503);assertThat(get(route()+"/image?digest="+imageDigest,login).statusCode()).isEqualTo(503);
    }
    @Test @Order(4) void controlledFailedEditPreservesLatestReadyPublicationAndExistingCover() throws Exception {
        // Explicit controlled fault, not an observed natural failure and not a REAL model quality sample.
        var body=Map.of("baseVersionId",version,"prompt","将展示人物修改为 Hedy Lamarr","source",Map.of("type","CHAT","messageId","cover-negative"));
        var response=client.send(HttpRequest.newBuilder(URI.create(url("applications/"+app+"/edits"))).header("Cookie",login.cookie()).header("X-CSRF-Token",login.csrf())
                .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofByteArray(CoverStore.JSON.writeValueAsBytes(body))).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(202);var task=UUID.fromString(CoverStore.JSON.readTree(response.body()).path("task").path("id").asText());
        var claim=queue.claim().orElseThrow();assertThat(claim.taskId()).isEqualTo(task);stage(claim,TaskStatus.PLAN,TaskStatus.GENERATE);
        var base=runStore.editSource(claim).orElseThrow();files.seed(task,claim.token(),base);
        var update=files.execute(task,claim.token(),"files.update",CoverStore.JSON.writeValueAsString(Map.of("path","src/components/ProfileCard.vue","expectedDigest",
                base.manifest().files().stream().filter(f->f.path().equals("src/components/ProfileCard.vue")).findFirst().orElseThrow().digest(),"content","<script setup lang=\"ts\">const broken = ;</script><template>broken</template>")));
        assertThat(update.status()).isEqualTo("SUCCEEDED");runStore.draft(claim,files.snapshot(task,claim.token()),AgentJournal.latest(journal.read(jdbc.sql("SELECT source_task_id FROM application_versions WHERE id=?").param(version).query(UUID.class).single()),"draft").path("actions"));
        queue.advance(claim,TaskStatus.VERIFY,EventType.STAGE_STARTED,"Controlled invalid Vue fixture",null);stage(claim,TaskStatus.VERIFY,TaskStatus.FAILED);
        assertThat(AgentJournal.latest(journal.read(task),"runner.result").path("build").path("exitCode").asInt()).isNotZero();
        assertThat(apps.find(owner,app).orElseThrow().latestReadyVersionId()).isEqualTo(version);
        assertThat(publications.get(owner,publication).status()).isEqualTo("PUBLISHED");assertThat(publications.list(owner,app).latestSuccessful().id()).isEqualTo(publication);
        assertThat(get(route(),login).statusCode()).isEqualTo(200);assertThat(get(route()+"/image?digest="+imageDigest,login).body()).isEqualTo(image);
        var evidence=Map.of("testType","CONTROLLED_FAULT_FIXTURE_APP","modelProvider","deterministic-mock","naturalFailedEdit",false,"publicationId",publication,
                "latestReadyVersionId",version,"failedEditTaskId",task,"nativeBuildExitCode",AgentJournal.latest(journal.read(task),"runner.result").path("build").path("exitCode"),
                "mockModelCallRows",jdbc.sql("SELECT count(*) FROM model_calls").query(Long.class).single());
        Files.writeString(Path.of("target/cover-integration/controlled-failure.json"),CoverStore.JSON.writeValueAsString(evidence));
    }
    @Test @Order(5) void coordinatorPersistsCursorAndNeverResetsTerminalFailedCapture() throws Exception {
        var root=Path.of("target/cover-integration/coordinator-"+UUID.randomUUID()).toAbsolutePath();Files.createDirectories(root.resolve("queue"));
        var store=new CoverStore(root.resolve("queue"));var calls=new java.util.concurrent.atomic.AtomicInteger();
        CoverGateway gateway=(binding,deadline)->{
            calls.incrementAndGet();var value=new CoverStore.View(binding.id(),binding.applicationId(),binding.versionId(),binding.sourceDigest(),binding.artifactDigest(),binding.entryPath(),"FAILED",0,"TARGET_REJECTED",null,null);
            try {Files.createDirectories(root.resolve("queue/"+binding.id()));Files.writeString(root.resolve("queue/"+binding.id()+"/job.json"),CoverStore.JSON.writeValueAsString(value));}
            catch(Exception f) {throw new IllegalStateException(f);}return CoverStore.JSON.valueToTree(value);
        };
        try(var coordinator=new CoverCoordinator(root,jdbc,covers,store,gateway)) {coordinator.tick();coordinator.tick();}
        assertThat(calls.get()).isEqualTo(1);assertThat(Files.exists(root.resolve("cursor.json"))).isTrue();
        try(var resumed=new CoverCoordinator(root,jdbc,covers,store,gateway)) {resumed.start();resumed.tick();}
        assertThat(calls.get()).isEqualTo(1);assertThat(store.metadata(covers.binding(owner,publication)).status()).isEqualTo("FAILED");
    }
    @Test @Order(6) void coordinatorQuarantinesUnconfirmedProcessAndExcludesASecondWorker() throws Exception {
        var root=Path.of("target/cover-integration/quarantine-"+UUID.randomUUID()).toAbsolutePath();Files.createDirectories(root.resolve("queue"));
        var calls=new java.util.concurrent.atomic.AtomicInteger();CoverGateway gateway=(binding,deadline)->{calls.incrementAndGet();throw new IllegalStateException("unknown process");};
        var store=new CoverStore(root.resolve("queue"));
        try(var first=new CoverCoordinator(root,jdbc,covers,store,gateway)) {
            first.start();
            assertThatThrownBy(()->new CoverCoordinator(root,jdbc,covers,store,gateway).start()).isInstanceOf(Exception.class);
            first.tick();first.tick();assertThat(calls.get()).isEqualTo(1);assertThat(Files.exists(root.resolve("quarantine.json"))).isTrue();
        }
        try(var resumed=new CoverCoordinator(root,jdbc,covers,store,gateway)) {resumed.start();resumed.tick();}
        assertThat(calls.get()).isEqualTo(1);assertThat(get(route(),login).statusCode()).isEqualTo(200);
    }
}
