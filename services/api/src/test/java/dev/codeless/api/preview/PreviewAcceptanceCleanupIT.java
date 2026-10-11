package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;

/** Opt-in actual browser-close failure; original assertions are not relaxed. Model remains mock. */
class PreviewAcceptanceCleanupIT extends PreviewPlatformIntegrationTest {
    @Override protected String acceptanceScript(){return "../../tests/e2e/generation/fixtures/cleanup-failure.acceptance.mjs";}
    @Override @Test void realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures() throws Exception {
        Throwable original=catchThrowable(()->super.realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures());
        assertThat(original).isInstanceOf(AssertionError.class).hasMessageContaining("B_BROWSER_CLEANUP_FAULT");
        var cleanup=json.readTree(Files.readString(ROOT.resolve("evidence/resource-cleanup.json")));
        assertThat(cleanup.path("complete").asBoolean()).isFalse();
        assertThat(cleanup.path("steps").get(0).path("name").asText()).isEqualTo("browser");
        assertThat(cleanup.path("steps").get(0).path("state").asText()).isEqualTo("FAILED");
        for(String kind:java.util.List.of("containers","networks"))assertThat(cleanup.path("resources").path(kind).path("remaining").asInt(-1)).isZero();
        var fallback=json.readTree(Files.readString(ROOT.resolve("evidence/java-project-cleanup.json")));
        assertThat(fallback.path("state").asText()).isEqualTo("OWNED");assertThat(fallback.path("complete").asBoolean()).isTrue();
        var process=json.readTree(Files.readString(ROOT.resolve("acceptance-process/process-result.json")));
        assertThat(process.path("nativeExitCode").asInt(-1)).isEqualTo(1);assertThat(process.path("remaining").asInt(-1)).isZero();
        var acceptance=json.readTree(Files.readString(ROOT.resolve("evidence/acceptance.json")));
        assertThat(acceptance.path("modelProvider").asText()).isEqualTo("deterministic-mock");assertThat(acceptance.path("modelQualityAccepted").asBoolean()).isFalse();
        assertThat(jdbc.sql("SELECT status FROM generation_tasks WHERE id=?").param(java.util.UUID.fromString(acceptance.path("taskId").asText())).query(String.class).single()).isEqualTo("READY");
        Files.writeString(ROOT.resolve("evidence/B-shared-cleanup-fault.json"),json.writeValueAsString(java.util.Map.of("fixture",true,"realDocker",true,"realBrowser",true,"modelCallsPaid",0,"originalNodeExit",1,"completePlatformAcceptancePassed",false,"cleanup",cleanup,"fallback",fallback,"process",process)));
    }
}
