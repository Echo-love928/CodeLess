package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class LocalGenerationContextTest {
    final JsonMapper json=JsonMapper.builder().build();
    final String path="src/components/IndependentTile.vue";
    JsonNode base(){return json.valueToTree(Map.of("source",Map.of("sourceFile",path),"sourceFiles",List.of(Map.of("path",path,"digest","base","content","original"))));}
    JsonNode write(String before,String after,String content){return json.valueToTree(Map.of("path",path,"status","SUCCEEDED","beforeDigest",before,
            "afterDigest",after,"committedContent",content,"contentOrigin","COMMITTED_WRITE_DIGEST_MATCHED"));}
    @Test void initialAndUnchangedBaseCannotForceCompletion() {
        assertThat(LocalGenerationContext.completionOnly(base(),List.of())).isFalse();
        assertThat(LocalGenerationContext.completionOnly(base(),List.of(write("base","base","original")))).isFalse();
        assertThat(LocalGenerationContext.completionOnly(base(),List.of(write("base","new","changed"),write("new","base","original")))).isFalse();
    }
    @Test void onlyChangedThenRepeatedCommittedWritesRequestCompletion() {
        var first=write("base","new","changed");var repeated=write("new","new","changed");
        assertThat(LocalGenerationContext.completionOnly(base(),List.of(first))).isFalse();
        assertThat(LocalGenerationContext.completionOnly(base(),List.of(first,repeated))).isTrue();
        assertThat(LocalGenerationContext.progress(base(),List.of(first,repeated))).containsEntry("currentDigest","new");
        var different=write("new","newer","different");
        assertThat(LocalGenerationContext.completionOnly(base(),List.of(first,repeated,different))).isFalse();
    }
    @Test void unrelatedFailedOrUncommittedReceiptsCannotTriggerCompletion() {
        var receipt=write("new","new","changed");
        for(String field:List.of("path","status","contentOrigin")) {
            var wrong=(tools.jackson.databind.node.ObjectNode)receipt.deepCopy();wrong.put(field,"untrusted");
            assertThat(LocalGenerationContext.completionOnly(base(),List.of(wrong))).isFalse();
        }
    }
    @Test void projectionKeepsImmutableBaseIdentityWithoutRepeatingOutdatedSource() {
        var original=base();var saved=original.deepCopy();
        assertThat(LocalGenerationContext.projectBase(original,List.of())).isEqualTo(original);
        var projection=LocalGenerationContext.projectBase(original,List.of(write("base","new","changed")));
        assertThat(projection.path("sourceFiles").get(0).path("digest").asText()).isEqualTo("base");
        assertThat(projection.path("sourceFiles").get(0).has("content")).isFalse();assertThat(original).isEqualTo(saved);
    }
    @Test void feedbackIncludesCurrentBytesOnceAndRetainsEveryActualReceiptIdentity() {
        var first=write("base","new","changed");var repeated=write("new","new","changed");var other=write("base","other","other source");
        ((tools.jackson.databind.node.ObjectNode)other).put("path","src/pages/OtherPage.vue");
        var projected=GenerationContext.observations(List.of(first,other,repeated));
        assertThat(projected.get(0).has("committedContent")).isFalse();
        assertThat(projected.get(0).path("beforeDigest").asText()).isEqualTo("base");
        assertThat(projected.get(1).path("committedContent").asText()).isEqualTo("other source");
        assertThat(projected.get(2).path("committedContent").asText()).isEqualTo("changed");
        assertThat(first.path("committedContent").asText()).isEqualTo("changed");
    }
}
