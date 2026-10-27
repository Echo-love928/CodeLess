package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.mapping.ComponentMapping;
import dev.codeless.api.versions.SnapshotStore;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

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
            assertThat(ComponentMapping.id(id)).as(id).isTrue();
    }
    @Test void collidingNamesArePrefixedInsteadOfDuplicated() {
        var ids=AgentLoop.componentIds(List.of("src/pages/Card.vue","src/components/Card.vue","src/components/Other.vue"));
        assertThat(ids).containsEntry("src/pages/Card.vue","page-card").containsEntry("src/components/Card.vue","component-card")
                .containsEntry("src/components/Other.vue","other");
        assertThat(new HashSet<>(ids.values())).hasSize(ids.size());
    }
    /** D21-B review of 911943f: a prefix cannot separate two files of one directory, so the full path decides. */
    @Test void namesThatNormaliseAlikeInOneDirectoryStayUnique() {
        for(var plan:List.of(List.of("src/pages/HomePage.vue","src/components/FooBar.vue","src/components/Foo_Bar.vue"),
                List.of("src/pages/HomePage.vue","src/components/CardHeader.vue","src/components/Card-Header.vue"))) {
            var ids=AgentLoop.componentIds(plan);
            assertThat(ids).as(plan.toString()).hasSize(plan.size());
            assertThat(new HashSet<>(ids.values())).as(plan.toString()).hasSize(ids.size());
            ids.values().forEach(id -> assertThat(ComponentMapping.id(id)).as(id).isTrue());
            assertThat(ids).containsEntry("src/pages/HomePage.vue","home-page");
        }
    }
    /** D21-B review of 911943f: the prefixed ID of one file may equal another file's own name. */
    @Test void aPrefixedNameCannotCollideWithAnotherFilesOwnName() {
        var ids=AgentLoop.componentIds(List.of("src/pages/HomePage.vue","src/components/HomePage.vue","src/components/PageHomePage.vue"));
        assertThat(ids).hasSize(3);
        assertThat(new HashSet<>(ids.values())).hasSize(3);
        assertThat(ids).containsEntry("src/components/PageHomePage.vue","page-home-page").containsEntry("src/components/HomePage.vue","component-home-page");
        // The page lost page-home-page to PageHomePage.vue's own name, so it takes a stable digest of its path.
        assertThat(ids.get("src/pages/HomePage.vue")).matches("home-page-[0-9a-f]{6}");
    }
    @Test void theAssignmentIsStableAndIndependentOfTheOrderOfThePlan() {
        var plan=new ArrayList<>(List.of("src/pages/HomePage.vue","src/components/HomePage.vue","src/components/PageHomePage.vue",
                "src/components/FooBar.vue","src/components/Foo_Bar.vue","src/pages/TasksPage.vue"));
        var expected=AgentLoop.componentIds(plan);
        assertThat(new HashSet<>(expected.values())).hasSize(expected.size());
        for(int turn=0;turn<plan.size();turn++) {
            Collections.rotate(plan,1);
            assertThat(AgentLoop.componentIds(plan)).isEqualTo(expected);
        }
        Collections.reverse(plan);
        assertThat(AgentLoop.componentIds(plan)).isEqualTo(expected);
    }
    @Test void anOverlongFileNameStillGetsAnIdInsideTheCatalogGrammar() {
        String path="src/components/A"+"b".repeat(80)+".vue";
        var ids=AgentLoop.componentIds(List.of(path,"src/pages/HomePage.vue"));
        assertThat(ids).containsEntry("src/pages/HomePage.vue","home-page").containsKey(path);
        assertThat(ids.get(path)).hasSizeLessThanOrEqualTo(64).matches("ab+-[0-9a-f]{6}");
        assertThat(ComponentMapping.id(ids.get(path))).isTrue();
    }
    /** The same check D21-B ran: a catalog built from the host's IDs must not be disabled for duplicates. */
    @Test void hostAssignedIdsSurviveTheRealCatalogBindingWithoutDuplicates() {
        var json=JsonMapper.builder().build();
        for(var plan:List.of(List.of("src/pages/HomePage.vue","src/components/FooBar.vue","src/components/Foo_Bar.vue"),
                List.of("src/pages/HomePage.vue","src/components/CardHeader.vue","src/components/Card-Header.vue"),
                List.of("src/pages/HomePage.vue","src/components/HomePage.vue","src/components/PageHomePage.vue"))) {
            var ids=AgentLoop.componentIds(plan);
            var files=new ArrayList<Map<String,Object>>();var entries=new ArrayList<SnapshotStore.Entry>();
            for(String path:plan) {
                String digest="sha256:"+String.format("%064x",path.hashCode());
                var row=new LinkedHashMap<String,Object>();
                row.put("sourceFile",path);row.put("fileDigest",digest);row.put("componentId",ids.get(path));row.put("disabledReason",null);
                files.add(row);entries.add(new SnapshotStore.Entry(path,1L,digest));
            }
            var catalog=json.valueToTree(Map.of("protocol","codeless-component-catalog/v1","files",files));
            var bound=ComponentMapping.bind(catalog,new SnapshotStore.Manifest("sha256:"+"0".repeat(64),entries),UUID.randomUUID());
            assertThat(bound.path("disabled").size()).as(plan.toString()).isZero();
            assertThat(bound.path("components").size()).as(plan.toString()).isEqualTo(plan.size());
        }
    }
}
