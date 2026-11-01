package dev.codeless.api.cover;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import dev.codeless.api.agent.*;
import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.deploy.*;
import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.tasks.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.*;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** Real publication SQL/ledger, DB selection and durable cursor. Hosting/capture are named fixture boundaries. */
@SpringBootTest(properties={"codeless.model.provider=deterministic-mock","codeless.agent.enabled=true",
        "codeless.agent.repository-root=../..","codeless.agent.private-root=target/d26-cover/runtime",
        "codeless.versions.root=target/d26-cover/versions","CODELESS_FILE_WORKSPACE_ROOT=target/d26-cover/workspaces",
        "CODELESS_FILE_AUDIT_ROOT=target/d26-cover/files","codeless.model.audit-root=target/d26-cover/models",
        "codeless.deploy.root=target/d26-cover/deployments","codeless.deploy.worker-enabled=false","codeless.cover.enabled=false"})
@Import(D26CoverCoordinatorTest.Hosting.class)
@ActiveProfiles("test")
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class D26CoverCoordinatorTest {
    static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse(
            "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("d26_cover").withUsername("codeless_test").withPassword("local-test-only");
    static {DB.start();}
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("CODELESS_DATABASE_URL",()->"jdbc:postgresql://127.0.0.1:1/must_not_connect");
        r.add("spring.datasource.url",DB::getJdbcUrl);r.add("spring.datasource.username",DB::getUsername);r.add("spring.datasource.password",DB::getPassword);
        r.add("codeless.admin.audit-root",()->Path.of("target/d26-cover/admin").toAbsolutePath().toString());
    }
    @TestConfiguration static class Hosting {
        @Bean @Primary DeploymentGateway namedFixtureHosting() {return new DeploymentGateway() {
            public String publish(Payload p,Instant deadline) {return "https://d"+p.publicationId().toString().replace("-","")+".sites.example.test/";}
            public Probe probe(Payload p,String url,Instant deadline) {return new Probe(true,p.versionId(),p.artifactDigest());}
        };}
    }
    @Autowired PlatformRepository repository;
    @Autowired TaskQueueService queue;
    @Autowired TaskStageRunner loop;
    @Autowired AgentJournal journal;
    @Autowired PublicationService publications;
    @Autowired JdbcClient jdbc;
    UUID owner,app,task,publication,version;String source,artifact;
    Path evidence=Path.of("target/d26-cover/evidence");
    @BeforeAll void publication() throws Exception {
        var p=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO().start();
        assertThat(p.waitFor(300,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(p.exitValue()).isZero();
        owner=UUID.randomUUID();app=UUID.randomUUID();repository.createUser(owner,owner+"@d26.test","D26 cover fixture");
        repository.createApplication(app,owner,"D26 cover fixture",DataMode.STATIC);
        task=queue.create(owner,app,"生成静态个人展示页",null).id();var claim=queue.claim().orElseThrow();assertThat(claim.taskId()).isEqualTo(task);
        for(var stage:List.of(TaskStatus.PLAN,TaskStatus.GENERATE,TaskStatus.VERIFY)) {
            var r=loop.execute(claim,stage);assertThat(r.next()).isNotEqualTo(TaskStatus.FAILED);
            loop.advance(queue,claim,r,EventType.STAGE_COMPLETED);
        }
        assertThat(queue.find(owner,task).orElseThrow().status()).isEqualTo(TaskStatus.READY);
        var draft=AgentJournal.latest(journal.read(task),"draft");var result=AgentJournal.latest(journal.read(task),"runner.result");
        version=UUID.fromString(draft.path("versionId").asText());source=draft.path("sourceDigest").asText();artifact=result.path("build").path("artifact").path("digest").asText();
        publication=publications.request(owner,app,version,artifact,"d26-cover-fixture-"+UUID.randomUUID()).id();publications.process(publication);
        assertThat(publications.deployment(owner,publication).phase()).isEqualTo("SUCCEEDED");Files.createDirectories(evidence);
    }
    Path directory(String name) throws Exception {return Files.createDirectories(Path.of("target/d26-cover/coordinators",name+"-"+UUID.randomUUID()).toAbsolutePath());}
    CoverGateway.Binding binding() {return new CoverGateway.Binding(publication,app,version,"PUBLISHED",source,artifact,publications.get(owner,publication).url(),"/");}
    void report(String name,Object value) throws Exception {Files.writeString(evidence.resolve(name+".json"),CoverStore.JSON.writeValueAsString(value));}
    @Test void unavailableEntryKeepsCursorAndQuarantinesInsteadOfDroppingAPublishedVersion() throws Exception {
        for(var status:List.of(HttpStatus.NOT_FOUND,HttpStatus.SERVICE_UNAVAILABLE)) {
            Path root=directory("entry-"+status.value());var service=mock(CoverService.class);var gateway=mock(CoverGateway.class);var store=mock(CoverStore.class);
            when(service.binding(owner,publication)).thenThrow(new AuthFailure(status,"COVER_ENTRY_UNAVAILABLE"));
            try(var coordinator=new CoverCoordinator(root,jdbc,service,store,gateway)) {
                coordinator.tick();verify(service).binding(owner,publication);verifyNoInteractions(gateway,store);
                assertThat(root.resolve("cursor.json")).doesNotExist();
                assertThat(root.resolve("quarantine.json")).isRegularFile();
                assertThat(CoverStore.JSON.readTree(Files.readString(root.resolve("quarantine.json"))).path("manualRecoveryRequired").asBoolean()).isTrue();
                coordinator.tick();verifyNoMoreInteractions(service); // No automatic capture or repeated binding request.
            }
            try(var restarted=new CoverCoordinator(root,jdbc,service,store,gateway)) {
                restarted.start();restarted.tick();verifyNoMoreInteractions(service);verifyNoInteractions(gateway,store);
            }
            report("entry-"+status.value(),Map.of("taskId",task,"publicationId",publication,"versionId",version,"injectedStatus",status.value(),
                    "cursorAdvanced",false,"quarantine",CoverStore.JSON.readTree(Files.readString(root.resolve("quarantine.json"))),"captureCalls",0,"fixtureHosting",true));
        }
    }
    @Test void confirmedTerminalFailureAdvancesOnceAndNeverRetriesCapture() throws Exception {
        Path root=directory("confirmed-failure");var service=mock(CoverService.class);var gateway=mock(CoverGateway.class);var store=mock(CoverStore.class);var b=binding();
        var failed=new CoverStore.View(publication,app,version,source,artifact,"/","FAILED",2,"CAPTURE_FAILED",null,null);
        var result=CoverStore.JSON.readTree(CoverStore.JSON.writeValueAsBytes(failed));
        when(service.binding(owner,publication)).thenReturn(b);when(store.metadata(b)).thenReturn(failed);when(gateway.capture(eq(b),any())).thenReturn(result);
        try(var coordinator=new CoverCoordinator(root,jdbc,service,store,gateway)) {
            coordinator.tick();coordinator.tick();verify(gateway,times(1)).capture(eq(b),any());
            assertThat(root.resolve("cursor.json")).isRegularFile();assertThat(root.resolve("inflight.json")).doesNotExist();assertThat(root.resolve("quarantine.json")).doesNotExist();
        }
        report("confirmed-failure",Map.of("publicationId",publication,"nativeResultFixture",result,"captureCalls",1,"cursor",CoverStore.JSON.readTree(Files.readString(root.resolve("cursor.json")))));
    }
    @Test void unconfirmedCaptureKeepsInflightAndCursorForManualRecovery() throws Exception {
        Path root=directory("unconfirmed");var service=mock(CoverService.class);var gateway=mock(CoverGateway.class);var store=mock(CoverStore.class);var b=binding();
        when(service.binding(owner,publication)).thenReturn(b);
        when(gateway.capture(eq(b),any())).thenThrow(new IllegalStateException("CONTROLLED_CAPTURE_LOST"));
        try(var coordinator=new CoverCoordinator(root,jdbc,service,store,gateway)) {
            coordinator.tick();coordinator.tick();verify(gateway,times(1)).capture(eq(b),any());
            assertThat(root.resolve("cursor.json")).doesNotExist();assertThat(root.resolve("inflight.json")).isRegularFile();assertThat(root.resolve("quarantine.json")).isRegularFile();
        }
        report("unconfirmed-capture",Map.of("publicationId",publication,"captureCalls",1,"quarantine",CoverStore.JSON.readTree(Files.readString(root.resolve("quarantine.json")))));
    }
}
