package d20.fixture;

import dev.codeless.api.CodeLessApiApplication;
import dev.codeless.api.deploy.DeploymentGateway;
import dev.codeless.api.deploy.NodeDeploymentGateway;
import dev.codeless.api.model.*;
import java.nio.file.Path;
import java.time.Duration;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.boot.SpringApplication;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Test-only composition; never packaged in the API or enabled by a production profile. */
@Configuration
public class FixtureApplication {
    public static void main(String[] args) {
        SpringApplication.run(new Class<?>[]{CodeLessApiApplication.class, FixtureApplication.class}, args);
    }

    @Bean org.springframework.boot.ApplicationRunner secondOrdinaryUser(
            dev.codeless.api.auth.AuthAccountRepository accounts,
            org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder encoder) {
        return args -> accounts.seed("second@codeless.local", "Second fixture user",
                encoder.encode("demo-password-for-test-only"), "USER");
    }

    @Bean @Primary ModelProvider fullDeterministicMock() {
        return new ModelProvider() {
            final MockModelProvider delegate = new MockModelProvider();
            final JsonMapper json = JsonMapper.builder().build();
            public String id() { return "deterministic-mock"; }
            public String model() { return "d20-full-fixture-v1"; }
            public Reply call(Prompt prompt, int limit, Duration timeout) {
                var reply = delegate.call(prompt, limit, timeout);
                var input = json.readTree(prompt.getUserMessage().getText());
                var output = json.readTree(reply.content());
                if (input.path("request").asText().contains("D20_BUILD_FAILURE")
                        && "GENERATE".equals(input.path("phase").asText())
                        && "files.update".equals(output.path("name").asText())) {
                    ((ObjectNode) output.path("arguments")).put("content", "<script setup lang=\"ts\">const broken = ;</script><template><p>broken</p></template>");
                    return new Reply(output.toString(), reply.evidence());
                }
                return reply;
            }
        };
    }

    // The production adapter and immutable writer execute unchanged. Only the network
    // probe entry is a named loopback TLS fixture, since production rejects private DNS.
    @Bean @Primary DeploymentGateway fullLocalHttpsHosting(Environment env) {
        Path repo = Path.of(env.getRequiredProperty("codeless.agent.repository-root"));
        return new NodeDeploymentGateway(Path.of(env.getRequiredProperty("codeless.agent.node")),
                repo.resolve("tests/e2e/full/hosting-cli.mjs"), Path.of(env.getRequiredProperty("CODELESS_HOSTING_ROOT")),
                env.getRequiredProperty("CODELESS_PUBLICATION_ORIGIN"), env.getRequiredProperty("CODELESS_PLATFORM_ORIGIN"),
                env.getRequiredProperty("CODELESS_PREVIEW_ORIGIN"));
    }
}
