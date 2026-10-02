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
        return switch (selected) {
            case "deterministic-mock" -> new MockModelProvider();
            case "deepseek" -> new DeepSeekModelProvider(environment.getProperty("CODELESS_MODEL_API_KEY"),
                    environment.getProperty("CODELESS_MODEL_NAME"));
            default -> throw new ModelFailure("MODEL_CONFIGURATION");
        };
    }
    @Bean
    ModelCallAudit modelCallAudit(Environment environment) {
        return new ModelCallAudit(Path.of(environment.getProperty("codeless.model.audit-root", ".local-data/model-calls")));
    }
}
