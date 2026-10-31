package dev.codeless.api.cover;

import dev.codeless.api.auth.AuthFailure;
import java.util.*;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.JsonNode;

/** Read only the platform's own immutable journal; external records are not authorization. */
public final class CoverEntryProof {
    private CoverEntryProof() {}
    private static void require(boolean value) {
        if (!value) throw new AuthFailure(HttpStatus.SERVICE_UNAVAILABLE, "COVER_ENTRY_UNAVAILABLE");
    }
    private static boolean text(JsonNode node, String value) { return node.isTextual() && value.equals(node.asText()); }
    public static String resolve(UUID task, UUID version, UUID build, String source, String artifact,
                                 UUID verificationId, List<JsonNode> events) {
        require(events != null && !events.isEmpty() && events.size() <= 160);
        for (int i = 0; i < events.size(); i++) {
            var event = events.get(i);
            require(event.path("sequence").isIntegralNumber() && event.path("sequence").canConvertToInt()
                    && event.path("sequence").asInt() == i + 1 && text(event.path("taskId"), task.toString()));
        }
        var drafts = events.stream().filter(e -> text(e.path("kind"), "draft")
                && text(e.path("payload").path("versionId"), version.toString())).toList();
        require(drafts.size() == 1);
        var draft = drafts.getFirst(); var payload = draft.path("payload");
        require(text(payload.path("sourceDigest"), source));
        var results = events.stream().filter(e -> text(e.path("kind"), "runner.result")
                && e.path("sequence").asInt() > draft.path("sequence").asInt()
                && text(e.path("payload").path("verification").path("id"), verificationId.toString())).toList();
        require(results.size() == 1);
        var run = results.getFirst().path("payload"); var verified = run.path("verification");
        require(text(run.path("status"), "VERIFIED") && text(run.path("sourceDigest"), source));
        require(text(run.path("build").path("id"), build.toString()) && text(run.path("build").path("status"), "SUCCEEDED")
                && run.path("build").path("exitCode").isIntegralNumber() && run.path("build").path("exitCode").asInt() == 0);
        require(text(verified.path("buildId"), build.toString()) && text(verified.path("sourceDigest"), source)
                && text(verified.path("artifactDigest"), artifact) && text(verified.path("status"), "PASSED")
                && verified.path("failure").isNull() && verified.path("workerExitCode").isIntegralNumber()
                && verified.path("workerExitCode").asInt() == 0 && verified.path("timedOut").isBoolean()
                && !verified.path("timedOut").asBoolean() && verified.path("cleanup").path("browserClosed").isBoolean()
                && verified.path("cleanup").path("browserClosed").asBoolean());
        var actions = payload.path("actions"); var outcomes = verified.path("diagnostics").path("actions");
        require(actions.isArray() && !actions.isEmpty() && actions.size() <= 20
                && outcomes.isArray() && outcomes.size() == actions.size());
        var paths = new HashSet<String>();
        for (int i = 0; i < actions.size(); i++) {
            var action = actions.get(i); var outcome = outcomes.get(i);
            require(outcome.path("index").isIntegralNumber() && outcome.path("index").asInt() == i
                    && action.path("type").isTextual() && text(outcome.path("type"), action.path("type").asText())
                    && text(outcome.path("status"), "PASSED"));
            if (text(action.path("type"), "navigate")) {
                require(action.isObject() && action.propertyNames().equals(Set.of("type", "path"))
                        && action.path("path").isTextual() && Set.of("/", "/tasks", "/catalog").contains(action.path("path").asText()));
                paths.add(action.path("path").asText());
            }
        }
        require(paths.size() == 1);
        return paths.iterator().next();
    }
}
