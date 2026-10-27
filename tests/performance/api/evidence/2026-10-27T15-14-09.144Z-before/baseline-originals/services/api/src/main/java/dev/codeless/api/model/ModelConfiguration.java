package dev.codeless.api.model;

import java.nio.file.Path;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
public class ModelConfiguration {
    @Bean
    ModelProvider modelProvider(Environment environment) {
        String selected = environment.getProperty("codeless.model.provider", "deterministic-mock");
        ModelProvider provider = switch (selected) {
            case "deterministic-mock" -> new MockModelProvider();
            case "deepseek" -> new DeepSeekModelProvider(environment.getProperty("CODELESS_MODEL_API_KEY"),
                    environment.getProperty("CODELESS_MODEL_NAME"));
            default -> throw new ModelFailure("MODEL_CONFIGURATION");
        };
        return new BoundedModelProvider(provider,dev.codeless.api.tasks.CapacityPolicy.limit(environment,"model-concurrency",2));
    }
    @Bean
    ModelCallAudit modelCallAudit(Environment environment) {
        return new ModelCallAudit(Path.of(environment.getProperty("codeless.model.audit-root", ".local-data/model-calls")));
    }
}
