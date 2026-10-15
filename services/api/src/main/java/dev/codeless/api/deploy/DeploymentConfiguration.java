package dev.codeless.api.deploy;

import java.nio.file.Path;
import java.time.Instant;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;

@Configuration
public class DeploymentConfiguration {
    @Bean DeploymentRecords deploymentRecords(Environment env) {
        String agent=env.getProperty("codeless.agent.private-root",".local-data/agent");
        return new DeploymentRecords(Path.of(env.getProperty("codeless.deploy.root",agent+"/deployments")));
    }
    @Bean @ConditionalOnMissingBean(DeploymentGateway.class)
    DeploymentGateway deploymentGateway(Environment env) {
        if(!env.getProperty("codeless.deploy.hosting-enabled",Boolean.class,false)) return unavailableHosting();
        return new NodeDeploymentGateway(
                Path.of(env.getRequiredProperty("codeless.deploy.node-executable")),
                Path.of(env.getRequiredProperty("codeless.deploy.gateway-entry")),
                Path.of(env.getRequiredProperty("codeless.deploy.hosting-root")),
                env.getRequiredProperty("codeless.deploy.public-origin"),
                env.getRequiredProperty("codeless.deploy.platform-origin"),
                env.getRequiredProperty("codeless.deploy.preview-origin"));
    }
    DeploymentGateway unavailableHosting() {
        return new DeploymentGateway() {
            public String publish(Payload payload,Instant deadline) {throw new IllegalStateException("HOSTING_UNAVAILABLE");}
            public Probe probe(Payload payload,String url,Instant deadline) {throw new IllegalStateException("HOSTING_UNAVAILABLE");}
        };
    }
}
