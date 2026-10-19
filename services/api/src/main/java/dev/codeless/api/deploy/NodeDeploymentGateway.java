package dev.codeless.api.deploy;

import java.nio.file.Path;
import java.nio.file.Files;
import java.net.URI;
import dev.codeless.api.network.SitePolicy;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Installed private A/B DeploymentGateway adapter; never a model tool.
 * Paths/config are operator-owned constructor values, never Payload fields or HTTP inputs. */
public final class NodeDeploymentGateway implements DeploymentGateway {
    private final Path node, entry;
    private final Map<String,String> environment;
    private final JsonMapper json = JsonMapper.builder().build();
    public NodeDeploymentGateway(Path node, Path entry, Path hostingRoot,
                                 String publicOrigin, String platformOrigin, String previewOrigin) {
        if(!node.isAbsolute() || !entry.isAbsolute() || !hostingRoot.isAbsolute()
                || !Files.isRegularFile(node) || !Files.isExecutable(node) || !Files.isRegularFile(entry)
                || !Files.isDirectory(hostingRoot) || !Files.isReadable(hostingRoot))
            throw new IllegalArgumentException("PUBLICATION_PATH_CONFIG_INVALID");
        var sites=List.of(site(publicOrigin),site(platformOrigin),site(previewOrigin));
        if(new HashSet<>(sites).size()!=3) throw new IllegalArgumentException("PUBLICATION_ORIGINS_MUST_BE_SEPARATE");
        this.node=node.toAbsolutePath().normalize();this.entry=entry.toAbsolutePath().normalize();
        var env=new HashMap<String,String>();
        for(var key:List.of("PATH","Path","SystemRoot","TEMP","TMP")) {
            var value=System.getenv(key);if(value!=null) env.put(key,value);
        }
        env.put("CODELESS_HOSTING_ROOT",hostingRoot.toAbsolutePath().normalize().toString());
        env.put("CODELESS_PUBLICATION_ORIGIN",publicOrigin);
        env.put("CODELESS_PLATFORM_ORIGIN",platformOrigin);
        env.put("CODELESS_PREVIEW_ORIGIN",previewOrigin);
        this.environment=Map.copyOf(env);
    }
    private static String site(String value) {
        try {
            var uri=URI.create(value);String host=uri.getHost();
            if(!"https".equals(uri.getScheme()) || host==null || !host.matches("[a-z0-9.-]+")
                    || uri.getPort()==0 || uri.getPort()>65535
                    || uri.getUserInfo()!=null || uri.getQuery()!=null || uri.getFragment()!=null
                    || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) throw new IllegalArgumentException();
            return SitePolicy.site(host);
        } catch(Exception invalid) {throw new IllegalArgumentException("PUBLICATION_ORIGIN_CONFIG_INVALID");}
    }
    private JsonNode call(String action,Payload payload,String url,Instant deadline) {
        Process child=null;
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            if(deadline==null || deadline.isAfter(Instant.now().plusSeconds(30)) || !deadline.isAfter(Instant.now().plusSeconds(3)))
                throw new IllegalStateException("DEPLOYMENT_TIMEOUT");
            var input=new LinkedHashMap<String,Object>();input.put("action",action);input.put("payload",payload);
            input.put("deadline",deadline.toString());if(url!=null) input.put("url",url);
            var bytes=json.writeValueAsBytes(input);
            if(bytes.length>48*1024*1024) throw new IllegalStateException("DEPLOYMENT_FAILED");
            var builder=new ProcessBuilder(node.toString(),entry.toString());
            builder.environment().clear();builder.environment().putAll(environment);
            builder.redirectError(ProcessBuilder.Redirect.DISCARD);
            child=builder.start();final Process process=child;
            var output=executor.submit(()->{
                try(var stdin=process.getOutputStream()) {stdin.write(bytes);}
                var result=process.getInputStream().readNBytes(8193);
                if(result.length>8192 || process.waitFor()!=0) throw new IllegalStateException("DEPLOYMENT_FAILED");
                return json.readTree(result);
            });
            // The Node probe reserves 3 seconds inside this same deadline for container cleanup.
            try {return output.get(Math.max(1,deadline.toEpochMilli()-System.currentTimeMillis()),TimeUnit.MILLISECONDS);}
            catch(TimeoutException failure) {throw new IllegalStateException("DEPLOYMENT_TIMEOUT");}
            finally {
                if(process.isAlive()) {
                    process.descendants().forEach(ProcessHandle::destroyForcibly);
                    process.destroyForcibly();process.getOutputStream().close();process.getInputStream().close();
                }
                output.cancel(true);
            }
        } catch(RuntimeException failure) {throw failure;}
        catch(Exception failure) {throw new IllegalStateException("DEPLOYMENT_FAILED");}
        finally {if(child!=null && child.isAlive()) child.destroyForcibly();}
    }
    @Override public String publish(Payload payload,Instant deadline) {
        var response=call("publish",payload,null,deadline);
        if(response==null || !response.isObject() || response.size()!=1 || !response.path("url").isTextual())
            throw new IllegalStateException("HOSTING_URL_INVALID");
        return response.path("url").asText();
    }
    @Override public Probe probe(Payload payload,String url,Instant deadline) {
        var response=call("probe",payload,url,deadline);
        if(response==null || response.size()!=3 || !response.path("accessible").isBoolean() ||
                !payload.versionId().toString().equals(response.path("versionId").asText()) ||
                !payload.artifactDigest().equals(response.path("artifactDigest").asText()))
            throw new IllegalStateException("DEPLOYMENT_PROBE_FAILED");
        return new Probe(response.path("accessible").asBoolean(),payload.versionId(),payload.artifactDigest());
    }
}
