package dev.codeless.api.auth;

import static org.assertj.core.api.Assertions.assertThat;

import dev.codeless.api.data.PostgresTestBase;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import tools.jackson.databind.ObjectMapper;

/** Real Tomcat framing + PostgreSQL writes; no model calls, builds or browser success is claimed here. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RequestBodyBoundaryHttpTest extends PostgresTestBase {
    @Value("${local.server.port}") int port;
    @Autowired AuthAccountRepository accounts;
    @Autowired BCryptPasswordEncoder encoder;
    @Autowired JdbcClient sql;
    @Autowired ObjectMapper mapper;
    @Autowired dev.codeless.api.tasks.TaskQueueService tasks;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
            .proxy(java.net.ProxySelector.of(null)).build();

    @Test void rejectedBodiesNeverCreateApplicationsAndMaximumEscapedPromptRemainsValid() throws Exception {
        String email = "d24-body-" + UUID.randomUUID() + "@fixture.test";
        accounts.seed(email, "D24 body fixture", encoder.encode("fixture-password"), "USER");
        UUID owner = sql.sql("SELECT id FROM platform_users WHERE email=?").param(email).query(UUID.class).single();
        var csrfResponse = client.send(HttpRequest.newBuilder(uri("auth/csrf")).GET().build(), HttpResponse.BodyHandlers.ofString());
        String cookie = csrfResponse.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        String csrf = mapper.readTree(csrfResponse.body()).path("token").asText();
        var login = post("auth/login", cookie, csrf, "{\"email\":\"" + email + "\",\"password\":\"fixture-password\"}", false);
        assertThat(login.statusCode()).isEqualTo(200);
        cookie = login.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        try {
            String valid = "{\"name\":\"D24 fixture\",\"dataMode\":\"MOCK\"}";
            String oversized = valid + " ".repeat(ApiRequestBody.MAX_BYTES);
            for (boolean chunked : new boolean[]{false, true}) {
                var rejected = post("applications", cookie, csrf, oversized, chunked);
                assertThat(rejected.statusCode()).isEqualTo(400);
                var error = mapper.readTree(rejected.body());
                assertThat(error.path("code").asText()).isEqualTo("INVALID_REQUEST");
                assertThat(error.path("message").asText()).contains("131072");
                assertThat(rejected.headers().firstValue("cache-control")).contains("no-store");
                assertThat(sql.sql("SELECT count(*) FROM applications WHERE owner_id=?").param(owner).query(Long.class).single()).isZero();
            }
            String exact = valid + " ".repeat(ApiRequestBody.MAX_BYTES - valid.getBytes(StandardCharsets.UTF_8).length);
            var created = post("applications", cookie, csrf, exact, true);
            assertThat(created.statusCode()).isEqualTo(201);
            String app = mapper.readTree(created.body()).path("id").asText();
            // Worst permitted JSON encoding: each supplementary code point is two escaped UTF-16 surrogates.
            String escaped = "\\uD83D\\uDE00".repeat(8000);
            String body = "{\"applicationId\":\"" + app + "\",\"prompt\":\"" + escaped + "\"}";
            assertThat(body.getBytes(StandardCharsets.UTF_8).length).isLessThan(ApiRequestBody.MAX_BYTES);
            var task = post("tasks", cookie, csrf, body, true);
            assertThat(task.statusCode()).isEqualTo(202);
            UUID taskId = UUID.fromString(mapper.readTree(task.body()).path("id").asText());
            String persisted = sql.sql("SELECT prompt FROM generation_tasks WHERE id=?").param(taskId).query(String.class).single();
            assertThat(persisted).isEqualTo("😀".repeat(8000));
            // Clean up this fixture's queued task only, without touching another class's queue entries.
            var cancelled = post("tasks/" + taskId + "/cancel", cookie, csrf, "", false);
            assertThat(cancelled.statusCode()).isEqualTo(200);
            assertThat(mapper.readTree(cancelled.body()).path("failureCode").asText()).isEqualTo("CANCELLED");
        } finally {
            for (UUID task : sql.sql("SELECT id FROM generation_tasks WHERE application_id IN "
                    + "(SELECT id FROM applications WHERE owner_id=?) AND queue_state='QUEUED'")
                    .param(owner).query(UUID.class).list()) tasks.cancel(owner, task);
        }
    }

    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + "/api/v0/" + path); }
    private HttpResponse<String> post(String path, String cookie, String csrf, String body, boolean chunked) throws Exception {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        var publisher = chunked ? HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(bytes))
                : HttpRequest.BodyPublishers.ofByteArray(bytes);
        assertThat(publisher.contentLength()).isEqualTo(chunked ? -1 : bytes.length);
        return client.send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(30))
                .header("Cookie", cookie).header("X-CSRF-Token", csrf).header("Content-Type", "application/json")
                .POST(publisher).build(), HttpResponse.BodyHandlers.ofString());
    }
}
