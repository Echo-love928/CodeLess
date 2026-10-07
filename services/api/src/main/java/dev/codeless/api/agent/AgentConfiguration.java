package dev.codeless.api.agent;

import dev.codeless.api.model.*;
import dev.codeless.api.tasks.TaskStageRunner;
import dev.codeless.api.tools.*;
import java.nio.file.Path;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
@ConditionalOnProperty(name="codeless.agent.enabled",havingValue="true")
public class AgentConfiguration {
    @Bean AgentJournal agentJournal(Environment env) {return new AgentJournal(root(env).resolve("journal"));}
    @Bean AgentRunStore agentRunStore(JdbcClient jdbc,PlatformTransactionManager manager,AgentJournal journal) {
        return new AgentRunStore(jdbc,manager,journal);
    }
    @Bean AgentModel agentModel(ModelProvider provider,ModelCallRepository records,ModelCallAudit audit,AgentRunStore store) {
        return new AgentModel(provider,records,audit,store);
    }
    @Bean BuildGateway agentBuildGateway(Environment env) {
        return new LocalBuildGateway(env.getProperty("codeless.agent.node","node"),
                Path.of(env.getRequiredProperty("codeless.agent.repository-root")),root(env));
    }
    @Bean AgentEvidence agentEvidence(Environment env) {return new AgentEvidence(root(env));}
    @Bean TaskStageRunner agentLoop(AgentRunStore store,AgentModel model,PlanValidator validator,FileToolRegistry registry,
                                   FileToolService files,BuildGateway gateway,AgentEvidence evidence) {
        return new AgentLoop(store,model,validator,registry,files,gateway,evidence);
    }
    private static Path root(Environment env) {return Path.of(env.getRequiredProperty("codeless.agent.private-root")).toAbsolutePath().normalize();}
}
