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
    @Test void anUnresolvedTemplateInATestIdCannotMatchTheRenderedDom() {
        for(String action:List.of("{\"type\":\"click\",\"target\":{\"testId\":\"toggle-{{item.id}}\"}}",
                "{\"type\":\"click\",\"target\":{\"testId\":\"toggle-${item.id}\"}}",
                "{\"type\":\"expectVisible\",\"target\":{\"testId\":\"row-}}\"}}")) {
            var rejection=AcceptanceActions.check(plan,actions(NAV,SEE,action));
            assertThat(rejection.detail()).as(action).containsEntry("reason","TEMPLATE_PLACEHOLDER").containsEntry("index",2);
        }
    }
    /**
     * D21-B review of 911943f. <script setup lang="ts">const literal = "{{ count }}"</script> with
     * <h1 data-testid="literal">{{ literal }}</h1> renders the braces verbatim, the runner grammar accepts the action
     * and a real Vue build plus Chromium make it pass, so texts, names and values are not judged for braces here.
     */
    @Test void literalBracesInTextsNamesAndValuesAreLegitimateContent() {
        for(String action:List.of("{\"type\":\"expectText\",\"target\":{\"testId\":\"literal\"},\"value\":\"{{ count }}\"}",
                "{\"type\":\"expectText\",\"target\":{\"text\":\"{{ count }}\"},\"value\":\"{{ count }}\"}",
                "{\"type\":\"expectVisible\",\"target\":{\"role\":\"heading\",\"name\":\"共 ${count} 本\"}}",
                "{\"type\":\"fill\",\"target\":{\"testId\":\"name\"},\"value\":\"${name}\"}")) {
            assertThat(AcceptanceActions.check(plan,actions(NAV,SEE,action))).as(action).isNull();
        }
    }
    /** The runner trims with String.prototype.trim(): U+00A0, U+FEFF and U+2028 are blank there; U+001C and U+180E are not. */
    @Test void blankTextFollowsTheRunnersJavaScriptTrimInsteadOfJavaIsBlank() {
        for(String blank:List.of(" ","\u00a0","\ufeff","\u2028","\u3000","\u2003 \t")) {
            var value=AcceptanceActions.check(plan,actions(NAV,SEE,"{\"type\":\"expectText\",\"target\":{\"testId\":\"name\"},\"value\":"+json.writeValueAsString(blank)+"}"));
            assertThat(value).as("value of "+blank.length()+" blank chars").isNotNull();
            assertThat(value.detail()).containsEntry("reason","INVALID_VALUE");
            var target=AcceptanceActions.check(plan,actions(NAV,SEE,"{\"type\":\"click\",\"target\":{\"testId\":"+json.writeValueAsString(blank)+"}}"));
            assertThat(target).as("target of "+blank.length()+" blank chars").isNotNull();
            assertThat(target.detail()).containsEntry("reason","INVALID_TARGET");
        }
        for(String text:List.of("\\u001c","\\u180e","\\u0085"))
            assertThat(AcceptanceActions.check(plan,actions(NAV,SEE,"{\"type\":\"expectText\",\"target\":{\"testId\":\"name\"},\"value\":\""+text+"\"}"))).as(text).isNull();
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
