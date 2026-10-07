package dev.codeless.api.preview;
import static org.assertj.core.api.Assertions.assertThat;
import dev.codeless.api.data.PostgresTestBase;
import java.net.*;
import java.net.http.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.ObjectMapper;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties="CODELESS_PREVIEW_REGISTRY_KEY=4444444444444444444444444444444444444444444444444444444444444444")
class PreviewRegistryHttpTest extends PostgresTestBase {
    @Value("${local.server.port}") int port;
    @Autowired JdbcClient jdbc;
    @Autowired ObjectMapper json;
    HttpResponse<String> read(String key) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/internal/preview/versions")).GET();
        builder.header("Cookie","JSESSIONID=platform-cookie-cannot-register");builder.header("X-Forwarded-For","127.0.0.1");
        if(key!=null)builder.header("X-Codeless-Preview-Registry-Key",key);
        return HttpClient.newHttpClient().send(builder.build(),HttpResponse.BodyHandlers.ofString());
    }
    @Test void privateCatalogueRequiresServiceCredentialAndOnlyCommittedReadyActiveBindings() throws Exception {
        assertThat(read(null).statusCode()).isEqualTo(403);assertThat(read("wrong").statusCode()).isEqualTo(403);
        UUID owner=UUID.randomUUID();
        jdbc.sql("INSERT INTO platform_users(id,email,display_name,status) VALUES (?,?,?,'ACTIVE')").params(owner,owner+"@example.test","Private catalogue fixture").update();
        UUID app=UUID.randomUUID(),version=UUID.randomUUID(),task=UUID.randomUUID(),build=UUID.randomUUID();
        jdbc.sql("INSERT INTO applications(id,owner_id,name,data_mode) VALUES (?,?,?,'STATIC')").params(app,owner,"Private catalogue fixture").update();
        jdbc.sql("INSERT INTO application_versions(id,application_id,number,source_digest,status) VALUES (?,?,1,?,'DRAFT')").params(version,app,"sha256:"+"a".repeat(64)).update();
        jdbc.sql("INSERT INTO generation_tasks(id,application_id,prompt,status) VALUES (?,?,'Private catalogue fixture','VERIFY')").params(task,app).update();
        jdbc.sql("INSERT INTO builds(id,task_id,version_id,status,exit_code,artifact_digest,completed_at) VALUES (?,?,?,'SUCCEEDED',0,?,now())").params(build,task,version,"sha256:"+"b".repeat(64)).update();
        jdbc.sql("UPDATE application_versions SET status='VERIFIED',build_id=? WHERE id=?").params(build,version).update();
        var before=json.readTree(read("44".repeat(32)).body()).path("versions");
        assertThat(before.toString()).doesNotContain(version.toString());
        jdbc.sql("UPDATE generation_tasks SET status='READY' WHERE id=?").param(task).update();
        var response=read("44".repeat(32));assertThat(response.statusCode()).isEqualTo(200);assertThat(response.headers().firstValue("cache-control")).contains("no-store");
        var values=json.readTree(response.body()).path("versions");
        var row=java.util.stream.StreamSupport.stream(values.spliterator(),false).filter(v->v.path("versionId").asText().equals(version.toString())).findFirst().orElseThrow();
        assertThat(row.propertyNames()).containsExactlyInAnyOrder("applicationId","versionId","taskId","buildId","sourceDigest","artifactDigest");
        jdbc.sql("UPDATE applications SET status='ARCHIVED' WHERE id=?").param(app).update();
        assertThat(json.readTree(read("44".repeat(32)).body()).path("versions").toString()).doesNotContain(version.toString());
    }
}
