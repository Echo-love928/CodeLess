package dev.codeless.api.cover;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;

/** A cover process must not be forced through the publish-only production IPC adapter. */
class CoverConfigurationTest {
    @TempDir Path root;
    Path node() {
        for(var part:System.getenv("PATH").split(java.io.File.pathSeparator)) {
            var file=Path.of(part).resolve(System.getProperty("os.name").startsWith("Windows")?"node.exe":"node");
            if(Files.isRegularFile(file)) return file.toAbsolutePath();
        }
        throw new IllegalStateException("Locked Node required");
    }
    MockEnvironment config() throws Exception {
        var entry=root.resolve("capture.mjs");Files.writeString(entry,"let raw='';for await(const c of process.stdin)raw+=c;process.stdout.write(JSON.stringify({record:{operation:JSON.parse(raw).action}}));");
        Files.createDirectories(root.resolve("hosting"));Files.createDirectories(root.resolve("covers/queue"));
        return new MockEnvironment().withProperty("codeless.deploy.node-executable",node().toString())
            .withProperty("codeless.cover.gateway-entry",entry.toString()).withProperty("codeless.cover.root",root.resolve("covers").toString())
            .withProperty("codeless.deploy.hosting-root",root.resolve("hosting").toString())
            .withProperty("codeless.deploy.public-origin","https://sites.codeless-public.test")
            .withProperty("codeless.deploy.platform-origin","https://platform.codeless.test")
            .withProperty("codeless.deploy.preview-origin","https://preview.codeless-preview.test");
    }
    void captures(MockEnvironment env) {
        var id=UUID.randomUUID();var binding=new CoverGateway.Binding(id,UUID.randomUUID(),UUID.randomUUID(),"PUBLISHED","sha256:"+"a".repeat(64),"sha256:"+"b".repeat(64),"https://d"+id.toString().replace("-","")+".sites.codeless-public.test/","/");
        assertThat(new CoverConfiguration().coverGateway(env).capture(binding,Instant.now().plusSeconds(10)).path("operation").asText()).isEqualTo("capture");
    }
    @Test void separateCoverNodeWorksWhenPublicationUsesAnIpcOnlyAdapter() throws Exception {
        var env=config().withProperty("codeless.deploy.node-executable",root.resolve("unavailable-publish-only-adapter").toString())
            .withProperty("codeless.cover.node-executable",node().toString());
        captures(env);
    }
    @Test void existingDeployNodeRemainsTheDefaultForLocalRuntime() throws Exception {captures(config());}
    @Test void applicationYamlResolvesSeparateCoverExecutableWithoutChangingPublicationNode() throws Exception {
        var env=config().withProperty("CODELESS_NODE_EXECUTABLE",root.resolve("publish-only-adapter").toString())
            .withProperty("CODELESS_COVER_NODE_EXECUTABLE",node().toString())
            .withProperty("codeless.deploy.node-executable","${CODELESS_NODE_EXECUTABLE}");
        env.getPropertySources().addLast(new org.springframework.boot.env.YamlPropertySourceLoader()
            .load("application",new org.springframework.core.io.ClassPathResource("application.yml")).getFirst());
        assertThat(env.getRequiredProperty("codeless.deploy.node-executable")).endsWith("publish-only-adapter");
        captures(env);
    }
}
