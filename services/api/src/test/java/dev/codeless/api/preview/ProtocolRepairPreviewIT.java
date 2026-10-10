package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.agent.*;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.model.RecordedRepairWireFixture;
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

/** Zero-paid original PR31 actions through actual production wire, tools/build/browser and one signed preview task. */
@Import(ProtocolRepairPreviewIT.Configuration.class)
class ProtocolRepairPreviewIT extends PreviewPlatformIntegrationTest {
    @Autowired RecordedRepairFixture fixture;
    @Autowired RecordedRepairWireFixture wire;
    @Override @Test void realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures() throws Exception {
        runOriginalM1Acceptance();wire.assertHealthy();
        var acceptance=json.readTree(Files.readString(ROOT.resolve("evidence/acceptance.json")));UUID task=UUID.fromString(acceptance.path("taskId").asText());
        var events=new AgentJournal(ROOT.resolve("private/journal")).read(task);var meter=RuntimeBudget.meter(events);
        assertThat(meter.models()).isEqualTo(10);assertThat(meter.tools()).isEqualTo(15);assertThat(meter.chargedTokens()).isLessThanOrEqualTo(50000);
        assertThat(fixture.count).isEqualTo(10);assertThat(wire.requests).hasSize(10);
        var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
        var runs=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
        assertThat(drafts).hasSize(2);assertThat(runs).hasSize(2);assertThat(drafts.getFirst().path("actions")).isEqualTo(drafts.getLast().path("actions"));
        assertThat(runs.getFirst().path("build").path("exitCode").asInt(-1)).isEqualTo(2);assertThat(runs.getFirst().path("build").path("log").path("text").asText()).contains("M1MissingCard.vue");
        assertThat(runs.getLast().path("build").path("exitCode").asInt(-1)).isZero();assertThat(runs.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
        assertThat(drafts.getFirst().path("sourceDigest")).isNotEqualTo(drafts.getLast().path("sourceDigest"));assertThat(acceptance.path("versionId")).isEqualTo(drafts.getLast().path("versionId"));
        assertThat(jdbc.sql("SELECT count(*) FROM generation_tasks").query(Integer.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT status FROM generation_tasks WHERE id=?").param(task).query(String.class).single()).isEqualTo("READY");
        assertThat(acceptance.path("platformApiFixture").asBoolean()).isFalse();assertThat(acceptance.path("signingFixture").asBoolean()).isFalse();
        assertThat(acceptance.path("modelProvider").asText()).isEqualTo("recorded-source-replay");
        var fingerprints=events.stream().filter(e->e.path("kind").asText().equals("model.input")).map(e->e.path("payload")).toList();
        assertThat(fingerprints).hasSize(10);for(int i=0;i<10;i++)assertThat(fingerprints.get(i).path("transport").path("bodyDigest").asText()).isEqualTo(wire.digests.get(i));
        var usage=AgentJournal.latest(events,"model.usage");assertThat(usage.path("estimated").asBoolean()).isTrue();assertThat(usage.path("chargedTokens")).isEqualTo(usage.path("reservationTokens"));
        assertThat(acceptance.path("modelQualityAccepted").asBoolean()).isFalse();
        var report=new LinkedHashMap<String,Object>();report.put("taskId",task);report.put("events",events);report.put("budget",meter);report.put("acceptance",acceptance);
        report.put("originPaidTask","17f440cf-7970-46cc-b598-dd2d91a20ade");report.put("offlineWireRequests",wire.requests);report.put("wireDigests",wire.digests);
        report.put("modelProvider","deterministic-mock");report.put("measurement","REPLAY_AND_SYNTHETIC_FUTURE_NOT_PROVIDER_EVALUATION");report.put("paidCalls",0);report.put("outerRetries",0);report.put("modelQualityEvidence",false);report.put("historicalWireCaptured",false);
        Files.writeString(ROOT.resolve("evidence/D10-A-protocol31-context.json"),json.writeValueAsString(report));
        System.out.println("Protocol31 repair same-task evidence: "+ROOT.resolve("evidence"));
    }
    private void runOriginalM1Acceptance() throws Exception {
        // Existing recorded-source mode preserves real M1 text checks; mock mode requires fixture-only test IDs.
        var builder=new ProcessBuilder("node","../../tests/e2e/generation/m1-platform.acceptance.mjs");
        var env=builder.environment();env.remove("CODELESS_MODEL_API_KEY");env.remove("CODELESS_MODEL_NAME");
        env.put("CODELESS_PREVIEW_ACCEPTANCE_MODEL","recorded-source-replay");
        env.put("CODELESS_PREVIEW_API_INTERNAL_ORIGIN","http://127.0.0.1:"+port);
        env.put("CODELESS_AGENT_PRIVATE_ROOT",ROOT.resolve("private").toString());env.put("CODELESS_FILE_WORKSPACE_ROOT",ROOT.resolve("workspaces").toString());
        env.put("CODELESS_PREVIEW_EVIDENCE_DIR",ROOT.resolve("evidence").toString());env.put("CODELESS_PREVIEW_CONTROL_PORT",Integer.toString(CONTROL));env.put("CODELESS_PREVIEW_GATEWAY_PORT","0");
        env.put("CODELESS_PREVIEW_SIGNING_KEY","11".repeat(32));env.put("CODELESS_PREVIEW_REGISTRY_KEY","44".repeat(32));
        env.put("CODELESS_PREVIEW_ORIGIN","https://preview.codeless-preview.test:"+TLS);env.put("CODELESS_PLATFORM_ORIGIN","https://platform.codeless.test:"+TLS);
        Path log=ROOT.resolve("protocol-m1-platform.log");builder.redirectErrorStream(true).redirectOutput(log.toFile());
        try(var process=new PreviewAcceptanceProcess(builder,ROOT.resolve("acceptance-process"),ROOT.resolve("evidence"))) {
            assertThat(process.await(java.time.Duration.ofSeconds(840))).as(log.toString()).isTrue();
            assertThat(process.exitValue()).as(Files.readString(log)).isZero();
        }
    }
    @TestConfiguration static class Configuration {
        @Bean RecordedRepairFixture protocolRecording(FileToolService files,AgentRunStore store,JdbcClient jdbc) {
            var json=JsonMapper.builder().build();
            return new RecordedRepairFixture("patch",reply->{
                var active=jdbc.sql("SELECT id,lease_token FROM generation_tasks WHERE status='GENERATE' AND queue_state='RUNNING'").query((rs,n)->new TaskQueueService.Claim((UUID)rs.getObject(1),(UUID)rs.getObject(2),TaskStatus.GENERATE)).list();assertThat(active).hasSize(1);var claim=active.getFirst();String page="src/pages/HomePage.vue";
                store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);var read=files.execute(claim.taskId(),claim.token(),"files.read",json.writeValueAsString(Map.of("path",page)));store.append(claim,TaskStatus.GENERATE,"tool.result",read);assertThat(read.status()).isEqualTo("SUCCEEDED");
                store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);var write=files.execute(claim.taskId(),claim.token(),"files.update",json.writeValueAsString(Map.of("path",page,"content",read.content().replace("../components/ProfileCard.vue","../components/M1MissingCard.vue"),"expectedDigest",read.afterDigest())));
                store.append(claim,TaskStatus.GENERATE,"tool.result",write);assertThat(write.status()).isEqualTo("SUCCEEDED");
            },Path.of("../../docs/evidence/D10/M1/17f440cf-7970-46cc-b598-dd2d91a20ade"));
        }
        @Bean @Primary RecordedRepairWireFixture protocolWire(RecordedRepairFixture fixture) throws Exception {return new RecordedRepairWireFixture(fixture);}
    }
}
