package dev.codeless.api.preview;

import dev.codeless.api.model.*;
import java.time.Duration;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.json.JsonMapper;

/** Opt-in D11 real panel wiring: only named model proposals are fixtures. */
@Import(D11VersionPanelAcceptanceIT.FixtureConfiguration.class)
@TestPropertySource(properties="codeless.agent.repair.enabled=false")
class D11VersionPanelAcceptanceIT extends PreviewPlatformIntegrationTest {
    @Override protected String acceptanceScript(){return "../../tests/e2e/versions/platform.acceptance.mjs";}
    @TestConfiguration static class FixtureConfiguration {
        @Bean @Primary ModelProvider versionPanelFixture() {
            return new ModelProvider() {
                final MockModelProvider mock=new MockModelProvider();
                final JsonMapper json=JsonMapper.builder().build();
                public String id(){return "deterministic-mock";}
                public String model(){return "d11-version-panel-fixture";}
                public Reply call(Prompt prompt,int max,Duration timeout) {
                    var input=json.readTree(prompt.getUserMessage().getText());
                    String content=mock.call(prompt,max,timeout).content();
                    if(input.path("request").asText().contains("D11-SECOND"))content=content.replace("Ada Lovelace","Hedy Lamarr");
                    var proposal=json.readTree(content);
                    var args=proposal.path("arguments");
                    if(args.path("path").asText().equals("src/components/ProfileCard.vue"))
                        ((tools.jackson.databind.node.ObjectNode)args).put("content",args.path("content").asText()+"<!-- <script>window.__sourceExecuted=true</script><img src=x onerror=\"window.__sourceExecuted=true\"> -->");
                    if(input.path("request").asText().contains("D11-FAIL")&&args.path("path").asText().equals("src/pages/HomePage.vue"))
                        ((tools.jackson.databind.node.ObjectNode)args).put("content",args.path("content").asText().replace("ProfileCard.vue","MissingCard.vue"));
                    return new Reply(proposal.toString(),new Evidence(model(),"explicit-d11-fixture","explicit-d11-fixture",Usage.unknown()));
                }
            };
        }
    }
}
