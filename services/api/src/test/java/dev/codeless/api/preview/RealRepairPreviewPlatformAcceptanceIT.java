package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.assertThat;
import dev.codeless.api.agent.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tools.FileToolService;
import dev.codeless.api.tasks.TaskQueueService;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Explicit paid evaluation. Every PLAN/GENERATE/REPAIR call is real; one host-injected missing import is disclosed. */
@Import(RealRepairPreviewPlatformAcceptanceIT.RealConfiguration.class)
class RealRepairPreviewPlatformAcceptanceIT extends RealPreviewPlatformAcceptanceIT {
    @Autowired RealFaultProvider faultProvider;
    @Override protected String acceptanceScript(){return "../../tests/e2e/generation/m1-platform.acceptance.mjs";}

    @Override @Test void realModelThroughAuthenticatedPlatformPreview() throws Exception {
        assertThat(System.getenv("CODELESS_M1_REAL_APPROVED")).as("Explicit synthetic payload/paid approval required").isEqualTo("1");
        boolean accepted=false;
        try {
            super.realModelThroughAuthenticatedPlatformPreview();
            var acceptance=json.readTree(Files.readString(ROOT.resolve("evidence/acceptance.json")));
            UUID task=UUID.fromString(acceptance.path("taskId").asText());
            assertThat(faultProvider.injected.get()).isEqualTo(1);
            assertThat(jdbc.sql("SELECT repair_attempts FROM generation_tasks WHERE id=?").param(task).query(Integer.class).single()).isBetween(1,3);
            assertThat(jdbc.sql("SELECT count(*) FROM generation_tasks").query(Integer.class).single()).isEqualTo(1);
            assertThat(jdbc.sql("SELECT count(*) FROM application_versions WHERE status='FAILED'").query(Integer.class).single()).isGreaterThanOrEqualTo(1);
            var events=new AgentJournal(ROOT.resolve("private/journal")).read(task);
            var drafts=events.stream().filter(e->e.path("kind").asText().equals("draft")).map(e->e.path("payload")).toList();
            var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
            assertThat(drafts).hasSizeBetween(2,4);assertThat(results).hasSize(drafts.size());
            assertThat(drafts).allSatisfy(draft->assertThat(draft.path("actions")).isEqualTo(drafts.getFirst().path("actions")));
            assertThat(drafts.getFirst().path("sourceDigest")).isNotEqualTo(drafts.getLast().path("sourceDigest"));
            assertThat(results.getFirst().path("build").path("exitCode").asInt(-1)).isPositive();
            assertThat(results.getFirst().path("build").path("log").path("text").asText()).contains("M1MissingCard.vue");
            assertThat(results.getLast().path("build").path("exitCode").asInt(-1)).isZero();
            assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
            assertThat(acceptance.path("versionId")).isEqualTo(drafts.getLast().path("versionId"));
            var budget=RuntimeBudget.meter(events);
            assertThat(budget.models()).isLessThanOrEqualTo(12);assertThat(budget.tools()).isLessThanOrEqualTo(20);assertThat(budget.chargedTokens()).isLessThanOrEqualTo(50000);
            assertThat(events.stream().filter(e->e.path("kind").asText().equals("model.usage")).map(e->e.path("stage").asText()).distinct().toList()).contains("PLAN","GENERATE","REPAIR");
            accepted=true;
        } finally {
            Path evidence=ROOT.resolve("evidence");Files.createDirectories(evidence);
            var started=Files.exists(evidence.resolve("started.json"))?json.readTree(Files.readString(evidence.resolve("started.json"))):null;
            var taskState=Files.exists(evidence.resolve("task.json"))?json.readTree(Files.readString(evidence.resolve("task.json"))):json.readTree("{\"status\":\"UNKNOWN\"}");
            var clientLastObserved=taskState;
            if(started!=null) {
                var authoritative=jdbc.sql("SELECT id,application_id,prompt,status,repair_attempts,failure_code FROM generation_tasks WHERE id=?")
                    .param(UUID.fromString(started.path("taskId").asText())).query((rs,n)->{var row=new LinkedHashMap<String,Object>();row.put("id",rs.getObject(1));row.put("applicationId",rs.getObject(2));row.put("prompt",rs.getString(3));row.put("status",rs.getString(4));row.put("repairAttempts",rs.getInt(5));row.put("failureCode",rs.getString(6));return row;}).single();
                taskState=json.valueToTree(authoritative);
            }
            var events=started==null?List.<JsonNode>of():new AgentJournal(ROOT.resolve("private/journal")).read(UUID.fromString(started.path("taskId").asText()));
            var acceptance=Files.exists(evidence.resolve("acceptance.json"))?json.readTree(Files.readString(evidence.resolve("acceptance.json"))):json.createObjectNode();
            var calls=Files.exists(evidence.resolve("model-calls.json"))?json.readTree(Files.readString(evidence.resolve("model-calls.json"))):json.createArrayNode();
            Files.writeString(evidence.resolve("D10-M1-real-same-task.json"),json.writeValueAsString(Map.of(
                "task",taskState,"events",events,"budget",RuntimeBudget.meter(events),"modelProvider","deepseek","modelQualityEvidence",accepted,
                "extra",Map.of("M1",accepted?"PASSED":"NOT_PASSED","controlledFaultInjected",faultProvider.injected.get(),
                    "faultOrigin","HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR","allModelStagesReal",true,"modelCalls",calls,"acceptance",acceptance,"clientLastObservedTask",clientLastObserved,"authoritativeTaskCaptured",started!=null))));
        }
    }

