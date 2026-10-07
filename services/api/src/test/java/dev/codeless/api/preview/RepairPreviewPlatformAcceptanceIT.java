package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.assertThat;
import dev.codeless.api.agent.AgentJournal;
import dev.codeless.api.agent.RuntimeBudget;
import dev.codeless.api.model.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import tools.jackson.databind.json.JsonMapper;

/** Opt-in same-task wiring acceptance. Only the named model fixture is fake; no model-quality claim. */
@Import(RepairPreviewPlatformAcceptanceIT.RepairConfiguration.class)
class RepairPreviewPlatformAcceptanceIT extends PreviewPlatformIntegrationTest {
    private static final String PAGE="src/pages/HomePage.vue";
    private static final String BROKEN="<script setup lang=\"ts\">import ProfileCard from '../components/MissingCard.vue';</script><template><main><ProfileCard/></main></template>";
    private static final String FIXED=BROKEN.replace("MissingCard.vue","ProfileCard.vue");

    @Override @Test void realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures() throws Exception {
        super.realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures();
        var report=json.readTree(Files.readString(ROOT.resolve("evidence/acceptance.json")));
        UUID task=UUID.fromString(report.path("taskId").asText());
        assertThat(jdbc.sql("SELECT repair_attempts FROM generation_tasks WHERE id=?").param(task).query(Integer.class).single()).isEqualTo(1);
        var events=new AgentJournal(ROOT.resolve("private/journal")).read(task);
        var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
        var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
        assertThat(drafts).hasSize(2);assertThat(results).hasSize(2);
        assertThat(drafts.getFirst().path("actions")).isEqualTo(drafts.getLast().path("actions"));
        assertThat(drafts.getFirst().path("sourceDigest")).isNotEqualTo(drafts.getLast().path("sourceDigest"));
        assertThat(results.getFirst().path("build").path("log").path("text").asText()).contains("MissingCard.vue");
        assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        assertThat(report.path("versionId")).isEqualTo(drafts.getLast().path("versionId"));
        assertThat(jdbc.sql("SELECT count(*) FROM generation_tasks").query(Integer.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM application_versions WHERE status='FAILED'").query(Integer.class).single()).isEqualTo(1);
        var providers=jdbc.sql("SELECT DISTINCT provider, model FROM model_calls WHERE task_id=?").param(task)
                .query((rs,n)->Map.of("provider",rs.getString(1),"model",rs.getString(2))).list();
        assertThat(providers).containsExactly(Map.of("provider","deterministic-mock","model","d10-same-task-repair-fixture"));
        Files.writeString(ROOT.resolve("evidence/D10-A-same-task.json"),json.writeValueAsString(Map.of(
                "task",json.readTree(Files.readString(ROOT.resolve("evidence/task.json"))),"events",events,
                "budget",RuntimeBudget.meter(events),"modelProvider","deterministic-mock","modelQualityEvidence",false,
                "extra",Map.of("realAuthenticatedUi",true,"platformApiFixture",false,"signingFixture",false,
                        "sameTask",true,"generationTasks",1,"repairAttempts",1,"acceptance",report))));
        System.out.println("Same-task repair/preview fixture evidence: "+ROOT.resolve("evidence"));
    }

    @TestConfiguration static class RepairConfiguration {
        @Bean @Primary ModelProvider sameTaskRepairFixture() {
            return new ModelProvider() {
                final MockModelProvider mock=new MockModelProvider();
                final JsonMapper json=JsonMapper.builder().build();
                public String id(){return "deterministic-mock";}
                public String model(){return "d10-same-task-repair-fixture";}
                public Reply call(Prompt prompt,int max,Duration timeout) {
                    var input=json.readTree(prompt.getUserMessage().getText());String content;
                    if(!input.path("phase").asText().equals("REPAIR")) {
                        var proposal=json.readTree(mock.call(prompt,max,timeout).content());
                        if(proposal.path("arguments").path("path").asText().equals(PAGE))
                            ((tools.jackson.databind.node.ObjectNode)proposal.path("arguments")).put("content",BROKEN);
                        content=proposal.toString();
                    } else {
                        assertThat(input.path("failure").path("diagnostic").asText()).contains("MissingCard.vue");
                        int observed=input.path("observations").size();
                        if(observed==0)content=json.writeValueAsString(Map.of("type","tool","name","files.read","arguments",Map.of("path",PAGE)));
                        else if(observed==1) {
                            var actual=input.path("observations").get(0);assertThat(actual.path("content").asText()).isEqualTo(BROKEN);
                            content=json.writeValueAsString(Map.of("type","tool","name","files.update","arguments",Map.of(
                                    "path",PAGE,"content",FIXED,"expectedDigest",actual.path("afterDigest").asText())));
                        } else content=json.writeValueAsString(Map.of("type","done","actions",input.path("originalActions")));
                    }
                    return new Reply(content,new Evidence(model(),"explicit-same-task-fixture","explicit-same-task-fixture",
                            new Usage(31,17,48,json.valueToTree(Map.of("fixture",true,"measurement","SYNTHETIC_FIXTURE_COUNTERS")))));
                }
            };
        }
    }
}
