package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** D24-A: host checks of a GENERATE done; shape cases mirror tests/runner/browser/artifacts.test.mjs. */
class AcceptanceActionsTest {
    private final JsonMapper json=JsonMapper.builder().build();
    private final JsonNode plan=json.readTree("{\"pages\":[{\"route\":\"/catalog\",\"file\":\"src/pages/CatalogPage.vue\"}]}");
    private JsonNode actions(String... items) {return json.readTree("["+String.join(",",items)+"]");}
    private static final String NAV="{\"type\":\"navigate\",\"path\":\"/catalog\"}";
    private static final String SEE="{\"type\":\"expectVisible\",\"target\":{\"testId\":\"title\"}}";

    @Test void validDoneIsAcceptedAndCoverageIsStillRequired() {
        assertThat(AcceptanceActions.check(plan,actions(NAV,SEE))).isNull();
        var missing=AcceptanceActions.check(plan,actions(NAV,"{\"type\":\"click\",\"target\":{\"testId\":\"title\"}}"));
        assertThat(missing.code()).isEqualTo("AGENT_ACCEPTANCE_INCOMPLETE");
        assertThat(missing.detail()).containsEntry("reason","ROUTE_NOT_ASSERTED").containsEntry("routes",List.of("/catalog"));
    }
    @Test void moreThanTwentyActionsNamesTheLimitAndTheActualCount() {
        var items=new ArrayList<String>(List.of(NAV));for(int i=0;i<24;i++)items.add(SEE);
        var rejection=AcceptanceActions.check(plan,actions(items.toArray(String[]::new)));
        assertThat(rejection.code()).isEqualTo("AGENT_ACCEPTANCE_INVALID");
        assertThat(rejection.detail()).containsEntry("reason","TOO_MANY_ACTIONS").containsEntry("limit",20).containsEntry("actual",25);
        assertThat(AcceptanceActions.check(plan,actions()).detail()).containsEntry("reason","NO_ACTIONS");
        assertThat(AcceptanceActions.check(plan,json.readTree("{}")).detail()).containsEntry("reason","NO_ACTIONS");
    }
    @Test void templatePlaceholdersCannotMatchRenderedDom() {
        for(String action:List.of("{\"type\":\"click\",\"target\":{\"testId\":\"toggle-{{item.id}}\"}}",
                "{\"type\":\"expectText\",\"target\":{\"text\":\"共 ${count} 本\"},\"value\":\"x\"}",
                "{\"type\":\"expectText\",\"target\":{\"testId\":\"count\"},\"value\":\"共 {{ total }} 本\"}")) {
            var rejection=AcceptanceActions.check(plan,actions(NAV,SEE,action));
            assertThat(rejection.detail()).as(action).containsEntry("reason","TEMPLATE_PLACEHOLDER").containsEntry("index",2);
        }
    }
    @Test void runnerRejectedShapesAreRejectedBeforeTheRunner() {
        // Same rejected actions as the runner's controlled action grammar test.
        for(String action:List.of("{\"type\":\"evaluate\",\"script\":\"fetch('http://169.254.169.254')\"}",
                "{\"type\":\"click\",\"target\":{\"selector\":\"body\"}}",
                "{\"type\":\"click\",\"target\":{\"role\":\"button\",\"name\":\"Save\"},\"script\":\"evil()\"}",
                "{\"type\":\"navigate\",\"path\":\"http://127.0.0.1/admin\"}","{\"type\":\"navigate\",\"path\":\"//169.254.169.254\"}",
                "{\"type\":\"navigate\",\"path\":\"/../secret\"}","{\"type\":\"navigate\",\"path\":\"/%2e%2e/secret\"}",
                "{\"type\":\"fill\",\"target\":{\"testId\":\"name\"},\"value\":\""+"x".repeat(2001)+"\"}",
                "{\"type\":\"check\",\"target\":{\"role\":\"switch\",\"name\":\"Done\"}}","{\"type\":\"expectText\",\"target\":{\"testId\":\"name\"}}",
                "{\"type\":\"reload\",\"path\":\"/\"}","{\"type\":\"click\"}","{\"type\":\"click\",\"target\":{\"testId\":\" \"}}")) {
            var rejection=AcceptanceActions.check(plan,actions(NAV,SEE,action));
            assertThat(rejection).as(action).isNotNull();assertThat(rejection.code()).isEqualTo("AGENT_ACCEPTANCE_INVALID");
            assertThat(rejection.detail().get("reason")).as(action).isNotEqualTo("TEMPLATE_PLACEHOLDER");
        }
        // Accepted by the runner grammar; the hash route is still not a platform document route.
        assertThat(AcceptanceActions.check(plan,actions(NAV,SEE,"{\"type\":\"fill\",\"target\":{\"testId\":\"name\"},\"value\":\"\"}",
                "{\"type\":\"reload\"}","{\"type\":\"check\",\"target\":{\"role\":\"checkbox\",\"name\":\"Done\"}}"))).isNull();
        assertThat(AcceptanceActions.check(plan,actions("{\"type\":\"navigate\",\"path\":\"/#details\"}",SEE)).detail())
                .containsEntry("reason","UNSUPPORTED_ROUTE");
    }
}
