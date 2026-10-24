package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;

/** D24-A: GENERATE asks for the data-ai-component IDs the trusted catalog and the D21-B edit cases expect. */
class ComponentIdsTest {
    @Test void plannedVueFilesGetKebabCaseIdsMatchingTheEditCases() {
        var ids=AgentLoop.componentIds(List.of("src/pages/HomePage.vue","src/components/WorkCard.vue","src/pages/TasksPage.vue",
                "src/components/ToolDetailPanel.vue","src/data/works.ts"));
        assertThat(ids).containsExactlyInAnyOrderEntriesOf(Map.of("src/pages/HomePage.vue","home-page","src/components/WorkCard.vue","work-card",
                "src/pages/TasksPage.vue","tasks-page","src/components/ToolDetailPanel.vue","tool-detail-panel"));
    }
    @Test void acronymsDigitsAndSeparatorsStayWithinTheCatalogIdGrammar() {
        assertThat(AgentLoop.kebab("HTMLViewer")).isEqualTo("html-viewer");
        assertThat(AgentLoop.kebab("Step2Card")).isEqualTo("step2-card");
        assertThat(AgentLoop.kebab("cafe_list--Item")).isEqualTo("cafe-list-item");
        for(String id:AgentLoop.componentIds(List.of("src/pages/HTMLViewer.vue","src/components/Step2Card.vue","src/components/cafe_list--Item.vue")).values())
            assertThat(dev.codeless.api.mapping.ComponentMapping.id(id)).as(id).isTrue();
    }
    @Test void collidingNamesArePrefixedInsteadOfDuplicated() {
        var ids=AgentLoop.componentIds(List.of("src/pages/Card.vue","src/components/Card.vue","src/components/Other.vue"));
        assertThat(ids).containsEntry("src/pages/Card.vue","page-card").containsEntry("src/components/Card.vue","component-card")
                .containsEntry("src/components/Other.vue","other");
        assertThat(new HashSet<>(ids.values())).hasSize(ids.size());
    }
}
