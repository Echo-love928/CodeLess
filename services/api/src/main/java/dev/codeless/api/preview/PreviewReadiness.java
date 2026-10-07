package dev.codeless.api.preview;

import java.net.*;
import java.net.http.*;
import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/** Deployment gate: only an already registered exact build may receive a credential. */
@Component
public final class PreviewReadiness {
    private final String origin,key;
    private final ObjectMapper json;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1))
            .followRedirects(HttpClient.Redirect.NEVER).proxy(new ProxySelector() {
                public List<Proxy> select(URI uri) {return List.of(Proxy.NO_PROXY);}
                public void connectFailed(URI uri,SocketAddress address,IOException failure) {}
            }).build();
    public PreviewReadiness(Environment env,ObjectMapper json) {
        this.origin=env.getProperty("CODELESS_PREVIEW_GATEWAY_INTERNAL_ORIGIN","");
        this.key=env.getProperty("CODELESS_PREVIEW_REGISTRY_KEY",""); this.json=json;
    }
    public boolean ready(UUID application,UUID version,UUID build,String source,String artifact) {
        if(origin.isEmpty()) return false;
        try {
            URI base=URI.create(origin);
            if(!base.getScheme().equals("http") || !"127.0.0.1".equals(base.getHost()) || base.getPort()<1
                    || base.getPort()>65535 || base.getUserInfo()!=null || !base.getPath().isEmpty()
                    || base.getQuery()!=null || base.getFragment()!=null || !key.matches("[a-f0-9]{64}")) return false;
            var request=HttpRequest.newBuilder(URI.create(origin+"/internal/preview/ready/"+application+"/"+version))
                    .header("X-Codeless-Preview-Registry-Key",key).timeout(Duration.ofMillis(3500)).GET().build();
            var response=client.send(request,HttpResponse.BodyHandlers.ofInputStream());
            try(var input=response.body()) {
                byte[] bytes=input.readNBytes(4097);
                if(response.statusCode()!=200 || bytes.length>4096) return false;
                var body=json.readTree(bytes);
                return body.path("ready").asBoolean(false) && build.toString().equals(body.path("buildId").asText())
                        && source.equals(body.path("sourceDigest").asText()) && artifact.equals(body.path("artifactDigest").asText());
            }
        } catch(InterruptedException interrupted) {Thread.currentThread().interrupt();return false;}
        catch(Exception unavailable) {return false;}
    }
}
