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

/** Real authenticated HTTP/UI + SQL + resident registry + Docker + Chromium. Only model output is mock. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "codeless.model.provider=deterministic-mock","codeless.agent.enabled=true","codeless.agent.repository-root=../..",
    "codeless.tasks.enabled=true","codeless.tasks.poll-ms=200",
    "CODELESS_DEMO_PASSWORD=demo-password-for-test-only","CODELESS_ADMIN_PASSWORD=admin-password-for-test-only",
    "CODELESS_PREVIEW_SIGNING_KEY=1111111111111111111111111111111111111111111111111111111111111111",
    "CODELESS_PREVIEW_REGISTRY_KEY=4444444444444444444444444444444444444444444444444444444444444444"})
@ActiveProfiles("test")
class PreviewPlatformIntegrationTest {
    // Dedicated database prevents this real scheduler claiming tasks from other test classes.
    static final PostgreSQLContainer DATABASE=new PostgreSQLContainer(DockerImageName.parse(
        "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94").asCompatibleSubstituteFor("postgres"))
        .withDatabaseName("preview_platform").withUsername("preview_test").withPassword("explicit-test-only");
    static {DATABASE.start();}
    static final Path ROOT=Path.of("target/preview-platform-"+UUID.randomUUID()).toAbsolutePath().normalize();
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
    @Test void realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures() throws Exception {
        var builder=new ProcessBuilder("node","../../tests/e2e/preview/platform.acceptance.mjs").directory(Path.of(".").toFile());
        var env=builder.environment();
        env.remove("CODELESS_MODEL_API_KEY");env.remove("CODELESS_MODEL_NAME");
        env.put("CODELESS_PREVIEW_ACCEPTANCE_MODEL","deterministic-mock");
        env.put("CODELESS_PREVIEW_API_INTERNAL_ORIGIN","http://127.0.0.1:"+port);
        env.put("CODELESS_AGENT_PRIVATE_ROOT",ROOT.resolve("private").toString());
        env.put("CODELESS_FILE_WORKSPACE_ROOT",ROOT.resolve("workspaces").toString());
        env.put("CODELESS_PREVIEW_EVIDENCE_DIR",ROOT.resolve("evidence").toString());
        env.put("CODELESS_PREVIEW_CONTROL_PORT",Integer.toString(CONTROL));env.put("CODELESS_PREVIEW_GATEWAY_PORT","0");
        env.put("CODELESS_PREVIEW_SIGNING_KEY","11".repeat(32));env.put("CODELESS_PREVIEW_REGISTRY_KEY","44".repeat(32));
        env.put("CODELESS_PREVIEW_ORIGIN","https://preview.codeless-preview.test:"+TLS);env.put("CODELESS_PLATFORM_ORIGIN","https://platform.codeless.test:"+TLS);
        Path log=ROOT.resolve("platform.log");var process=builder.redirectErrorStream(true).redirectOutput(log.toFile()).start();
        boolean ended=process.waitFor(180,TimeUnit.SECONDS);if(!ended)process.destroyForcibly();
        assertThat(ended).as(log.toString()).isTrue();assertThat(process.exitValue()).as(Files.readString(log)).isZero();
        var report=json.readTree(Files.readString(ROOT.resolve("evidence/acceptance.json")));
        UUID task=UUID.fromString(report.path("taskId").asText());
        assertThat(jdbc.sql("SELECT status FROM generation_tasks WHERE id=?").param(task).query(String.class).single()).isEqualTo("READY");
        assertThat(report.path("platformApiFixture").asBoolean()).isFalse();assertThat(report.path("signingFixture").asBoolean()).isFalse();
        assertThat(report.path("modelProvider").asText()).isEqualTo("deterministic-mock");
        assertThat(report.path("modelQualityAccepted").asBoolean()).isFalse();
    }
}
