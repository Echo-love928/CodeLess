package dev.codeless.api.auth;

import static org.assertj.core.api.Assertions.assertThat;

import dev.codeless.api.data.PostgresTestBase;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
        "CODELESS_DEMO_PASSWORD=demo-password-for-test-only",
        "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only",
        "CODELESS_COOKIE_SECURE=true"
})
class AuthHttpTest extends PostgresTestBase {
    @Value("${local.server.port}") int port;
    private final HttpClient client = HttpClient.newHttpClient();

    @Test void untrustedPeersCannotResetLimitsByForgingForwardedAddresses() throws Exception {
        String base = "http://127.0.0.1:" + port + "/api/v0/auth/";
        var csrf = client.send(HttpRequest.newBuilder(URI.create(base + "csrf")).GET().build(), HttpResponse.BodyHandlers.ofString());
        String token = csrf.body().split("\"")[3];
        String cookie = csrf.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        String email = "unknown-" + java.util.UUID.randomUUID() + "@example.test";
        for (int i = 0; i < 6; i++) {
            var reply = client.send(HttpRequest.newBuilder(URI.create(base + "login"))
                    .header("Cookie", cookie).header("X-CSRF-Token", token)
                    .header("X-Forwarded-For", "192.0.2." + (i + 1))
                    .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(
                            "{\"email\":\"" + email + "\",\"password\":\"wrong\"}")).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(reply.statusCode()).isEqualTo(i < 5 ? 401 : 429);
        }
    }

    @Test
    void realHttpSessionHasHostOnlyHttpOnlySecureCookieAndLogoutRevokesIt() throws Exception {
        String base = "http://127.0.0.1:" + port + "/api/v0/auth/";
        HttpResponse<String> csrf = client.send(HttpRequest.newBuilder(URI.create(base + "csrf")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(csrf.statusCode()).isEqualTo(200);
        String firstCookie = csrf.headers().firstValue("set-cookie").orElseThrow();
        assertThat(firstCookie).contains("JSESSIONID=", "HttpOnly", "Secure", "SameSite=Lax")
                .doesNotContainIgnoringCase("Domain=");
        String token = csrf.body().split("\"")[3];
        String body = "{\"email\":\"demo@codeless.local\",\"password\":\"demo-password-for-test-only\"}";
        HttpResponse<String> login = client.send(HttpRequest.newBuilder(URI.create(base + "login"))
                        .header("Cookie", firstCookie.split(";", 2)[0]).header("X-CSRF-Token", token)
                        .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(login.statusCode()).isEqualTo(200);
        String rotatedCookie = login.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        assertThat(rotatedCookie).isNotEqualTo(firstCookie.split(";", 2)[0]);
        HttpResponse<String> me = client.send(HttpRequest.newBuilder(URI.create(base + "me"))
                .header("Cookie", rotatedCookie).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(me.statusCode()).isEqualTo(200);
        assertThat(me.body()).contains("demo@codeless.local");
        HttpResponse<String> logout = client.send(HttpRequest.newBuilder(URI.create(base + "logout"))
                .header("Cookie", rotatedCookie).header("X-CSRF-Token", token)
                .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(logout.statusCode()).isEqualTo(204);
        HttpResponse<String> after = client.send(HttpRequest.newBuilder(URI.create(base + "me"))
                .header("Cookie", rotatedCookie).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(after.statusCode()).isEqualTo(401);
    }
}
