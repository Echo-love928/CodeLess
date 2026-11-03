package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.tools.FileToolRegistry;
import dev.codeless.api.model.ModelProvider.Usage;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Deterministic projection controls; no real model or successful generation is implied. */
class GenerationInputCompactionTest {
    final JsonMapper json=JsonMapper.builder().build();
    ObjectNode input() {
        return json.valueToTree(Map.of("phase","GENERATE","request","Keep literal request: \"role\", do not change scope",
                "plan",Map.of("files",List.of(Map.of("path","src/pages/HomePage.vue","purpose","Original purpose")),
                        "acceptance",List.of("Every original acceptance point")),
                "tools",new FileToolRegistry().definitions().path("tools"),
                "observations",List.of(Map.of("tool","files.create","path","src/data/items.ts","status","SUCCEEDED",
                        "callId","opaque-audit-id","afterDigest","sha256:"+"a".repeat(64),
                        "committedContent","export const literal = '角色与原始标点';","contentOrigin","COMMITTED_WRITE_DIGEST_MATCHED"))));
    }
    @Test void generationPreservesLiteralPlanSourceAndClosedToolSemanticsWithoutAddingRepairProposals() {
        var input=input();var saved=input.deepCopy();var projected=GenerationContext.compactInput(input);
        for(String key:List.of("phase","request","plan")) assertThat(projected.path(key)).isEqualTo(input.path(key));
        var actual=input.path("observations").get(0);var view=projected.path("observations").get(0);
        for(String key:actual.propertyNames()) if(!key.equals("callId")) assertThat(view.path(key)).isEqualTo(actual.path(key));
        for(int i=0;i<input.path("tools").size();i++) {
            var tool=input.path("tools").get(i);var signature=projected.path("tools").get(i);
            assertThat(signature.path("name")).isEqualTo(tool.path("name"));
            assertThat(signature.path("requiredArguments")).isEqualTo(tool.path("inputSchema").path("required"));
            for(var property:tool.path("inputSchema").path("properties").properties())
                assertThat(projected.path("toolArgumentSchemas").path(property.getKey())).isEqualTo(property.getValue());
        }
        assertThat(projected.has("completionProposal")).isFalse();assertThat(projected.has("originalAcceptance")).isFalse();
        assertThat(input).isEqualTo(saved);
    }
    @Test void a351TokenBoundaryGainsOutputRoomWithinTheSameCapAndUnknownUsageStaysCharged() {
        var input=input();String policy="Unchanged JSON policy";
        int original=RuntimeBudget.inputReservation(policy,input.toString());
        var meter=new RuntimeBudget.Meter(6,5,50000-original-351);
        assertThat(RuntimeBudget.outputAllowance(meter,original)).isEqualTo(351);
        int compact=RuntimeBudget.inputReservation(policy,GenerationContext.compactInput(input).toString());
        int allowance=RuntimeBudget.outputAllowance(meter,compact);
        assertThat(allowance).isGreaterThan(2000).isLessThanOrEqualTo(4096);
        var unknown=RuntimeBudget.charge(Usage.unknown(),compact,allowance);
        assertThat(unknown.estimated()).isTrue();assertThat(unknown.chargedTokens()).isEqualTo((long)compact+allowance);
        assertThat(meter.chargedTokens()+unknown.chargedTokens()).isLessThanOrEqualTo(50000);
        assertThat(meter.models()).isEqualTo(6);assertThat(meter.tools()).isEqualTo(5);
    }
    @Test void unfamiliarSchemasKeepTheirOriginalDefinitionsAndSmallCompletionOnlyRequestsDoNotGrow() {
        var input=input();((ObjectNode)input.path("tools").get(1).path("inputSchema")).put("minProperties",1);
        assertThat(GenerationContext.compactInput(input).path("tools")).isEqualTo(input.path("tools"));
        var small=json.valueToTree(Map.of("completionOnly",true,"tools",List.of(),"observations",List.of()));
        assertThat(GenerationContext.compactInput(small)).isEqualTo(small);
    }
    @Test void invalidRoleShorthandRemainsIllegalWhileTheDocumentedTargetIsACompleteJsonObject() throws Exception {
        String policy=new org.springframework.core.io.ClassPathResource("model/prompts/agent-generate-v1.txt")
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(policy).doesNotContain("{role,name}").contains("{\"role\":\"button\",\"name\":\"Save\"}");
        assertThatThrownBy(()->json.readTree("{\"role\",\"name\":\"Save\"}")).isInstanceOf(RuntimeException.class);
    }
}
