package dev.codeless.api.tools;

import java.nio.file.Path;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
public class FileToolConfiguration {
    @Bean ControlledWorkspace controlledWorkspace(Environment env) {
        return new ControlledWorkspace(Path.of(env.getProperty("CODELESS_FILE_WORKSPACE_ROOT", ".local-data/file-workspaces")));
    }
    @Bean FileToolAudit fileToolAudit(Environment env) {
        return new FileToolAudit(Path.of(env.getProperty("CODELESS_FILE_AUDIT_ROOT", ".local-data/file-tool-audit")));
    }
}
