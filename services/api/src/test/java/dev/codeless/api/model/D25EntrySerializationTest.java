package dev.codeless.api.model;

import static org.assertj.core.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Native PLAN boundary and transport examples. No claim that a paid model follows the policy. */
class D25EntrySerializationTest {
    final JsonMapper json=JsonMapper.builder().build();
    final PlanValidator validator=new PlanValidator();
    String policy(String name) throws Exception {return new ClassPathResource("model/prompts/"+name).getContentAsString(StandardCharsets.UTF_8);}
    ObjectNode plan() throws Exception {return (ObjectNode)json.readTree(Files.readString(Path.of("../../contracts/plan/fixtures/valid/static.json")));}
    @Test void taskAndCatalogFeaturesHaveAnExplicitCanonicalEntryContract() throws Exception {
        assertThat(policy("plan-v1.txt")).contains("Task, kanban and shopping features enter /tasks", "Catalogue/search features enter /catalog", "Display/activity enter /", "Never use / as a substitute");
        assertThat(policy("agent-generate-v1.txt")).contains("planned route/file pair", "template stub");
    }
    @Test void bothPoliciesExplainTheObservedUnescapedClosingQuoteFailures() throws Exception {
        assertThat(policy("plan-v1.txt")).contains("ASCII double quotes", "action/expected", "Do not replace request punctuation");
        assertThat(policy("agent-generate-v1.txt")).contains("closing attribute quotes", "JSON-encode finished source once");
        assertThat(policy("agent-generate-v1.txt").replace("\r\n","\n").getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(5338);
    }
    @Test void quotedLabelsRoundTripButAnUnescapedLabelIsStillRejected() throws Exception {
        var p=plan();((ObjectNode)p.path("acceptance").get(0)).put("expected","点击\"全部\"按钮，保留“全部”与原始标点。");
        String valid=p.toString();assertThat(validator.validate(valid,"STATIC").path("acceptance").get(0).path("expected").asText()).isEqualTo("点击\"全部\"按钮，保留“全部”与原始标点。");
        String invalid=valid.replace("\\\"全部\\\"","\"全部\"");assertThat(invalid).isNotEqualTo(valid);
        assertThatThrownBy(()->validator.validate(invalid,"STATIC")).isInstanceOf(ModelFailure.class).hasMessage("PLAN_INVALID");
        assertThatThrownBy(()->validator.validate(valid+" {}","STATIC")).isInstanceOf(ModelFailure.class);
        assertThatThrownBy(()->validator.validate(valid.substring(0,valid.length()-1),"STATIC")).isInstanceOf(ModelFailure.class);
    }
    @Test void canonicalTaskRouteAndFileAreValidatedTogetherWithoutRenamingHistory() throws Exception {
        String canonical=plan().toString().replace("HomePage.vue","TasksPage.vue").replace("\"route\":\"/\"","\"route\":\"/tasks\"");
        var result=validator.validate(canonical,"STATIC");assertThat(result.path("pages").get(0).path("route").asText()).isEqualTo("/tasks");
        assertThat(result.path("pages").get(0).path("file").asText()).isEqualTo("src/pages/TasksPage.vue");
        assertThatThrownBy(()->validator.validate(canonical.replace("TasksPage.vue","HomePage.vue"),"STATIC")).isInstanceOf(ModelFailure.class).hasMessage("PLAN_INVALID");
    }
}
