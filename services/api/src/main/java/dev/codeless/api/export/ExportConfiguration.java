package dev.codeless.api.export;

import java.nio.file.Path;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
public class ExportConfiguration {
    /**
     * Trusted read-only repository checkout (the same one that builds the runner image). Defaults to the Agent's
     * repository root, else the process working directory. Never derived from a request, task or version.
     */
    @Bean ExportTemplate exportTemplate(Environment env) {
        return new ExportTemplate(Path.of(env.getProperty("codeless.export.repository-root",
                env.getProperty("codeless.agent.repository-root", "."))));
    }
}
