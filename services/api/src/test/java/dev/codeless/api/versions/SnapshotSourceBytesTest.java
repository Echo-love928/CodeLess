package dev.codeless.api.versions;

import static org.assertj.core.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

/** D16-A export input: exact frozen bytes of one version, never a sibling version or a planted file. */
class SnapshotSourceBytesTest {
    @TempDir Path temporary;
    final JsonMapper json = JsonMapper.builder().build();

    record Frozen(UUID id, String digest, Map<String, byte[]> files) {}
    Frozen freeze(LocalVolumeSnapshotStore store, Map<String, String> content) throws Exception {
        Path input = Files.createTempDirectory(temporary, "input-");
        var entries = new ArrayList<SnapshotStore.Entry>();
        var files = new TreeMap<String, byte[]>();
        for (var e : new TreeMap<>(content).entrySet()) {
            byte[] bytes = e.getValue().getBytes(StandardCharsets.UTF_8);
            Files.createDirectories(input.resolve(e.getKey()).getParent());
            Files.write(input.resolve(e.getKey()), bytes);
            entries.add(new SnapshotStore.Entry(e.getKey(), bytes.length, LocalVolumeSnapshotStore.hash(bytes)));
            files.put(e.getKey(), bytes);
        }
        String digest = LocalVolumeSnapshotStore.hash(json.writeValueAsBytes(entries));
        UUID id = UUID.randomUUID();
        store.freezeSource(id, input, digest, json.valueToTree(entries));
        return new Frozen(id, digest, files);
    }

    @Test void returnsExactBytesOfTheRequestedVersionOnly() throws Exception {
        var store = new LocalVolumeSnapshotStore(temporary.resolve("volume"));
        var first = freeze(store, Map.of("src/pages/HomePage.vue", "<template>第一版</template>\n", "src/data/items.ts", "export const items = [1]\n"));
        var second = freeze(store, Map.of("src/pages/HomePage.vue", "<template>OTHER_VERSION_MARKER</template>\n"));
        var bytes = store.sourceBytes(first.id(), first.digest());
        assertThat(bytes.keySet()).containsExactlyElementsOf(first.files().keySet());
        first.files().forEach((path, expected) -> assertThat(bytes.get(path)).isEqualTo(expected));
        assertThat(bytes.values()).noneMatch(b -> new String(b, StandardCharsets.UTF_8).contains("OTHER_VERSION_MARKER"));
        assertThatThrownBy(() -> bytes.put("x", new byte[0])).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> store.sourceBytes(first.id(), second.digest())).hasMessage("SNAPSHOT_DIGEST_MISMATCH");
        assertThatThrownBy(() -> store.sourceBytes(UUID.randomUUID(), first.digest())).hasMessage("SNAPSHOT_UNAVAILABLE");
    }

    @Test void plantedOrTamperedFrozenFilesFailClosed() throws Exception {
        var store = new LocalVolumeSnapshotStore(temporary.resolve("volume"));
        var frozen = freeze(store, Map.of("src/pages/HomePage.vue", "<template>原版</template>\n"));
        Path source = store.source(frozen.id(), frozen.digest()).directory();
        for (String planted : List.of(".env", "src/pages/.env", "node_modules/x.js", "src/pages/debug.log")) {
            Files.createDirectories(source.resolve(planted).getParent());
            Files.writeString(source.resolve(planted), "CODELESS_DATABASE_PASSWORD=planted");
            assertThatThrownBy(() -> store.sourceBytes(frozen.id(), frozen.digest())).as(planted).hasMessage("SNAPSHOT_PATH_REJECTED");
            Files.delete(source.resolve(planted));
            if (planted.startsWith("node_modules")) Files.delete(source.resolve("node_modules"));
        }
        assertThat(store.sourceBytes(frozen.id(), frozen.digest())).hasSize(1);
        Files.writeString(source.resolve("src/pages/HomePage.vue"), "<template>tampered</template>\n");
        assertThatThrownBy(() -> store.sourceBytes(frozen.id(), frozen.digest())).hasMessage("SNAPSHOT_DIGEST_MISMATCH");
    }
}
