package dev.codeless.api.cover;

import dev.codeless.api.deploy.PublicationService;
import dev.codeless.api.versions.SnapshotStore;
import java.nio.file.*;
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;

@Configuration
@ConditionalOnProperty(name="codeless.cover.enabled",havingValue="true")
public class CoverConfiguration {
    static Path root(Environment e) {return Path.of(e.getRequiredProperty("codeless.cover.root")).toAbsolutePath().normalize();}
    @Bean CoverStore coverStore(Environment e) throws Exception {
        var queue=root(e).resolve("queue");Files.createDirectories(queue);CoverStore.safe(queue,true);return new CoverStore(queue);
    }
    @Bean CoverService coverService(PublicationService publications,JdbcClient jdbc,SnapshotStore snapshots,CoverStore store,Environment e) {
        return new CoverService(publications,jdbc,snapshots,Path.of(e.getRequiredProperty("codeless.agent.private-root")).resolve("journal"),
                e.getRequiredProperty("codeless.deploy.public-origin"),store);
    }
    @Bean @ConditionalOnMissingBean(CoverGateway.class)
    @ConditionalOnProperty(name="codeless.cover.worker-enabled",havingValue="true",matchIfMissing=true)
    CoverGateway coverGateway(Environment e) {
        return new NodeCoverGateway(Path.of(e.getRequiredProperty("codeless.deploy.node-executable")),Path.of(e.getRequiredProperty("codeless.cover.gateway-entry")),
                Path.of(e.getRequiredProperty("codeless.deploy.hosting-root")),root(e).resolve("queue"),e.getRequiredProperty("codeless.deploy.public-origin"),
                e.getRequiredProperty("codeless.deploy.platform-origin"),e.getRequiredProperty("codeless.deploy.preview-origin"));
    }
    @Bean(initMethod="start",destroyMethod="close")
    @ConditionalOnProperty(name="codeless.cover.worker-enabled",havingValue="true",matchIfMissing=true)
    CoverCoordinator coverCoordinator(JdbcClient jdbc,CoverService service,CoverStore store,CoverGateway gateway,Environment e) {
        return new CoverCoordinator(root(e),jdbc,service,store,gateway);
    }
}
