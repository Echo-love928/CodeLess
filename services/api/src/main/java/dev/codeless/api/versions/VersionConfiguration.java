package dev.codeless.api.versions;

import java.nio.file.Path;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
public class VersionConfiguration {
    @Bean SnapshotStore snapshotStore(Environment env) {
        String agent = env.getProperty("codeless.agent.private-root", ".local-data/agent");
        return new LocalVolumeSnapshotStore(Path.of(env.getProperty("codeless.versions.root", agent + "/versions")),
                env.getProperty("codeless.versions.shared-readers", Boolean.class, false));
    }
}
