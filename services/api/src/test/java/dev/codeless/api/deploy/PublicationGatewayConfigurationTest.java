package dev.codeless.api.deploy;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mock.env.MockEnvironment;

class PublicationGatewayConfigurationTest {
    @TempDir Path temporary;
    static MockEnvironment configured(Path root) throws Exception {
        var process=new ProcessBuilder("node","-p","process.execPath").start();
        String node=new String(process.getInputStream().readAllBytes()).trim();
        assertThat(process.waitFor()).isZero();
        return new MockEnvironment().withProperty("codeless.deploy.hosting-enabled","true")
                .withProperty("codeless.deploy.node-executable",node)
                .withProperty("codeless.deploy.gateway-entry",Path.of("../../services/runner/src/publish/gateway-cli.mjs").toAbsolutePath().normalize().toString())
                .withProperty("codeless.deploy.hosting-root",root.toAbsolutePath().toString())
                .withProperty("codeless.deploy.public-origin","https://sites.codeless-public.test")
                .withProperty("codeless.deploy.platform-origin","https://app.codeless.test")
                .withProperty("codeless.deploy.preview-origin","https://preview.codeless-preview.test");
    }
    @Test void defaultIsUnavailableAndEnabledWithoutSettingsFailsStartup() {
        new ApplicationContextRunner().withUserConfiguration(DeploymentConfiguration.class).run(context->{
            assertThat(context).hasSingleBean(DeploymentGateway.class);
            assertThatThrownBy(()->context.getBean(DeploymentGateway.class).publish(null,Instant.now())).hasMessage("HOSTING_UNAVAILABLE");
        });
        new ApplicationContextRunner().withUserConfiguration(DeploymentConfiguration.class)
                .withPropertyValues("codeless.deploy.hosting-enabled=true").run(context->assertThat(context).hasFailed());
    }
    @Test void completeOperatorSettingsInstallExactlyOneRealGateway() throws Exception {
        var env=configured(temporary);
        new ApplicationContextRunner().withUserConfiguration(DeploymentConfiguration.class)
                .withInitializer(context->context.getEnvironment().getPropertySources().addFirst(env.getPropertySources().get("mockProperties")))
                .run(context->{
                    assertThat(context).hasSingleBean(DeploymentGateway.class);
                    assertThat(context.getBean(DeploymentGateway.class)).isInstanceOf(NodeDeploymentGateway.class);
                });
    }
    @Test void invalidPathsAndSharedSitesCannotEnableHosting() throws Exception {
        var env=configured(temporary).withProperty("codeless.deploy.node-executable","relative-node");
        assertThatThrownBy(()->new DeploymentConfiguration().deploymentGateway(env)).hasMessage("PUBLICATION_PATH_CONFIG_INVALID");
        var shared=configured(temporary).withProperty("codeless.deploy.public-origin","https://sites.codeless.test");
        assertThatThrownBy(()->new DeploymentConfiguration().deploymentGateway(shared)).hasMessage("PUBLICATION_ORIGINS_MUST_BE_SEPARATE");
        var invalidPort=configured(temporary).withProperty("codeless.deploy.public-origin","https://sites.codeless-public.test:0");
        assertThatThrownBy(()->new DeploymentConfiguration().deploymentGateway(invalidPort)).hasMessage("PUBLICATION_ORIGIN_CONFIG_INVALID");
    }
}
