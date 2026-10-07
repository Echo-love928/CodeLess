package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.assertThat;
import dev.codeless.api.data.PostgresTestBase;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.*;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.json.JsonMapper;

/** No paid provider. Real HTTP/auth/SQL/file tools/Docker/browser, with one bounded model-wait fixture. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
        "codeless.model.provider=deterministic-mock","codeless.agent.enabled=true","codeless.agent.repository-root=../..",
        "codeless.agent.private-root=target/csrf-generation/runtime","CODELESS_FILE_WORKSPACE_ROOT=target/csrf-generation/workspaces",
        "CODELESS_FILE_AUDIT_ROOT=target/csrf-generation/audit","codeless.model.audit-root=target/csrf-generation/models",
        "codeless.diagnostics.csrf.enabled=true","CODELESS_DEMO_PASSWORD=demo-password-for-test-only","CODELESS_ADMIN_PASSWORD=admin-password-for-test-only"})
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
@org.junit.jupiter.api.extension.ExtendWith(OutputCaptureExtension.class)
class CsrfDuringGenerationTest extends PostgresTestBase {
    @Value("${local.server.port}") int port;
    @Autowired TaskQueueService queue;@Autowired AgentRunStore store;@Autowired AgentJournal journal;@Autowired AgentEvidence evidence;
    @Autowired PlanValidator validator;@Autowired FileToolRegistry registry;@Autowired FileToolService files;
    @Autowired ModelCallRepository calls;@Autowired ModelCallAudit audit;@Autowired BuildGateway gateway;
    @Autowired org.springframework.jdbc.core.simple.JdbcClient jdbc;
    private final JsonMapper json=JsonMapper.builder().build();
    @BeforeAll static void prepare() throws Exception {
        var builder=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO();
        builder.environment().remove("CODELESS_MODEL_API_KEY");builder.environment().remove("CODELESS_MODEL_NAME");
        var process=builder.start();assertThat(process.waitFor(300,TimeUnit.SECONDS)).isTrue();assertThat(process.exitValue()).isZero();
    }
    @Test void csrfRemainsResponsiveWhileRealGenerationIsWaiting(CapturedOutput output) throws Exception {
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var mock=new MockModelProvider();
        var provider=new ModelProvider() {
            public String id(){return "deterministic-mock";}public String model(){return "csrf-model-wait-fixture";}
            public Reply call(Prompt prompt,int max,Duration timeout) {
                var input=json.readTree(prompt.getUserMessage().getText());
                if(input.path("phase").asText().equals("GENERATE") && input.path("observations").isEmpty()) {
                    entered.countDown();try {assertThat(release.await(20,TimeUnit.SECONDS)).isTrue();}
                    catch(InterruptedException error){Thread.currentThread().interrupt();throw new ModelFailure("MODEL_INTERRUPTED");}
                }
                return mock.call(prompt,max,timeout);
            }
        };
        try(var client=HttpClient.newHttpClient();var worker=Executors.newSingleThreadExecutor()) {
            String base="http://127.0.0.1:"+port+"/api/v0/";
            var csrf=get(client,base+"auth/csrf",null);String token=json.readTree(csrf.body()).path("token").asText();
            String cookie=csrf.headers().firstValue("set-cookie").orElseThrow().split(";",2)[0];
            var login=post(client,base+"auth/login",cookie,token,Map.of("email","demo@codeless.local","password","demo-password-for-test-only"));
            assertThat(login.statusCode()).isEqualTo(200);UUID owner=UUID.fromString(json.readTree(login.body()).path("id").asText());
            cookie=login.headers().firstValue("set-cookie").orElseThrow().split(";",2)[0];
            var app=post(client,base+"applications",cookie,token,Map.of("name","CSRF during generation","dataMode","STATIC","template","VUE"));
            assertThat(app.statusCode()).isEqualTo(201);UUID appId=UUID.fromString(json.readTree(app.body()).path("id").asText());
            var accepted=post(client,base+"tasks",cookie,token,Map.of("applicationId",appId,"prompt","生成 Ada Lovelace 静态个人展示页"));
            assertThat(accepted.statusCode()).isEqualTo(202);UUID task=UUID.fromString(json.readTree(accepted.body()).path("id").asText());
            jdbc.sql("UPDATE generation_tasks SET created_at='1900-01-01' WHERE id=?").param(task).update();
            var loop=new AgentLoop(store,new AgentModel(provider,calls,audit,store),validator,registry,files,gateway,evidence);
            var running=worker.submit(()->new TaskScheduler(queue,loop).tick());var timings=new ArrayList<Object>();
            try {
                assertThat(entered.await(10,TimeUnit.SECONDS)).isTrue();
                assertThat(queue.find(owner,task).orElseThrow().status().name()).isEqualTo("GENERATE");
                for(int i=0;i<8;i++) {
                    long start=System.nanoTime();var reply=get(client,base+"auth/csrf?diagnostic=PRIVATE_QUERY_MARKER",cookie);
                    assertThat(reply.statusCode()).isEqualTo(200);assertThat(json.readTree(reply.body()).path("token").asText()).isEqualTo(token);
                    String id=reply.headers().firstValue("X-Codeless-Diagnostic-Id").orElseThrow();UUID.fromString(id);
                    timings.add(Map.of("id",id,"status",reply.statusCode(),"elapsedMs",(System.nanoTime()-start)/1_000_000));
                }
            } finally {release.countDown();}
            running.get(120,TimeUnit.SECONDS);
            assertThat(queue.find(owner,task).orElseThrow().status().name()).isEqualTo("READY");
            assertThat(AgentJournal.latest(journal.read(task),"runner.result").path("verification").path("status").asText()).isEqualTo("PASSED");
            assertThat(output.getOut()).contains("csrf.lifecycle phase=started","csrf.lifecycle phase=finished","status=200 returned=true")
                    .doesNotContain("PRIVATE_QUERY_MARKER",token,cookie);
            Path directory=Path.of(System.getenv().getOrDefault("CODELESS_HTTP_EVIDENCE_DIR","target/csrf-generation/evidence"));Files.createDirectories(directory);
            Files.writeString(directory.resolve("D10-A-csrf-concurrency.json"),json.writeValueAsString(Map.of("task",queue.find(owner,task).orElseThrow(),
                    "events",journal.read(task),"modelProvider","deterministic-mock","modelQualityEvidence",false,"extra",Map.of(
                    "requestsWhileGenerateBlocked",timings,"realModelCalls",0,"historical504RootCause","UNKNOWN",
                    "scope","DIRECT_REAL_API_HTTP; real nginx platform regression is separate"))));
        } finally {release.countDown();}
    }
    private HttpResponse<String> get(HttpClient client,String url,String cookie) throws Exception {
        var request=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(3));if(cookie!=null)request.header("Cookie",cookie);
        var reply=client.send(request.GET().build(),HttpResponse.BodyHandlers.ofString());assertThat(reply.statusCode()).isEqualTo(200);return reply;
    }
    private HttpResponse<String> post(HttpClient client,String url,String cookie,String token,Object body) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(3)).header("Cookie",cookie).header("X-CSRF-Token",token)
                .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
    }
}
