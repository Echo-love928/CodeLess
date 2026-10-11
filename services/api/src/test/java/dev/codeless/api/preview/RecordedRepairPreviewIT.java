package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.agent.*;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.tasks.TaskQueueService;
import dev.codeless.api.tools.FileToolService;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.json.JsonMapper;

/** Opt-in zero-paid same-task acceptance using the recorded read loop plus an explicit synthetic patch. */
@Import(RecordedRepairPreviewIT.Configuration.class)
class RecordedRepairPreviewIT extends PreviewPlatformIntegrationTest {
    @Autowired RecordedRepairFixture fixture;
    @Override @Test void realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures() throws Exception {
        super.realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures();
        var acceptance=json.readTree(Files.readString(ROOT.resolve("evidence/acceptance.json")));UUID task=UUID.fromString(acceptance.path("taskId").asText());
        var events=new AgentJournal(ROOT.resolve("private/journal")).read(task);var meter=RuntimeBudget.meter(events);
        assertThat(meter.models()).isEqualTo(12);assertThat(meter.tools()).isEqualTo(17);assertThat(meter.chargedTokens()).isLessThanOrEqualTo(50000);assertThat(fixture.count).isEqualTo(12);
        var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
        assertThat(drafts).hasSize(2);assertThat(results).hasSize(2);assertThat(drafts.getFirst().path("actions")).isEqualTo(drafts.getLast().path("actions"));
        assertThat(results.getFirst().path("build").path("exitCode").asInt(-1)).isEqualTo(2);assertThat(results.getFirst().path("build").path("log").path("text").asText()).contains("M1MissingCard.vue");
        assertThat(results.getLast().path("build").path("exitCode").asInt(-1)).isZero();assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        assertThat(drafts.getFirst().path("sourceDigest")).isNotEqualTo(drafts.getLast().path("sourceDigest"));assertThat(acceptance.path("versionId")).isEqualTo(drafts.getLast().path("versionId"));
        assertThat(jdbc.sql("SELECT count(*) FROM generation_tasks").query(Integer.class).single()).isEqualTo(1);assertThat(jdbc.sql("SELECT repair_attempts FROM generation_tasks WHERE id=?").param(task).query(Integer.class).single()).isEqualTo(1);
        var usage=AgentJournal.latest(events,"model.usage");assertThat(usage.path("estimated").asBoolean()).isTrue();assertThat(usage.path("chargedTokens")).isEqualTo(usage.path("reservationTokens"));
        assertThat(acceptance.path("modelQualityAccepted").asBoolean()).isFalse();
        Files.writeString(ROOT.resolve("evidence/D10-A-recorded-context.json"),json.writeValueAsString(Map.of("taskId",task,"events",events,"budget",meter,"acceptance",acceptance,
                "originPaidTask","45d37a80-c152-4672-9c0c-1fcf425fa014","modelProvider","deterministic-mock","measurement","REPLAY_AND_SYNTHETIC_FUTURE_NOT_PROVIDER_EVALUATION","paidCalls",0,"outerRetries",0,"modelQualityEvidence",false)));
        System.out.println("Recorded repair/context same-task evidence: "+ROOT.resolve("evidence"));
    }
    @TestConfiguration static class Configuration {
        @Bean @Primary RecordedRepairFixture recordedRepairFixture(FileToolService files,AgentRunStore store,JdbcClient jdbc) {
            var json=JsonMapper.builder().build();
            return new RecordedRepairFixture("patch",reply->{
                var active=jdbc.sql("SELECT id,lease_token FROM generation_tasks WHERE status='GENERATE' AND queue_state='RUNNING'").query((rs,n)->new TaskQueueService.Claim((UUID)rs.getObject(1),(UUID)rs.getObject(2),TaskStatus.GENERATE)).list();assertThat(active).hasSize(1);var claim=active.getFirst();String page="src/pages/HomePage.vue";
                store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);var read=files.execute(claim.taskId(),claim.token(),"files.read",json.writeValueAsString(Map.of("path",page)));store.append(claim,TaskStatus.GENERATE,"tool.result",read);assertThat(read.status()).isEqualTo("SUCCEEDED");
                assertThat(read.content()).contains("../components/ProfileCard.vue");
                store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);var write=files.execute(claim.taskId(),claim.token(),"files.update",json.writeValueAsString(Map.of("path",page,"content",read.content().replace("../components/ProfileCard.vue","../components/M1MissingCard.vue"),"expectedDigest",read.afterDigest())));
                store.append(claim,TaskStatus.GENERATE,"tool.result",write);assertThat(write.status()).isEqualTo("SUCCEEDED");
            });
        }
    }
}
