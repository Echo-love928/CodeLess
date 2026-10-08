package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.assertThat;
import dev.codeless.api.agent.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.*;
import org.springframework.test.context.TestPropertySource;

/** Explicit unpaid diagnostic run; inherits every original fault/restart/retention/isolation assertion. */
@ExtendWith(OutputCaptureExtension.class)
@TestPropertySource(properties={"codeless.diagnostics.csrf.enabled=true","codeless.diagnostics.application.enabled=true"})
class ApplicationHttpDiagnosticsIT extends FaultAtFreezePreviewAcceptanceIT {
    CapturedOutput captured;
    @BeforeEach void capture(CapturedOutput output){captured=output;}
    @Override protected String acceptanceScript(){return "../../tests/agent/repair/preview-http-diagnostics.acceptance.mjs";}
    @Override @Test void realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures() throws Exception {
        boolean accepted=false;
        try {
            super.realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures();
            var timings=json.readTree(Files.readString(ROOT.resolve("evidence/ingress-api-timings.json")));
            assertThat(timings.path("captureExitCode").asInt(-1)).isZero();assertThat(timings.path("instrumented").asBoolean()).isTrue();
            assertThat(timings.path("truncated").asBoolean()).isFalse();
            assertThat(timings.path("entries").toString()).contains("application","csrf");accepted=true;
        } finally {
            Path directory=ROOT.resolve("evidence");Files.createDirectories(directory);
            String lines=captured.getAll().lines().filter(line->line.contains(" : application.lifecycle phase=")||line.contains(" : csrf.lifecycle phase=")||line.contains(" : task.lifecycle phase="))
                    .reduce("",(all,line)->all+line+"\n");
            Files.writeString(directory.resolve("api-lifecycle.log"),lines);
            if(Files.exists(directory.resolve("task.json"))) {
                var task=json.readTree(Files.readString(directory.resolve("task.json")));UUID id=UUID.fromString(task.path("id").asText());
                var events=new AgentJournal(ROOT.resolve("private/journal")).read(id);
                var extra=new LinkedHashMap<String,Object>();extra.put("completeAcceptancePassed",accepted);extra.put("realModelCalls",0);
                extra.put("historical504RootCause","UNKNOWN");extra.put("historicalApplicationGetRootCause","UNKNOWN");
                extra.put("ingressTimings",Files.exists(directory.resolve("ingress-api-timings.json"))?json.readTree(Files.readString(directory.resolve("ingress-api-timings.json"))):"NOT_CAPTURED");
                if(Files.exists(directory.resolve("acceptance.json")))extra.put("acceptance",json.readTree(Files.readString(directory.resolve("acceptance.json"))));
                Files.writeString(directory.resolve("D10-A-application-http.json"),json.writeValueAsString(Map.of("task",task,"events",events,
                        "budget",RuntimeBudget.meter(events),"modelProvider","deterministic-mock","modelQualityEvidence",false,"extra",extra)));
            }
            System.out.println("Unpaid application HTTP diagnostics evidence: "+directory);
        }
    }
}
