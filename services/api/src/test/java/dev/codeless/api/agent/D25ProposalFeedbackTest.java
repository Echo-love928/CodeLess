package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import java.util.Set;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Recorded D25 failure shapes; no model, browser result or acceptance is fabricated. */
class D25ProposalFeedbackTest {
    final JsonMapper json=JsonMapper.builder().build();
    final tools.jackson.databind.JsonNode plan=json.readTree("{\"pages\":[{\"route\":\"/tasks\"}]}");
    @Test void misplacedValueIsRejectedWithClosedTargetGuidanceWithoutEchoingModelData() {
        var actions=json.readTree("""
            [{"type":"navigate","path":"/tasks"},
             {"type":"expectText","target":{"testId":"title-task-","value":"untrusted-secret"}}]
            """);
        var rejection=AcceptanceActions.check(plan,actions);
        assertThat(rejection.detail()).containsEntry("reason","INVALID_TARGET").containsEntry("index",1);
        assertThat(String.valueOf(rejection.detail().get("correction")))
            .contains("sibling","testId","role","name").doesNotContain("untrusted-secret");
        // A new proposal is validated independently. The rejected object is not rewritten.
        var corrected=json.readTree("""
            [{"type":"navigate","path":"/tasks"},
             {"type":"expectText","target":{"testId":"task-total"},"value":"任务总数：4"}]
            """);
        assertThat(AcceptanceActions.check(plan,corrected)).isNull();
        assertThat(actions.get(1).path("target").has("value")).isTrue();
    }
    @Test void emptyAssertionsRemainRejectedAndFeedbackDistinguishesLiteralFillFromTextAssertion() {
        for(String type:Set.of("expectText","select")) {
            var invalid=json.readTree("[{\"type\":\"navigate\",\"path\":\"/tasks\"},{\"type\":\""+type+"\",\"target\":{\"testId\":\"new-task-input\"},\"value\":\"\"}]");
            var rejection=AcceptanceActions.check(plan,invalid);
            assertThat(rejection.detail()).containsEntry("reason","INVALID_VALUE");
            assertThat(String.valueOf(rejection.detail().get("correction")))
                .contains("nonblank","fill","expectVisible","value");
        }
        var blankFill=json.readTree("[{\"type\":\"navigate\",\"path\":\"/tasks\"},{\"type\":\"fill\",\"target\":{\"testId\":\"new-task-input\"},\"value\":\"\"},{\"type\":\"expectVisible\",\"target\":{\"testId\":\"new-task-input\"}}]");
        assertThat(AcceptanceActions.check(plan,blankFill)).isNull();
    }
}
