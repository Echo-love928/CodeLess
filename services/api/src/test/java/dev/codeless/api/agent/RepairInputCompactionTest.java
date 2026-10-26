package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.tools.FileToolRegistry;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

class RepairInputCompactionTest {
    private final JsonMapper json=JsonMapper.builder().build();
    private JsonNode compact(JsonNode input,JsonNode actions) {return RepairContext.compactInput(input,actions);}
    private ObjectNode input() {
        String digest="sha256:"+"a".repeat(64);
        return json.valueToTree(Map.of("tools",new FileToolRegistry().definitions().path("tools"),
                "completionProposal",Map.of("type","done","actions",List.of(Map.of("type","navigate","path","/"))),
                "observations",List.of(Map.of("tool","files.read","path","src/pages/HomePage.vue","status","SUCCEEDED",
                        "callId","opaque-audit-id","beforeDigest",digest,"afterDigest",digest,"content","源代码".repeat(330))),
                "sourceFiles",List.of(Map.of("path","src/pages/HomePage.vue","digest",digest,"bytes",2970)),
                "failure",Map.of("code","AGENT_ACTION_TIMEOUT","diagnostic","Original browser diagnostic"),
                "plan",Map.of("pages",List.of(Map.of("route","/","file","src/pages/HomePage.vue")))));
    }
    @Test void preservesEveryToolConstraintAndAllEvidenceWithoutMutatingTheInput() {
        var input=input();var saved=input.deepCopy();var actions=input.path("completionProposal").path("actions");
        var compact=compact(input,actions);
        assertThat(compact.path("toolArgumentSchemas").isObject()).isTrue();
        assertThat(compact.path("tools")).hasSameSizeAs(input.path("tools"));
        for(int i=0;i<input.path("tools").size();i++) {
            var original=input.path("tools").get(i);var projected=compact.path("tools").get(i);
            assertThat(projected.path("name")).isEqualTo(original.path("name"));
            assertThat(projected.path("requiredArguments")).isEqualTo(original.path("inputSchema").path("required"));
            var properties=json.createObjectNode();
            for(var name:projected.path("requiredArguments")) properties.set(name.asText(),compact.path("toolArgumentSchemas").path(name.asText()));
            var schema=json.createObjectNode().put("type","object").put("additionalProperties",false);
            schema.set("properties",properties);schema.set("required",projected.path("requiredArguments"));
            var expected=(ObjectNode)original.path("inputSchema").deepCopy();expected.remove("$schema");
            assertThat(schema).isEqualTo(expected);
        }
        assertThat(compact.path("toolArgumentPolicy").asText()).isEqualTo("All requiredArguments are mandatory; no other argument keys are allowed.");
        for(String field:List.of("failure","plan"))assertThat(compact.path(field)).isEqualTo(input.path(field));
        var receipt=compact.path("observations").get(0);
        assertThat(receipt.path("content")).isEqualTo(input.path("observations").get(0).path("content"));
        assertThat(receipt.path("afterDigest")).isEqualTo(input.path("sourceFiles").get(0).path("digest"));
        assertThat(receipt.has("beforeDigest")).isFalse();assertThat(receipt.has("callId")).isFalse();
        assertThat(compact.path("sourceFiles").get(0).has("digest")).isFalse();
        assertThat(input).isEqualTo(saved);
    }
    @Test void compactInputFundsAnEntirePatchAtThe9950BoundaryUnderTheSameReservationRule() {
        var input=input();var actions=input.path("completionProposal").path("actions");
        String policy="p".repeat(2098);
        ((ObjectNode)input.path("failure")).put("diagnostic","");
        int padding=10400-RuntimeBudget.inputReservation(policy,input.toString());
        assertThat(padding).isPositive();
        ((ObjectNode)input.path("failure")).put("diagnostic","d".repeat(padding));
        var meter=new RuntimeBudget.Meter(9,10,40050);
        assertThat(RuntimeBudget.outputAllowance(meter,RuntimeBudget.inputReservation(policy,input.toString()))).isNull();
        var compact=compact(input,actions);
        assertThat(RuntimeBudget.outputAllowance(meter,RuntimeBudget.inputReservation(policy,compact.toString()))).isGreaterThanOrEqualTo(1254);
        assertThat(RuntimeBudget.TOKENS).isEqualTo(50000);
        assertThat(RuntimeBudget.inputReservation("你好","abc")).isEqualTo(6+3+512);
    }
    @Test void inventoryDigestsAreRetainedUnlessTheExactCurrentSuccessfulReceiptHasThem() {
        for(String condition:List.of("failed","stale","mismatch","missing")) {
            var input=input();var receipt=(ObjectNode)input.path("observations").get(0);
            switch(condition) {
                case "failed" -> receipt.put("status","FAILED");
                case "stale" -> receipt.put("stale",true);
                case "mismatch" -> receipt.put("afterDigest","sha256:"+"b".repeat(64));
                case "missing" -> receipt.remove("afterDigest");
            }
            var compact=compact(input,input.path("completionProposal").path("actions"));
            assertThat(compact.path("sourceFiles")).isEqualTo(input.path("sourceFiles"));
        }
    }
    @Test void unfamiliarSchemasKeepTheirOriginalDefinitions() {
        for(String condition:List.of("optional","different","extraKeyword")) {
            var input=input();var schema=(ObjectNode)input.path("tools").get(1).path("inputSchema");
            switch(condition) {
                case "optional" -> schema.putArray("required");
                case "different" -> ((ObjectNode)schema.path("properties").path("path")).put("maxLength",12);
                case "extraKeyword" -> schema.put("minProperties",1);
            }
            assertThat(compact(input,input.path("completionProposal").path("actions")).path("tools")).isEqualTo(input.path("tools"));
        }
    }
    @Test void aPropertyNamedDescriptionIsAnArgumentAndNeverAnAnnotationToDiscard() {
        var input=input();var tool=(ObjectNode)input.path("tools").get(0);var schema=(ObjectNode)tool.path("inputSchema");
        ((ObjectNode)schema.path("properties")).set("description",json.valueToTree(Map.of("type","string","maxLength",100)));
        ((tools.jackson.databind.node.ArrayNode)schema.path("required")).add("description");
        var compact=compact(input,input.path("completionProposal").path("actions"));
        assertThat(compact.path("toolArgumentSchemas").path("description")).isEqualTo(schema.path("properties").path("description"));
        assertThat(compact.path("tools").get(0).path("requiredArguments").get(0).asText()).isEqualTo("description");
    }
    @Test void projectionNeverInflatesASmallRequest() {
        var input=json.valueToTree(Map.of("completionProposal",Map.of("type","done","actions",List.of())));
        assertThat(compact(input,json.createArrayNode())).isEqualTo(input);
    }
}
