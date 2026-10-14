package dev.codeless.api.deploy;

import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="codeless.deploy.worker-enabled",havingValue="true",matchIfMissing=true)
public class DeploymentWorker {
    private final JdbcClient jdbc;
    private final PublicationService publications;
    public DeploymentWorker(JdbcClient jdbc,PublicationService publications) {this.jdbc=jdbc;this.publications=publications;}
    @Scheduled(fixedDelayString="${codeless.deploy.poll-ms:1000}")
    public void tick() {
        var ids=jdbc.sql("SELECT id FROM publications WHERE status='REQUESTED' ORDER BY created_at LIMIT 10").query(UUID.class).list();
        for(var id:ids) publications.process(id);
    }
}
