package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class GenerationContextTest {
    final JsonMapper json=JsonMapper.builder().build();
    @Test void completionRequiresTheExactLatestHostInventory() {
        var first=json.valueToTree(Map.of("source",Map.of("files",List.of(Map.of("path","src/pages/HomePage.vue")))));
        var last=json.valueToTree(Map.of("source",Map.of("files",List.of(Map.of("path","src/pages/HomePage.vue"),Map.of("path","src/data/items.ts")))));
        assertThat(GenerationContext.complete(List.of(first),Set.of("src/pages/HomePage.vue"))).isTrue();
        assertThat(GenerationContext.complete(List.of(first,last),Set.of("src/pages/HomePage.vue"))).isFalse();
        assertThat(GenerationContext.complete(List.of(first),Set.of("src/pages/HomePage.vue","src/data/items.ts"))).isFalse();
        assertThat(GenerationContext.complete(List.of(),Set.of())).isFalse();
    }
    @Test void preservesAllCommittedSourceBytesAndOnlyTheLatestInventoryWithoutMutatingJournalReceipts() {
        var a=json.createObjectNode().put("callId","one").put("status","SUCCEEDED").put("afterDigest","first")
                .put("committedContent","<template>{{ literal }}</template>").put("contentOrigin","COMMITTED_WRITE_DIGEST_MATCHED");
        a.set("source",json.valueToTree(Map.of("files",List.of("one"))));a.putNull("errorCode");
        var b=a.deepCopy().put("callId","two").put("afterDigest","second").put("committedContent","export const two = 2;");
        b.set("source",json.valueToTree(Map.of("files",List.of("one","two"))));
        var original=a.deepCopy();var projected=GenerationContext.observations(List.of(a,b));
        assertThat(a).isEqualTo(original);
        assertThat(projected.get(0).has("source")).isFalse();
        assertThat(projected.get(1).path("source")).isEqualTo(b.path("source"));
        for(int i=0;i<2;i++) for(String field:List.of("callId","afterDigest","committedContent","contentOrigin"))
            assertThat(projected.get(i).path(field)).isEqualTo(List.of(a,b).get(i).path(field));
        assertThat(projected.get(0).has("errorCode")).isFalse();
        assertThat(GenerationContext.observations(List.of(a))).containsExactly(a);
    }
}
