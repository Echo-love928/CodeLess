package dev.codeless.api.apps;

import static org.assertj.core.api.Assertions.assertThat;

import dev.codeless.api.data.PostgresTestBase;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
        "CODELESS_DEMO_PASSWORD=demo-password-for-test-only",
        "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only",
        "CODELESS_COOKIE_SECURE=true"
})
class ApplicationHttpTest extends PostgresTestBase {
    @Value("${local.server.port}") int port;
    @Autowired ObjectMapper mapper;
    private final HttpClient client = HttpClient.newHttpClient();

    @Test void realHttpLoginCreatesAndReadsOwnedDraft() throws Exception {
        String base = "http://127.0.0.1:" + port + "/api/v0/";
        HttpResponse<String> csrf = send(HttpRequest.newBuilder(URI.create(base + "auth/csrf"))
                .GET().build());
        assertThat(csrf.statusCode()).isEqualTo(200);
        String firstCookie = csrf.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        String token = mapper.readTree(csrf.body()).get("token").asText();
        HttpResponse<String> login = send(HttpRequest.newBuilder(URI.create(base + "auth/login"))
                .header("Cookie", firstCookie).header("X-CSRF-Token", token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(
                        "{\"email\":\"demo@codeless.local\",\"password\":\"demo-password-for-test-only\"}"))
                .build());
        assertThat(login.statusCode()).isEqualTo(200);
        String cookie = login.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        HttpResponse<String> created = send(HttpRequest.newBuilder(URI.create(base + "applications"))
                .header("Cookie", cookie).header("X-CSRF-Token", token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(
                        "{\"name\":\"HTTP app\",\"dataMode\":\"MOCK\"}"))
                .build());
        assertThat(created.statusCode()).isEqualTo(201);
        var body = mapper.readTree(created.body());
        String appId = body.get("id").asText();
        String versionId = body.get("baseVersionId").asText();
        HttpResponse<String> detail = send(HttpRequest.newBuilder(
                URI.create(base + "applications/" + appId)).header("Cookie", cookie).GET().build());
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(detail.body()).get("baseVersionId").asText()).isEqualTo(versionId);
        HttpResponse<String> version = send(HttpRequest.newBuilder(
                URI.create(base + "versions/" + versionId)).header("Cookie", cookie).GET().build());
        assertThat(version.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(version.body()).get("status").asText()).isEqualTo("DRAFT");
    }

    private HttpResponse<String> send(HttpRequest request) throws Exception {
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
