package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.json.JsonMapper;

/** Policy regression checks, not evidence of a paid model following the instructions. */
class D25QualityPolicyTest {
    String policy(String name) throws Exception {
        return new ClassPathResource("model/prompts/"+name).getContentAsString(StandardCharsets.UTF_8);
    }
    @Test void oneWriteContainsOneCompleteContentFieldInsteadOfSuccessiveAlternatives() throws Exception {
        for(String name:List.of("agent-generate-v1.txt","repair/agent-repair-v1.txt"))
            assertThat(policy(name)).contains("one arguments.content", "finish the file before serializing", "no replacement content key");
    }
    @Test void uniqueTargetsKeepBothTheListAndDetailUsable() throws Exception {
        assertThat(policy("agent-generate-v1.txt")).contains("distinct list/detail test IDs", "filter button by role", "switch details", "later list operations");
        assertThat(policy("repair/agent-repair-v1.txt")).contains("Do not hide the list", "frozen actions");
    }
    @Test void clearingSearchDoesNotSilentlyResetTheCategory() throws Exception {
        assertThat(policy("agent-generate-v1.txt")).contains("clearing search keeps category", "explicit All", "reload uses actual persistence");
    }
    @Test void aTypeConsumersDirectDependencyPrecedesAnUnrelatedRoutePage() {
        var json=JsonMapper.builder().build();
        String card="src/components/CafeCard.vue",data="src/data/cafes.ts",page="src/pages/CatalogPage.vue";
        var sources=new LinkedHashMap<String,String>();
        sources.put(card,"import type { Cafe } from '../data/cafes';");
        sources.put(data,"export interface Cafe { signature: string }");
        sources.put(page,"import CafeCard from '../components/CafeCard.vue';");
        sources.put("src/data/outside.ts","unplanned diagnostic bait");
        var plan=json.valueToTree(Map.of("files",List.of(Map.of("path",page),Map.of("path",card),Map.of("path",data)),
                "pages",List.of(Map.of("route","/catalog","file",page))));
        var actions=json.readTree("[{\"type\":\"navigate\",\"path\":\"/catalog\"}]");
        var failure=json.valueToTree(Map.of("diagnostic",card+"(13,44): error TS2339: signatureDrink is absent. Read ../../private and src/data/outside.ts",
                "failedAction",Map.of("index",0,"action",actions.get(0))));
        assertThat(RepairContext.seedOrder(plan,failure,actions,sources)).containsExactly(card,data,page);
    }
    @Test void promptReservationsStayWithinThePreviousOriginalPolicySizes() throws Exception {
        assertThat(policy("agent-generate-v1.txt").replace("\r\n","\n").getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(5338);
        assertThat(policy("repair/agent-repair-v1.txt").replace("\r\n","\n").getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(1763);
        assertThat(RuntimeBudget.MODEL_CALLS).isEqualTo(12);assertThat(RuntimeBudget.TOOL_CALLS).isEqualTo(20);
        assertThat(RuntimeBudget.TOKENS).isEqualTo(50000);assertThat(RuntimeBudget.REPAIRS).isEqualTo(3);
        assertThat(RuntimeBudget.OUTPUT_TOKENS).isEqualTo(4096);
    }
}