    @TestConfiguration static class RealConfiguration {
        @Bean @Primary RealFaultProvider realFaultProvider(FileToolService files,AgentRunStore store,JdbcClient jdbc) { return new RealFaultProvider(new DeepSeekModelProvider(System.getenv("CODELESS_MODEL_API_KEY"),System.getenv("CODELESS_MODEL_NAME")),files,store,jdbc,ROOT.resolve("evidence")); }
    }
    static final class RealFaultProvider implements ModelProvider {
        final ModelProvider delegate;final FileToolService files;final AgentRunStore store;final JdbcClient jdbc;final Path evidence;
        final AtomicInteger injected=new AtomicInteger();final JsonMapper mapper=JsonMapper.builder().build();
        final Pattern importPath=Pattern.compile(Pattern.quote("../components/ProfileCard.vue"));
        RealFaultProvider(ModelProvider delegate,FileToolService files,AgentRunStore store,JdbcClient jdbc,Path evidence){this.delegate=delegate;this.files=files;this.store=store;this.jdbc=jdbc;this.evidence=evidence;}
        public String id(){return delegate.id();}public String model(){return delegate.model();}
        public Reply call(Prompt prompt,int max,Duration timeout) {
            var reply=delegate.call(prompt,max,timeout);var input=mapper.readTree(prompt.getUserMessage().getText());var proposal=mapper.readTree(reply.content());
            // Inject only after the real generator is done. No later GENERATE call can repair it before VERIFY.
            if(injected.get()==0 && input.path("phase").asText().equals("GENERATE") && proposal.path("type").asText().equals("done")) {
                var active=jdbc.sql("SELECT id,lease_token FROM generation_tasks WHERE status='GENERATE' AND queue_state='RUNNING'")
                    .query((rs,n)->new TaskQueueService.Claim((UUID)rs.getObject(1),(UUID)rs.getObject(2),TaskStatus.GENERATE)).list();
                assertThat(active).hasSize(1);var claim=active.getFirst();String page="src/pages/HomePage.vue";
                store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);
                var read=files.execute(claim.taskId(),claim.token(),"files.read",mapper.writeValueAsString(Map.of("path",page)));
                store.append(claim,TaskStatus.GENERATE,"tool.result",read);assertThat(read.status()).isEqualTo("SUCCEEDED");
                String before=read.content();var match=importPath.matcher(before);assertThat(match.find()).as("Generated relative ProfileCard import").isTrue();
                String after=match.replaceFirst("../components/M1MissingCard.vue");
                store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);
                var update=files.execute(claim.taskId(),claim.token(),"files.update",mapper.writeValueAsString(Map.of("path",page,"content",after,"expectedDigest",read.afterDigest())));
                store.append(claim,TaskStatus.GENERATE,"tool.result",update);assertThat(update.status()).isEqualTo("SUCCEEDED");assertThat(injected.incrementAndGet()).isEqualTo(1);
                try {Files.createDirectories(evidence);Files.writeString(evidence.resolve("controlled-fault.json"),mapper.writeValueAsString(Map.of(
                    "path",page,"before",before,"after",after,"rawProviderDone",reply.content(),"beforeDigest",digest(before),"afterDigest",digest(after),
                    "timing","AFTER_GENERATE_DONE_BEFORE_IMMUTABLE_SNAPSHOT","origin","HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR")));}
                catch(java.io.IOException error){throw new IllegalStateException("Controlled fault evidence unavailable");}
            }
            return reply; // Every model reply, including done/actions, remains byte-for-byte unchanged.
        }
        static String digest(String text) {try{return "sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception error){throw new IllegalStateException(error);}}
    }
}
