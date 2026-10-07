package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.assertThat;
import dev.codeless.api.agent.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tools.FileToolService;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.json.JsonMapper;

/** Opt-in offline regression for fault timing. Database, file tools, build, browser and preview stay real. */
@Import(FaultAtFreezePreviewAcceptanceIT.FixtureConfiguration.class)
class FaultAtFreezePreviewAcceptanceIT extends PreviewPlatformIntegrationTest {
    @Autowired RealRepairPreviewPlatformAcceptanceIT.RealFaultProvider faultProvider;
    @Override protected String acceptanceScript(){return "../../tests/e2e/generation/m1-platform.acceptance.mjs";}
    @Override @Test void realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures() throws Exception {
        super.realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures();
        var acceptance=json.readTree(Files.readString(ROOT.resolve("evidence/acceptance.json")));
        UUID task=UUID.fromString(acceptance.path("taskId").asText());var events=new AgentJournal(ROOT.resolve("private/journal")).read(task);
        var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
        var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
        assertThat(faultProvider.injected.get()).isEqualTo(1);assertThat(drafts).hasSize(2);assertThat(results).hasSize(2);
        assertThat(drafts.getFirst().path("actions")).isEqualTo(drafts.getLast().path("actions"));
        assertThat(results.getFirst().path("build").path("exitCode").asInt(-1)).isPositive();
        assertThat(results.getFirst().path("build").path("log").path("text").asText()).contains("M1MissingCard.vue");
        assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        assertThat(acceptance.path("versionId")).isEqualTo(drafts.getLast().path("versionId"));
        assertThat(jdbc.sql("SELECT repair_attempts FROM generation_tasks WHERE id=?").param(task).query(Integer.class).single()).isEqualTo(1);
        var generated=events.stream().filter(e->e.path("stage").asText().equals("GENERATE")&&e.path("kind").asText().equals("model.response"))
            .filter(e->e.path("payload").path("arguments").path("path").asText().equals("src/pages/HomePage.vue")).toList();
        assertThat(generated).hasSize(1);assertThat(generated.getFirst().path("payload").path("arguments").path("content").asText()).doesNotContain("M1MissingCard.vue");
        var fault=json.readTree(Files.readString(ROOT.resolve("evidence/controlled-fault.json")));
        assertThat(fault.path("timing").asText()).isEqualTo("AFTER_GENERATE_DONE_BEFORE_IMMUTABLE_SNAPSHOT");
        assertThat(RuntimeBudget.meter(events).tools()).isEqualTo(12);assertThat(RuntimeBudget.meter(events).models()).isEqualTo(7);
        Files.writeString(ROOT.resolve("evidence/late-fault-regression.json"),json.writeValueAsString(Map.of("modelProvider","deterministic-mock",
            "modelQualityEvidence",false,"taskId",task,"repairAttempts",1,"models",7,"tools",12,"sourceDigests",drafts.stream().map(d->d.path("sourceDigest").asText()).toList(),
            "firstBuildExit",results.getFirst().path("build").path("exitCode").asInt(),"lastBrowser","PASSED","originalActionsPreserved",true)));
        System.out.println("Late fault fixture evidence: "+ROOT.resolve("evidence"));
    }
    @TestConfiguration static class FixtureConfiguration {
        @Bean @Primary RealRepairPreviewPlatformAcceptanceIT.RealFaultProvider lateFaultFixture(FileToolService files,AgentRunStore store,JdbcClient jdbc) {
            var mapper=JsonMapper.builder().build();var mock=new MockModelProvider();
            ModelProvider delegate=new ModelProvider(){
                public String id(){return "deterministic-mock";}public String model(){return "d10-late-fault-fixture";}
                public Reply call(Prompt prompt,int max,Duration timeout){
                    var input=mapper.readTree(prompt.getUserMessage().getText());if(!input.path("phase").asText().equals("REPAIR")){var generated=mock.call(prompt,max,timeout);return new Reply(generated.content(),new Evidence(model(),"explicit-fixture","explicit-fixture",new Usage(31,17,48,mapper.valueToTree(Map.of("measurement","SYNTHETIC_FIXTURE_COUNTERS")))));}
                    assertThat(input.path("failure").path("diagnostic").asText()).contains("M1MissingCard.vue");int size=input.path("observations").size();String page="src/pages/HomePage.vue",content;
                    if(size==0)content=mapper.writeValueAsString(Map.of("type","tool","name","files.read","arguments",Map.of("path",page)));
                    else if(size==1){var actual=input.path("observations").get(0);content=mapper.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of("path",page,"content",actual.path("content").asText().replace("M1MissingCard.vue","ProfileCard.vue"),"expectedDigest",actual.path("afterDigest").asText())));}
                    else content=mapper.writeValueAsString(Map.of("type","done","actions",input.path("originalActions")));
                    return new Reply(content,new Evidence(model(),"explicit-fixture","explicit-fixture",new Usage(31,17,48,mapper.valueToTree(Map.of("measurement","SYNTHETIC_FIXTURE_COUNTERS")))));
                }
            };
            return new RealRepairPreviewPlatformAcceptanceIT.RealFaultProvider(delegate,files,store,jdbc,ROOT.resolve("evidence"));
        }
    }
}
