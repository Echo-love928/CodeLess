package dev.codeless.api.preview;
import static org.assertj.core.api.Assertions.assertThat;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import tools.jackson.databind.json.JsonMapper;

class PreviewReadinessTest {
    @Test void absentOrUnsafeConfigurationCannotIssueAndTrustedControlMustBindExactBuild() throws Exception {
        UUID app=UUID.randomUUID(),version=UUID.randomUUID(),build=UUID.randomUUID();String source="sha256:"+"a".repeat(64),artifact="sha256:"+"b".repeat(64);
        var json=JsonMapper.builder().build();
        assertThat(new PreviewReadiness(new MockEnvironment(),json).ready(app,version,build,source,artifact)).isFalse();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);String[] body={json.writeValueAsString(Map.of("ready",true,"buildId",build,"sourceDigest",source,"artifactDigest",artifact))};int[] status={200};
        server.createContext("/internal/preview/ready/",exchange->{
            assertThat(exchange.getRequestHeaders().getFirst("X-Codeless-Preview-Registry-Key")).isEqualTo("44".repeat(32));
            assertThat(exchange.getRequestHeaders().getFirst("Cookie")).isNull();
            byte[] bytes=body[0].getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(status[0],bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
        });server.start();
        try {
            var env=new MockEnvironment().withProperty("CODELESS_PREVIEW_REGISTRY_KEY","44".repeat(32));
            String origin="http://127.0.0.1:"+server.getAddress().getPort();
            for(String invalid:List.of("https://127.0.0.1:443",origin+"/external","http://localhost:80",origin+"?redirect=1")) {
                env.setProperty("CODELESS_PREVIEW_GATEWAY_INTERNAL_ORIGIN",invalid);assertThat(new PreviewReadiness(env,json).ready(app,version,build,source,artifact)).isFalse();
            }
            env.setProperty("CODELESS_PREVIEW_GATEWAY_INTERNAL_ORIGIN",origin);var readiness=new PreviewReadiness(env,json);
            assertThat(readiness.ready(app,version,build,source,artifact)).isTrue();assertThat(readiness.ready(app,version,UUID.randomUUID(),source,artifact)).isFalse();
            assertThat(readiness.ready(app,version,build,source,"sha256:"+"0".repeat(64))).isFalse();
            status[0]=302;assertThat(readiness.ready(app,version,build,source,artifact)).isFalse();
            status[0]=200;body[0]="x".repeat(4097);assertThat(readiness.ready(app,version,build,source,artifact)).isFalse();
        } finally {server.stop(0);}
    }
}
