package dev.codeless.api.preview;

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

/** Opt-in paid evaluation: never selected by default Surefire test-name discovery. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "codeless.model.provider=deepseek","codeless.agent.enabled=true","codeless.agent.repository-root=../..",
    "codeless.tasks.enabled=true","codeless.tasks.poll-ms=200",
    "CODELESS_DEMO_PASSWORD=demo-password-for-test-only","CODELESS_ADMIN_PASSWORD=admin-password-for-test-only",
    "CODELESS_PREVIEW_SIGNING_KEY=1111111111111111111111111111111111111111111111111111111111111111",
    "CODELESS_PREVIEW_REGISTRY_KEY=4444444444444444444444444444444444444444444444444444444444444444"})
@ActiveProfiles("test")
class RealPreviewPlatformAcceptanceIT {
    static final PostgreSQLContainer DATABASE=new PostgreSQLContainer(DockerImageName.parse(
        "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94").asCompatibleSubstituteFor("postgres"))
        .withDatabaseName("real_preview_platform").withUsername("preview_test").withPassword("explicit-test-only");
    static {DATABASE.start();}
    static final Path ROOT=Path.of("target/real-preview-platform-"+UUID.randomUUID()).toAbsolutePath().normalize();
    static final int TLS=freePort(),CONTROL=freePort();
    static int freePort(){try(var socket=new ServerSocket(0)){return socket.getLocalPort();}catch(Exception error){throw new RuntimeException(error);}}
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
        try(var owned=new PreviewAcceptanceProcess(builder,ROOT.resolve("prepare-process"),null)) {
            assertThat(owned.await(java.time.Duration.ofSeconds(300))).isTrue();assertThat(owned.exitValue()).isZero();
        }
    }
    protected String acceptanceScript(){return "../../tests/e2e/preview/platform.acceptance.mjs";}
    @Test void realModelThroughAuthenticatedPlatformPreview() throws Exception {
        var builder=new ProcessBuilder("node",acceptanceScript()).directory(Path.of(".").toFile());
        var env=builder.environment();
        // The browser/runner child needs no provider credential. Only the API owns that secret.
        env.remove("CODELESS_MODEL_API_KEY");env.remove("CODELESS_MODEL_NAME");
        env.put("CODELESS_PREVIEW_ACCEPTANCE_MODEL","deepseek");
        env.put("CODELESS_PREVIEW_API_INTERNAL_ORIGIN","http://127.0.0.1:"+port);
        env.put("CODELESS_AGENT_PRIVATE_ROOT",ROOT.resolve("private").toString());
        env.put("CODELESS_FILE_WORKSPACE_ROOT",ROOT.resolve("workspaces").toString());
        env.put("CODELESS_PREVIEW_EVIDENCE_DIR",ROOT.resolve("evidence").toString());
        env.put("CODELESS_PREVIEW_CONTROL_PORT",Integer.toString(CONTROL));env.put("CODELESS_PREVIEW_GATEWAY_PORT","0");
        env.put("CODELESS_PREVIEW_SIGNING_KEY","11".repeat(32));env.put("CODELESS_PREVIEW_REGISTRY_KEY","44".repeat(32));
        env.put("CODELESS_PREVIEW_ORIGIN","https://preview.codeless-preview.test:"+TLS);env.put("CODELESS_PLATFORM_ORIGIN","https://platform.codeless.test:"+TLS);
        Path log=ROOT.resolve("platform.log");builder.redirectErrorStream(true).redirectOutput(log.toFile());
        try(var process=new PreviewAcceptanceProcess(builder,ROOT.resolve("acceptance-process"),ROOT.resolve("evidence"))) {
        boolean ended=process.await(java.time.Duration.ofSeconds(840));
        Path evidence=ROOT.resolve("evidence");
        var report=Files.exists(evidence.resolve("acceptance.json"))?json.readTree(Files.readString(evidence.resolve("acceptance.json"))):json.createObjectNode();
        var started=Files.exists(evidence.resolve("started.json"))?json.readTree(Files.readString(evidence.resolve("started.json"))):null;
        List<Map<String,Object>> usage=started==null?List.of():jdbc.sql("SELECT id,stage,provider,model,status,input_tokens,output_tokens,error_code FROM model_calls WHERE task_id=? ORDER BY created_at")
            .param(UUID.fromString(started.path("taskId").asText())).query((rs,n)->{
                var value=new LinkedHashMap<String,Object>();value.put("id",rs.getObject(1));value.put("stage",rs.getString(2));value.put("provider",rs.getString(3));value.put("model",rs.getString(4));
                value.put("status",rs.getString(5));value.put("inputTokens",rs.getObject(6));value.put("outputTokens",rs.getObject(7));value.put("errorCode",rs.getString(8));return (Map<String,Object>)value;
            }).list();
        Files.writeString(evidence.resolve("model-calls.json"),json.writeValueAsString(usage));
        assertThat(ended).as(log.toString()).isTrue();assertThat(process.exitValue()).as(Files.readString(log)).isZero();
        UUID task=UUID.fromString(report.path("taskId").asText());
        assertThat(jdbc.sql("SELECT status FROM generation_tasks WHERE id=?").param(task).query(String.class).single()).isEqualTo("READY");
        assertThat(report.path("platformApiFixture").asBoolean()).isFalse();assertThat(report.path("signingFixture").asBoolean()).isFalse();
        assertThat(report.path("modelProvider").asText()).isEqualTo("deepseek");
        assertThat(usage).hasSizeGreaterThanOrEqualTo(2).allSatisfy(call->{
            assertThat(call.get("provider")).isEqualTo("deepseek");assertThat(call.get("model")).isEqualTo(System.getenv("CODELESS_MODEL_NAME"));
            assertThat(call.get("status")).isEqualTo("SUCCEEDED");assertThat(call.get("inputTokens")).isNotNull();assertThat(call.get("outputTokens")).isNotNull();
        });
        } // A cleanup failure must not publish model-quality acceptance.
        Path evidence=ROOT.resolve("evidence");
        var report=json.readTree(Files.readString(evidence.resolve("acceptance.json")));
        ((tools.jackson.databind.node.ObjectNode)report).put("modelQualityAccepted",true).put("modelQualityValidation","REAL_PROVIDER_SQL_AND_VISIBLE_CONTENT");
        Files.writeString(evidence.resolve("acceptance.json"),json.writeValueAsString(report));
        System.out.println("Paid real-model platform evidence: "+evidence);
    }
}
