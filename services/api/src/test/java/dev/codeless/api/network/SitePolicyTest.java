package dev.codeless.api.network;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class SitePolicyTest {
    @Test void matchesSharedCrossRuntimeBoundaryCases() throws Exception {
        try (var input = getClass().getResourceAsStream("/network/site-cases.json")) {
            assertThat(input).isNotNull();
            for (var item : JsonMapper.builder().build().readTree(input)) {
                String host = item.path("host").asText();
                if (item.path("site").isNull())
                    assertThatThrownBy(() -> SitePolicy.site(host)).as(host).isInstanceOf(IllegalArgumentException.class);
                else assertThat(SitePolicy.site(host)).as(host).isEqualTo(item.path("site").asText());
            }
        }
        assertThatThrownBy(() -> SitePolicy.site(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SitePolicy.site("app." + "a".repeat(64) + ".cn")).isInstanceOf(IllegalArgumentException.class);
    }
}
