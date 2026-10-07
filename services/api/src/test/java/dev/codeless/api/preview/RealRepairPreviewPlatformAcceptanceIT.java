package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.assertThat;
import dev.codeless.api.agent.*;
import dev.codeless.api.model.*;
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
            var events=started==null?List.<JsonNode>of():new AgentJournal(ROOT.resolve("private/journal")).read(UUID.fromString(started.path("taskId").asText()));
            var acceptance=Files.exists(evidence.resolve("acceptance.json"))?json.readTree(Files.readString(evidence.resolve("acceptance.json"))):json.createObjectNode();
            var calls=Files.exists(evidence.resolve("model-calls.json"))?json.readTree(Files.readString(evidence.resolve("model-calls.json"))):json.createArrayNode();
            Files.writeString(evidence.resolve("D10-M1-real-same-task.json"),json.writeValueAsString(Map.of(
                "task",taskState,"events",events,"budget",RuntimeBudget.meter(events),"modelProvider","deepseek","modelQualityEvidence",accepted,
                "extra",Map.of("M1",accepted?"PASSED":"NOT_PASSED","controlledFaultInjected",faultProvider.injected.get(),
                    "faultOrigin","HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR","allModelStagesReal",true,"modelCalls",calls,"acceptance",acceptance))));
        }
    }

    @TestConfiguration static class RealConfiguration {
        @Bean @Primary RealFaultProvider realFaultProvider() { return new RealFaultProvider(); }
    }
    static final class RealFaultProvider implements ModelProvider {
        final ModelProvider delegate=new DeepSeekModelProvider(System.getenv("CODELESS_MODEL_API_KEY"),System.getenv("CODELESS_MODEL_NAME"));
        final AtomicInteger injected=new AtomicInteger();
        final JsonMapper mapper=JsonMapper.builder().build();
        final Pattern importPath=Pattern.compile("(['\"])(\\.\\./components/ProfileCard\\.vue)\\1");
        public String id(){return delegate.id();}public String model(){return delegate.model();}
        public Reply call(Prompt prompt,int max,Duration timeout) {
            // No outer retry: the production delegate owns the exact bounded request.
            var reply=delegate.call(prompt,max,timeout);var input=mapper.readTree(prompt.getUserMessage().getText());
            var proposal=mapper.readTree(reply.content());
            if(injected.get()==0 && input.path("phase").asText().equals("GENERATE") && proposal.path("type").asText().equals("tool")
                    && List.of("files.create","files.update").contains(proposal.path("name").asText())
                    && proposal.path("arguments").path("path").asText().equals("src/pages/HomePage.vue")) {
                String before=proposal.path("arguments").path("content").asText();var match=importPath.matcher(before);
                if(match.find()) {
                    String after=match.replaceFirst("$1../components/M1MissingCard.vue$1");
                    assertThat(before).isNotEqualTo(after);assertThat(injected.incrementAndGet()).isEqualTo(1);
                    Path evidence=ROOT.resolve("evidence");try {Files.createDirectories(evidence);Files.writeString(evidence.resolve("controlled-fault.json"),mapper.writeValueAsString(Map.of(
                        "path","src/pages/HomePage.vue","before",before,"after",after,"rawProviderReply",reply.content(),
                        "beforeDigest",digest(before),"afterDigest",digest(after),"origin","HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR")));}
                    catch(java.io.IOException error){throw new IllegalStateException("Controlled fault evidence unavailable");}
                    ((tools.jackson.databind.node.ObjectNode)proposal.path("arguments")).put("content",after);
                    return new Reply(proposal.toString(),reply.evidence());
                }
            }
            return reply;
        }
        static String digest(String text) {try{return "sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception error){throw new IllegalStateException(error);}}
    }
}
