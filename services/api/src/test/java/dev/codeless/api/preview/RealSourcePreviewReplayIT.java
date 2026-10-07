package dev.codeless.api.preview;
import dev.codeless.api.model.*;
import java.time.Duration;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import java.net.ServerSocket;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

/** Opt-in deterministic replay of A source/usage fixtures; no fresh model-quality evidence or paid calls. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "codeless.model.provider=deterministic-mock","codeless.agent.enabled=true","codeless.agent.repository-root=../..",
    "codeless.tasks.enabled=true","codeless.tasks.poll-ms=200",
    "CODELESS_DEMO_PASSWORD=demo-password-for-test-only","CODELESS_ADMIN_PASSWORD=admin-password-for-test-only",
    "CODELESS_PREVIEW_SIGNING_KEY=1111111111111111111111111111111111111111111111111111111111111111",
    "CODELESS_PREVIEW_REGISTRY_KEY=4444444444444444444444444444444444444444444444444444444444444444"})
@ActiveProfiles("test")
@Import(RealSourcePreviewReplayIT.ReplayConfiguration.class)
class RealSourcePreviewReplayIT {
    // Dedicated database prevents this real scheduler claiming tasks from other test classes.
    static final PostgreSQLContainer DATABASE=new PostgreSQLContainer(DockerImageName.parse(
        "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94").asCompatibleSubstituteFor("postgres"))
        .withDatabaseName("preview_platform_replay").withUsername("preview_test").withPassword("explicit-test-only");
    static {DATABASE.start();}
    static final Path ROOT=Path.of("target/preview-platform-replay-"+UUID.randomUUID()).toAbsolutePath().normalize();
    static final int TLS=freePort(),CONTROL=freePort();
    static int freePort() {try(var socket=new ServerSocket(0)){return socket.getLocalPort();}catch(Exception error){throw new RuntimeException(error);}}
    @DynamicPropertySource static void config(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",DATABASE::getJdbcUrl);registry.add("spring.datasource.username",DATABASE::getUsername);registry.add("spring.datasource.password",DATABASE::getPassword);
        registry.add("codeless.agent.private-root",()->ROOT.resolve("private").toString());
        registry.add("CODELESS_FILE_WORKSPACE_ROOT",()->ROOT.resolve("workspaces").toString());
        registry.add("CODELESS_FILE_AUDIT_ROOT",()->ROOT.resolve("file-audit").toString());
        registry.add("codeless.model.audit-root",()->ROOT.resolve("models").toString());
        registry.add("CODELESS_PREVIEW_ORIGIN",()->"https://preview.codeless-preview.test:"+TLS);
        registry.add("CODELESS_PLATFORM_ORIGIN",()->"https://platform.codeless.test:"+TLS);
        registry.add("CODELESS_PREVIEW_GATEWAY_INTERNAL_ORIGIN",()->"http://127.0.0.1:"+CONTROL);
    }
    @Value("${local.server.port}") int port;
    @Autowired JdbcClient jdbc;
    @Autowired ObjectMapper json;
    @BeforeAll static void prepare() throws Exception {
        for(String dir:List.of("private","workspaces","evidence"))Files.createDirectories(ROOT.resolve(dir));
        var builder=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO();
        builder.environment().remove("CODELESS_MODEL_API_KEY");builder.environment().remove("CODELESS_MODEL_NAME");
        var process=builder.start();
        assertThat(process.waitFor(300,TimeUnit.SECONDS)).isTrue();assertThat(process.exitValue()).isZero();
    }
    long processTimeoutSeconds() { return 240; }
    String modelMode() { return "recorded-source-replay"; }
    @Test void realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures() throws Exception {
        var builder=new ProcessBuilder("node","../../tests/e2e/preview/platform.acceptance.mjs").directory(Path.of(".").toFile());
        var env=builder.environment();
        env.remove("CODELESS_MODEL_API_KEY");env.remove("CODELESS_MODEL_NAME");
        env.put("CODELESS_PREVIEW_ACCEPTANCE_MODEL",modelMode());
        env.put("CODELESS_PREVIEW_API_INTERNAL_ORIGIN","http://127.0.0.1:"+port);
        env.put("CODELESS_AGENT_PRIVATE_ROOT",ROOT.resolve("private").toString());
        env.put("CODELESS_FILE_WORKSPACE_ROOT",ROOT.resolve("workspaces").toString());
        env.put("CODELESS_PREVIEW_EVIDENCE_DIR",ROOT.resolve("evidence").toString());
        env.put("CODELESS_PREVIEW_CONTROL_PORT",Integer.toString(CONTROL));env.put("CODELESS_PREVIEW_GATEWAY_PORT","0");
        env.put("CODELESS_PREVIEW_SIGNING_KEY","11".repeat(32));env.put("CODELESS_PREVIEW_REGISTRY_KEY","44".repeat(32));
        env.put("CODELESS_PREVIEW_ORIGIN","https://preview.codeless-preview.test:"+TLS);env.put("CODELESS_PLATFORM_ORIGIN","https://platform.codeless.test:"+TLS);
        Path log=ROOT.resolve("platform.log");var process=builder.redirectErrorStream(true).redirectOutput(log.toFile()).start();
        boolean ended=process.waitFor(processTimeoutSeconds(),TimeUnit.SECONDS);if(!ended)process.destroyForcibly();
        assertThat(ended).as(log.toString()).isTrue();assertThat(process.exitValue()).as(Files.readString(log)).isZero();
        var report=json.readTree(Files.readString(ROOT.resolve("evidence/acceptance.json")));
        UUID task=UUID.fromString(report.path("taskId").asText());
        assertThat(jdbc.sql("SELECT status FROM generation_tasks WHERE id=?").param(task).query(String.class).single()).isEqualTo("READY");
        assertThat(report.path("platformApiFixture").asBoolean()).isFalse();assertThat(report.path("signingFixture").asBoolean()).isFalse();
        assertThat(report.path("modelProvider").asText()).isEqualTo(modelMode());
        assertThat(report.path("modelQualityAccepted").asBoolean()).isFalse();
    }
    @TestConfiguration static class ReplayConfiguration {
        @Bean @Primary ModelProvider recordedSourceProvider() {
            return new ModelProvider() {
                final MockModelProvider plan=new MockModelProvider();
                final JsonMapper json=JsonMapper.builder().build();
                public String id(){ return "deterministic-mock"; }
                public String model(){ return "committed-5ec8adb-source-fixture"; }
                // Prior recorded usage is a replay fixture, not usage measured by this test.
                Reply reply(String content,int index) {
                    try {
                        var call=json.readTree(Files.readString(Path.of("../../tests/agent/evidence/2026-10-05/platform/attempt-unique-targets.json"))).path("calls").get(index);
                        int input=call.path("inputTokens").asInt(),output=call.path("outputTokens").asInt();
                        return new Reply(content,new Evidence(model(),"recorded-fixture","recorded-fixture",
                            new Usage(input,output,input+output,json.valueToTree(Map.of("fixture",true,"measurement","RECORDED_PRIOR_CALL")))));
                    }catch(java.io.IOException error){throw new IllegalStateException(error);}
                }
                public Reply call(Prompt prompt,int max,Duration timeout) {
                    long delay=Long.getLong("codeless.preview.replay.delay-ms",0);
                    if(delay<0||delay>30000)throw new IllegalArgumentException("Bounded replay delay required");
                    try{Thread.sleep(delay);}catch(InterruptedException error){Thread.currentThread().interrupt();throw new IllegalStateException(error);}
                    var input=json.readTree(prompt.getUserMessage().getText());
                    if(!"GENERATE".equals(input.path("phase").asText()))return reply(plan.call(prompt,max,timeout).content(),0);
                    String component="src/components/ProfileCard.vue",page="src/pages/HomePage.vue";
                    int observed=input.path("observations").size();
                    try {
                        String content=switch(observed) {
                            case 0,2 -> json.writeValueAsString(Map.of("type","tool","name","files.create","arguments",Map.of("path",observed==0?component:page,"content",
                                Files.readString(Path.of("../../tests/agent/evidence/2026-10-05/platform/source/unique-targets").resolve(observed==0?component:page)))));
                            case 1,3 -> json.writeValueAsString(Map.of("type","tool","name","files.read","arguments",Map.of("path",observed==1?component:page)));
                            case 4 -> "{\"type\":\"done\",\"actions\":[{\"type\":\"navigate\",\"path\":\"/\"},{\"type\":\"expectText\",\"target\":{\"testId\":\"page-heading\"},\"value\":\"Ada Lovelace\"},{\"type\":\"expectText\",\"target\":{\"testId\":\"profile-name\"},\"value\":\"Ada Lovelace\"},{\"type\":\"expectText\",\"target\":{\"testId\":\"work-title-analytical-engine\"},\"value\":\"Analytical Engine\"},{\"type\":\"expectText\",\"target\":{\"testId\":\"work-title-note-g\"},\"value\":\"Note G\"}]}";
                            default -> throw new IllegalStateException("Unexpected replay step");
                        };
                        return reply(content,observed+1);
                    }catch(java.io.IOException error){throw new IllegalStateException(error);}
                }
            };
        }
    }
}
