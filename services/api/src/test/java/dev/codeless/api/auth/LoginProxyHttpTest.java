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
        // Simulate the trusted ingress socket using loopback in this test only.
        "server.tomcat.remoteip.internal-proxies=127\\.0\\.0\\.1"
})
class LoginProxyHttpTest extends PostgresTestBase {
    @Value("${local.server.port}") int port;
    final HttpClient client = HttpClient.newHttpClient();

    @Test void trustedProxyClientAddressSeparatesAttackersFromTheAdministrator() throws Exception {
        String base = "http://127.0.0.1:" + port + "/api/v0/auth/";
        var csrf = client.send(HttpRequest.newBuilder(URI.create(base + "csrf")).GET().build(), HttpResponse.BodyHandlers.ofString());
        String token = csrf.body().split("\"")[3];
        String cookie = csrf.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        for (int i = 0; i < 5; i++) assertThat(login(base, cookie, token, "192.0.2.40", "wrong")).isEqualTo(401);
        assertThat(login(base, cookie, token, "192.0.2.40", "admin-password-for-test-only")).isEqualTo(429);
        assertThat(login(base, cookie, token, "192.0.2.41", "admin-password-for-test-only")).isEqualTo(200);
    }

    private int login(String base, String cookie, String token, String address, String password) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create(base + "login"))
                .header("Cookie", cookie).header("X-CSRF-Token", token).header("X-Forwarded-For", address)
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(
                        "{\"email\":\"admin@codeless.local\",\"password\":\"" + password + "\"}")).build(),
                HttpResponse.BodyHandlers.ofString()).statusCode();
    }
}
