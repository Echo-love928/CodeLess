package dev.codeless.api.recovery;

import java.nio.file.Path;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Roots are process configuration only (never task, model or request data) and default to the same locations the
 * Agent, version store and D08 file tools use.
 */
@Configuration
public class RecoveryConfiguration {
    static Path agent(Environment env) {
        return Path.of(env.getProperty("codeless.agent.private-root", ".local-data/agent"));
    }

    static Path workspaces(Environment env) {
        return Path.of(env.getProperty("CODELESS_FILE_WORKSPACE_ROOT", ".local-data/file-workspaces"));
    }

    @Bean RunnerCleanup runnerCleanup(JdbcClient jdbc, PlatformTransactionManager manager, Environment env) {
        Path recovery = Path.of(env.getProperty("codeless.recovery.root", agent(env).resolve("recovery").toString()));
        return new RunnerCleanup(jdbc, manager, agent(env).resolve("work"), workspaces(env), recovery.resolve("cleanup"));
    }

    @Bean StorageSweeper storageSweeper(JdbcClient jdbc, Environment env) {
        Path versions = Path.of(env.getProperty("codeless.versions.root", agent(env).resolve("versions").toString()));
        var roots = new StorageSweeper.Roots(versions, agent(env).resolve("artifacts"), agent(env).resolve("work"), workspaces(env));
        long hours = env.getProperty("codeless.recovery.retention-hours", Long.class, 24L);
        return new StorageSweeper(jdbc, roots, Duration.ofHours(hours), StorageSweeper.utc());
    }

    @Component
    @ConditionalOnProperty(name = "codeless.recovery.sweep-enabled", havingValue = "true", matchIfMissing = true)
    static class SweepSchedule {
        private static final Logger log = LoggerFactory.getLogger(SweepSchedule.class);
        private final StorageSweeper sweeper;

        SweepSchedule(StorageSweeper sweeper) {
            this.sweeper = sweeper;
        }

        @Scheduled(initialDelayString = "${codeless.recovery.sweep-initial-ms:300000}",
                fixedDelayString = "${codeless.recovery.sweep-ms:3600000}")
        void sweep() {
            try {
                var report = sweeper.sweep();
                log.info("storage sweep {} removed={} kept={} errors={}", report.status(), report.removed(), report.kept(), report.errors());
            } catch (RuntimeException failure) {
                log.warn("storage sweep failed: {}", failure.getClass().getSimpleName());
            }
        }
    }
}
