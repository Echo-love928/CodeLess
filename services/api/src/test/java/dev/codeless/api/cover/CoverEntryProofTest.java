package dev.codeless.api.cover;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.auth.AuthFailure;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.json.JsonMapper;

class CoverEntryProofTest {
    final JsonMapper json = JsonMapper.builder().build();
    final UUID task = UUID.randomUUID(), version = UUID.randomUUID(), build = UUID.randomUUID(), verification = UUID.randomUUID();
    final String source = "sha256:" + "1".repeat(64), artifact = "sha256:" + "2".repeat(64);
    List<JsonNode> fixture(String path) {
        var browser = new LinkedHashMap<String,Object>();
        browser.put("id", verification); browser.put("buildId", build); browser.put("sourceDigest", source); browser.put("artifactDigest", artifact);
        browser.put("status", "PASSED"); browser.put("failure", null); browser.put("workerExitCode", 0); browser.put("timedOut", false);
        browser.put("cleanup", Map.of("browserClosed", true));
        browser.put("diagnostics", Map.of("actions", List.of(Map.of("index", 0, "type", "navigate", "status", "PASSED"),
                Map.of("index", 1, "type", "expectVisible", "status", "PASSED"))));
        return new ArrayList<>(List.of(json.valueToTree(Map.of("taskId", task, "sequence", 1, "kind", "draft", "payload",
                Map.of("versionId", version, "sourceDigest", source, "actions", List.of(Map.of("type", "navigate", "path", path),
                        Map.of("type", "expectVisible", "target", Map.of("text", "Test fixture")))))),
                json.valueToTree(Map.of("taskId", task, "sequence", 2, "kind", "runner.result", "payload", Map.of("status", "VERIFIED", "sourceDigest", source,
                        "build", Map.of("id", build, "status", "SUCCEEDED", "exitCode", 0), "verification", browser)))));
    }
    String resolve(List<JsonNode> events) { return CoverEntryProof.resolve(task, version, build, source, artifact, verification, events); }
    @Test void threeControlledNativeEntriesRemainExact() { for (var path : List.of("/", "/tasks", "/catalog")) assertThat(resolve(fixture(path))).isEqualTo(path); }
    @Test void externalAndAmbiguousPathsCannotGainCaptureAuthority() {
        for (var path : List.of("http://127.0.0.1/", "//169.254.169.254/", "/tasks?x=1", "/tasks#x", "/catalog/../tasks"))
            assertThatThrownBy(() -> resolve(fixture(path))).isInstanceOf(AuthFailure.class).hasMessage("COVER_ENTRY_UNAVAILABLE");
        var events = fixture("/tasks"); var actions = (tools.jackson.databind.node.ArrayNode)events.getFirst().path("payload").path("actions");
        actions.set(1, json.valueToTree(Map.of("type", "navigate", "path", "/")));
        ((ObjectNode)events.getLast().path("payload").path("verification").path("diagnostics").path("actions").get(1)).put("type", "navigate");
        assertThatThrownBy(() -> resolve(events)).isInstanceOf(AuthFailure.class);
    }
    @Test void wrongVersionSourceArtifactOrTaskIsNotNativeProof() {
        for (var key : List.of("versionId", "sourceDigest")) {
            var events = fixture("/tasks"); ((ObjectNode)events.getFirst().path("payload")).put(key, "wrong");
            assertThatThrownBy(() -> resolve(events)).isInstanceOf(AuthFailure.class);
        }
        var wrong = fixture("/tasks"); ((ObjectNode)wrong.getLast().path("payload").path("verification")).put("artifactDigest", "wrong");
        assertThatThrownBy(() -> resolve(wrong)).isInstanceOf(AuthFailure.class);
        var foreign = fixture("/tasks"); ((ObjectNode)foreign.getFirst()).put("taskId", UUID.randomUUID().toString());
        assertThatThrownBy(() -> resolve(foreign)).isInstanceOf(AuthFailure.class);
    }
    @Test void failuresMissingOutcomesAndNumericCoercionNeverBecomePassedEvidence() {
        var failed = fixture("/tasks"); ((ObjectNode)failed.getLast().path("payload").path("verification")).put("status", "FAILED");
        assertThatThrownBy(() -> resolve(failed)).isInstanceOf(AuthFailure.class);
        var outcomes = fixture("/tasks"); ((ObjectNode)outcomes.getLast().path("payload").path("verification").path("diagnostics")).remove("actions");
        assertThatThrownBy(() -> resolve(outcomes)).isInstanceOf(AuthFailure.class);
        var coerced = fixture("/tasks"); ((ObjectNode)coerced.getFirst()).put("sequence", "1");
        assertThatThrownBy(() -> resolve(coerced)).isInstanceOf(AuthFailure.class);
    }
}
