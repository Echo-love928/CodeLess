package d28.fixture;

import dev.codeless.api.CodeLessApiApplication;
import dev.codeless.api.model.*;
import java.time.Duration;
import java.util.Map;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.boot.SpringApplication;
import org.springframework.context.annotation.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Explicit test-only proposals. Actual PG, tools, Docker and Chromium decide outcomes. */
@Configuration
public class D28FixtureApplication {
    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(CodeLessApiApplication.class, D28FixtureApplication.class);
        application.run(args);
    }
    @Bean org.springframework.boot.ApplicationRunner secondOrdinaryUser(
            dev.codeless.api.auth.AuthAccountRepository accounts,
            org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder encoder) {
        return args -> accounts.seed("second@codeless.local", "Second fixture user",
                encoder.encode("demo-password-for-test-only"), "USER");
    }
    @Bean @Primary dev.codeless.api.deploy.DeploymentGateway localHosting(org.springframework.core.env.Environment env) {
        var repo = java.nio.file.Path.of(env.getRequiredProperty("codeless.agent.repository-root"));
        return new dev.codeless.api.deploy.NodeDeploymentGateway(java.nio.file.Path.of(env.getRequiredProperty("codeless.agent.node")),
                repo.resolve("tests/e2e/full/hosting-cli.mjs"), java.nio.file.Path.of(env.getRequiredProperty("CODELESS_HOSTING_ROOT")),
                env.getRequiredProperty("CODELESS_PUBLICATION_ORIGIN"), env.getRequiredProperty("CODELESS_PLATFORM_ORIGIN"),
                env.getRequiredProperty("CODELESS_PREVIEW_ORIGIN"));
    }
    @Bean @Primary ModelProvider repairFixture() {
        return new ModelProvider() {
            final MockModelProvider mock = new MockModelProvider();
            final JsonMapper json = JsonMapper.builder().build();
            public String id() { return "deterministic-mock"; }
            public String model() { return "d28-explicit-broken-import-repair-fixture"; }
            public Reply call(Prompt prompt, int limit, Duration timeout) {
                var input = json.readTree(prompt.getUserMessage().getText());
                String request = input.path("request").asText();
                String phase = input.path("phase").asText();
                String content;
                if (phase.equals("REPAIR")) {
                    if (request.contains("D20_BUILD_FAILURE")) content = "{\"type\":\"done\"}";
                    else {
                        var source = input.path("repairSources").path("files").valueStream()
                                .filter(f -> f.path("path").asText().equals("src/pages/HomePage.vue"))
                                .findFirst().orElseThrow();
                        content = json.writeValueAsString(Map.of("type", "tool", "name", "files.update", "arguments", Map.of(
                                "path", "src/pages/HomePage.vue", "expectedDigest", source.path("digest").asText(),
                                "content", source.path("content").asText().replace("D28MissingCard.vue", "ProfileCard.vue"))));
                    }
                } else {
                    var reply = mock.call(prompt, limit, timeout);
                    var output = json.readTree(reply.content());
                    var arguments = output.path("arguments");
                    if (phase.equals("GENERATE") && request.contains("D28_AUTO_REPAIR")
                            && arguments.path("path").asText().equals("src/pages/HomePage.vue"))
                        ((ObjectNode) arguments).put("content", arguments.path("content").asText().replace("ProfileCard.vue", "D28MissingCard.vue"));
                    if (phase.equals("GENERATE") && request.contains("D20_BUILD_FAILURE")
                            && output.path("name").asText().equals("files.update"))
                        ((ObjectNode) arguments).put("content", "<script setup lang=\"ts\">const broken = ;</script><template><p>broken</p></template>");
                    content = output.toString();
                }
                // Declared synthetic fixture accounting, not measured model tokens.
                // Unknown usage conservatively exhausts the production budget before
                // a fifth repair call. Never weaken that production reservation.
                return new Reply(content, new Evidence(model(), "d28-explicit-synthetic-usage-fixture", "d28-explicit-synthetic-usage-fixture",
                        new Usage(100, 100, 200, json.valueToTree(Map.of("measurement", "DECLARED_SYNTHETIC_NOT_MEASURED", "paidRequests", 0)))));
            }
        };
    }
}
