package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.assertThat;
import dev.codeless.api.data.PostgresTestBase;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    "CODELESS_DEMO_PASSWORD=demo-password-for-test-only", "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only",
    "CODELESS_PREVIEW_SIGNING_KEY=1111111111111111111111111111111111111111111111111111111111111111",
    "CODELESS_PREVIEW_ORIGIN=https://preview.codeless-preview.test",
    "CODELESS_PLATFORM_ORIGIN=https://platform.codeless.test"
})
class PreviewHttpTest extends PostgresTestBase {
    @Value("${local.server.port}") int port;
    @Autowired JdbcClient jdbc;
    @Autowired ObjectMapper mapper;
    final HttpClient client = HttpClient.newHttpClient();
    record Session(String cookie, String csrf) {}
    record Seed(UUID app, UUID version, UUID build) {}
    String base() { return "http://127.0.0.1:" + port + "/api/v0/"; }
    HttpResponse<String> send(String path, Session session, boolean csrf) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create(base() + path));
        if (session != null) builder.header("Cookie", session.cookie());
        if (csrf && session != null) builder.header("X-CSRF-Token", session.csrf());
        return client.send(builder.POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
    }
    Session login() throws Exception {
        var first = client.send(HttpRequest.newBuilder(URI.create(base() + "auth/csrf")).GET().build(), HttpResponse.BodyHandlers.ofString());
        String csrf = mapper.readTree(first.body()).get("token").asText();
        String cookie = first.headers().firstValue("set-cookie").orElseThrow().split(";")[0];
        var result = client.send(HttpRequest.newBuilder(URI.create(base() + "auth/login")).header("Cookie", cookie)
            .header("X-CSRF-Token", csrf).header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString("{\"email\":\"demo@codeless.local\",\"password\":\"demo-password-for-test-only\"}"))
            .build(), HttpResponse.BodyHandlers.ofString());
        assertThat(result.statusCode()).isEqualTo(200);
        return new Session(result.headers().firstValue("set-cookie").orElseThrow().split(";")[0], csrf);
    }
    Seed seed(UUID owner, boolean verified) { return seed(owner, verified, false); }
    Seed seed(UUID owner, boolean verified, boolean failed) {
        UUID app = UUID.randomUUID(), version = UUID.randomUUID(), task = UUID.randomUUID(), build = UUID.randomUUID();
        jdbc.sql("INSERT INTO applications(id,owner_id,name,data_mode) VALUES (?,?,?,'MOCK')").params(app, owner, "Preview test").update();
        jdbc.sql("INSERT INTO application_versions(id,application_id,number,source_digest,status) VALUES (?,?,1,?,'DRAFT')")
            .params(version, app, "sha256:" + "a".repeat(64)).update();
        jdbc.sql("INSERT INTO generation_tasks(id,application_id,prompt,status) VALUES (?,?,'Preview fixture','VERIFY')").params(task, app).update();
        jdbc.sql("INSERT INTO builds(id,task_id,version_id,status,exit_code,artifact_digest,completed_at) VALUES (?,?,?,?,?,?,now())")
            .params(build, task, version, failed ? "FAILED" : "SUCCEEDED", failed ? 1 : 0, "sha256:" + "b".repeat(64)).update();
        jdbc.sql("UPDATE application_versions SET build_id=?,status=? WHERE id=?").params(build, failed ? "FAILED" : verified ? "VERIFIED" : "DRAFT", version).update();
        return new Seed(app, version, build);
    }
    String path(Seed seed) { return "applications/" + seed.app() + "/versions/" + seed.version() + "/preview-credentials"; }

    @Test void realSessionIssuesScopedCredentialAndRejectsMissingSessionCsrfAndForeignVersions() throws Exception {
        Session session = login();
        UUID owner = jdbc.sql("SELECT id FROM platform_users WHERE email='demo@codeless.local'").query(UUID.class).single();
        Seed own = seed(owner, true), draft = seed(owner, false);
        UUID foreignOwner = jdbc.sql("SELECT id FROM platform_users WHERE email='admin@codeless.local'").query(UUID.class).single();
        Seed foreign = seed(foreignOwner, true);
        assertThat(send(path(own), null, false).statusCode()).isEqualTo(401);
        assertThat(send(path(own), session, false).statusCode()).isEqualTo(403);
        assertThat(send(path(foreign), session, true).statusCode()).isEqualTo(404);
        assertThat(send("applications/" + own.app() + "/versions/" + foreign.version() + "/preview-credentials", session, true).statusCode()).isEqualTo(404);
        assertThat(send("applications/" + own.app() + "/versions/" + draft.version() + "/preview-credentials", session, true).statusCode()).isEqualTo(404);
        assertThat(send(path(draft), session, true).statusCode()).isEqualTo(409);
        var result = send(path(own), session, true);
        assertThat(result.statusCode()).isEqualTo(200);
        assertThat(result.headers().firstValue("cache-control")).contains("no-store");
        assertThat(result.headers().firstValue("set-cookie")).isEmpty();
        var body = mapper.readTree(result.body());
        assertThat(body.get("applicationId").asText()).isEqualTo(own.app().toString());
        assertThat(body.get("versionId").asText()).isEqualTo(own.version().toString());
        URI url = URI.create(body.get("url").asText());
        assertThat(url.getHost()).isEqualTo("v" + own.version().toString().replace("-", "") + ".preview.codeless-preview.test");
        String token = url.getRawQuery().substring("credential=".length());
        String[] wire = token.split("\\.");
        String payload = new String(Base64.getUrlDecoder().decode(wire[0]), StandardCharsets.UTF_8);
        assertThat(payload).contains(own.app().toString(), own.version().toString(), own.build().toString());
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(HexFormat.of().parseHex("11".repeat(32)), "HmacSHA256"));
        assertThat(Base64.getUrlDecoder().decode(wire[1])).isEqualTo(mac.doFinal(wire[0].getBytes(StandardCharsets.US_ASCII)));
        assertThat(send(path(own), session, true).body()).isNotEqualTo(result.body());
        Seed failed = seed(owner, false, true);
        assertThat(send(path(failed), session, true).statusCode()).isEqualTo(409);
    }
}
