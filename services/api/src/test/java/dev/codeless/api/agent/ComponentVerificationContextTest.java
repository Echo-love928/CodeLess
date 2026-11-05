package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class ComponentVerificationContextTest {
    final JsonMapper json=JsonMapper.builder().build();
    final UUID version=UUID.randomUUID();
    final String digest="sha256:"+"a".repeat(64);
    @Test void carriesRealBaseSelectorsCountsAndFilterSequenceWithoutChangingTheBase() {
        var actions=json.readTree("""
                [{"type":"navigate","path":"/catalog"},
                 {"type":"expectText","target":{"testId":"result-count"},"value":"共 6 家咖啡馆"},
                 {"type":"select","target":{"testId":"district-select"},"value":"静安区"},
                 {"type":"expectText","target":{"testId":"result-count"},"value":"共 2 家咖啡馆"}]
                """);
        var context=json.valueToTree(Map.of("allowedWriteFiles",List.of("src/components/CafeCard.vue")));
        var draft=json.valueToTree(Map.of("versionId",version,"sourceDigest",digest,"actions",actions));
        var result=AgentRunStore.withVerifiedActions(context,version,digest,draft);
        assertThat(result.path("verifiedBaseActions")).isEqualTo(actions);
        assertThat(result.path("allowedWriteFiles")).isEqualTo(context.path("allowedWriteFiles"));
        assertThat(context.has("verifiedBaseActions")).isFalse();
        ((tools.jackson.databind.node.ArrayNode)result.path("verifiedBaseActions")).removeAll();
        assertThat(draft.path("actions").size()).isEqualTo(4);
    }
    @Test void rejectsActionsFromAnotherVersionOrDigestAndMissingVerification() {
        var context=json.createObjectNode();
        for(var draft:List.of(
                Map.of("versionId",UUID.randomUUID(),"sourceDigest",digest,"actions",List.of(Map.of("type","reload"))),
                Map.of("versionId",version,"sourceDigest","sha256:"+"b".repeat(64),"actions",List.of(Map.of("type","reload"))),
                Map.of("versionId",version,"sourceDigest",digest,"actions",List.of()))) {
            assertThatThrownBy(() -> AgentRunStore.withVerifiedActions(context,version,digest,json.valueToTree(draft)))
                    .isInstanceOf(AgentFailure.class).hasMessage("COMPONENT_BASE_VERIFICATION_MISMATCH");
        }
    }
}
