package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import java.nio.file.Files;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Opt-in real compose cleanup regression; an expected diagnostic failure must keep Node nonzero. */
class HttpDiagnosticsCleanupIT extends PreviewPlatformIntegrationTest {
    @Override protected String acceptanceScript(){return "../../tests/agent/repair/preview-platform-http-write-failure.acceptance.mjs";}
    @Override @Test void realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures() throws Exception {
        var failure=assertThrows(AssertionError.class,()->super.realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures());
        assertThat(failure.getMessage()).contains("Ingress diagnostics could not be captured or persisted.","but was: 1");
        var cleanup=json.readTree(Files.readString(ROOT.resolve("evidence/cleanup-observed.json")));
        assertThat(cleanup.path("downExitCode").asInt(-1)).isZero();
        for(String resource:java.util.List.of("containers","networks")) {
            assertThat(cleanup.path(resource).path("exitCode").asInt(-1)).isZero();
            assertThat(cleanup.path(resource).path("remaining").asInt(-1)).isZero();
        }
        var acceptance=json.readTree(Files.readString(ROOT.resolve("evidence/acceptance.json")));
        for(String field:java.util.List.of("realDockerBuild","realBrowserVerification","residentRestartPassed","retentionRevocationPassed","publicInternalDenied"))
            assertThat(acceptance.path(field).asBoolean()).isTrue();
        UUID task=UUID.fromString(acceptance.path("taskId").asText());
        assertThat(jdbc.sql("SELECT status FROM generation_tasks WHERE id=?").param(task).query(String.class).single()).isEqualTo("READY");
        Files.writeString(ROOT.resolve("evidence/D10-A-cleanup-failure-real.json"),json.writeValueAsString(Map.of(
            "modelProvider","deterministic-mock","modelQualityEvidence",false,"realModelCalls",0,"expectedNodeExitCode",1,
            "diagnosticFailurePreserved",true,"cleanup",cleanup,"acceptance",acceptance)));
        System.out.println("Real diagnostic failure cleanup evidence: "+ROOT.resolve("evidence"));
    }
}
