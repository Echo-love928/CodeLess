package dev.codeless.api.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class FileToolRegistryTest {
    private final FileToolRegistry registry = new FileToolRegistry();
    @Test void registryExposesExactlyFiveFileToolsWithClosedSchemas() {
        assertThat(registry.definitions().path("tools").valueStream().map(t -> t.path("name").asText()).toList())
                .containsExactly("files.list", "files.read", "files.create", "files.update", "files.delete");
        registry.validate("files.list", "{}");
        registry.validate("files.create", "{\"path\":\"src/pages/HomePage.vue\",\"content\":\"\"}");
        assertThatThrownBy(() -> registry.validate("shell", "{}" )).hasMessage("FILE_TOOL_UNKNOWN");
        assertThatThrownBy(() -> registry.validate("files.list", "{\"taskId\":\"another-task\"}" )).hasMessage("FILE_INPUT_INVALID");
    }
    @Test void pathsAreCanonicalPortableBusinessFilesAndNeverProtectedTemplateConfiguration() {
        for (String path : new String[]{"../other.vue", "/tmp/page.vue", "C:/src/pages/Home.vue", "C:src/pages/Home.vue",
                "\\\\server\\share\\page.vue", "src\\pages\\Home.vue", "src/pages/../Home.vue", "src//pages/Home.vue",
                "src/pages/./Home.vue", "src/pages/%2e%2e/Home.vue", "src/pages/Home.vue:stream", "src/pages/Home.vue.",
                "src/pages/NUL.vue", "src/data/COM1.ts", "src/components/LPT9.vue", "src/pages/CON.vue", "package.json",
                "pnpm-lock.yaml", "vite.config.ts", "src/main.ts", "src/App.vue", "src/router.ts", ".env", "src/pages/run.js"})
            assertThatThrownBy(() -> FileToolRegistry.validatePath(path)).as(path).hasMessage("FILE_PATH_REJECTED");
        for (String path : new String[]{"src/pages/HomePage.vue", "src/components/Hero-2.vue", "src/data/mock_items.ts"})
            FileToolRegistry.validatePath(path);
    }
    @Test void invalidSchemasDuplicateKeysAndTrailingDataFailClosed() {
        for (String input : new String[]{"null", "[]", "{\"path\":null}", "{\"path\":42}", "{}", "{\"path\":\"src/pages/A.vue\",\"extra\":true}",
                "{\"path\":\"src/pages/A.vue\",\"path\":\"src/pages/B.vue\"}", "{\"path\":\"src/pages/A.vue\"} {}"})
            assertThatThrownBy(() -> registry.validate("files.read", input)).hasMessage("FILE_INPUT_INVALID");
        assertThatThrownBy(() -> registry.validate("files.update", "{\"path\":\"src/pages/A.vue\",\"content\":\"x\"}"))
                .hasMessage("FILE_INPUT_INVALID");
        var copy = registry.definitions();
        ((tools.jackson.databind.node.ObjectNode) copy).put("version", 99);
        assertThat(registry.definitions().path("version").asInt()).isEqualTo(1);
    }
}
