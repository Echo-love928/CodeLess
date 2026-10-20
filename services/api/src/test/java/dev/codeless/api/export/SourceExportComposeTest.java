package dev.codeless.api.export;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.versions.LocalVolumeSnapshotStore;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Package shape without a database: the HTTP integration test covers real VERIFIED versions end to end. */
class SourceExportComposeTest {
    static final Path REPOSITORY = Path.of("../..").toAbsolutePath().normalize();
    final JsonMapper json = JsonMapper.builder().build();

    static Map<String, byte[]> source() throws Exception {
        var source = new TreeMap<String, byte[]>();
        source.put("src/pages/HomePage.vue", Files.readAllBytes(REPOSITORY.resolve("templates/vue/fixtures/mapping/src/pages/HomePage.vue")));
        source.put("src/components/SharedCard.vue", Files.readAllBytes(REPOSITORY.resolve("templates/vue/fixtures/mapping/src/components/SharedCard.vue")));
        return source;
    }
    static SourceExportService.Identity identity(Map<String, byte[]> source) {
        return new SourceExportService.Identity(UUID.fromString("11111111-1111-4111-8111-111111111111"),
                UUID.fromString("55555555-5555-4555-8555-555555555555"), 7, UUID.fromString("66666666-6666-4666-8666-666666666666"),
                ExportTemplate.digest(JsonMapper.builder().build(), source), "sha256:" + "a".repeat(64), "sha256:" + "b".repeat(64),
                OffsetDateTime.parse("2026-10-19T09:30:00+09:00"));
    }

    @Test void composesAllowlistedOriginsDigestsAndRunInstructions() throws Exception {
        var source = source();
        var fixed = new ExportTemplate(REPOSITORY).load();
        var export = SourceExportService.compose(identity(source), source, fixed);
        var m = export.manifest();
        assertThat(export.root()).isEqualTo("codeless-55555555-5555-4555-8555-555555555555");
        var origins = new TreeMap<String, String>();
        m.files().forEach(f -> origins.put(f.path(), f.origin()));
        var expected = new TreeMap<String, String>();
        ExportTemplate.FIXED.forEach(p -> expected.put(p, "TEMPLATE"));
        expected.put("src/pages/HomePage.vue", "VERSION_SOURCE");
        expected.put("src/components/SharedCard.vue", "VERSION_SOURCE");
        expected.put("src/pages/TasksPage.vue", "TEMPLATE_DEFAULT");
        expected.put("src/pages/CatalogPage.vue", "TEMPLATE_DEFAULT");
        expected.put("README.md", "README");
        assertThat(origins).isEqualTo(expected);
        assertThat(export.entries().stream().map(ExportArchive.Entry::path).toList())
                .containsExactlyElementsOf(new TreeSet<>(Set.copyOf(concat(expected.keySet(), List.of("codeless-export.json")))));
        var bytes = new HashMap<String, byte[]>();
        export.entries().forEach(e -> bytes.put(e.path(), e.bytes()));
        for (var file : m.files()) {
            assertThat(bytes.get(file.path()).length).isEqualTo(file.bytes());
            assertThat(LocalVolumeSnapshotStore.hash(bytes.get(file.path()))).isEqualTo(file.digest());
        }
        source.forEach((path, b) -> assertThat(bytes.get(path)).as("version bytes are exported unmodified").isEqualTo(b));
        assertThat(m.sourceDigest()).isEqualTo(digest(m, "VERSION_SOURCE")).isEqualTo(identity(source).sourceDigest());
        assertThat(m.templateDigest()).isEqualTo(digest(m, "TEMPLATE")).isEqualTo(fixed.digest());
        assertThat(m.contentDigest()).isEqualTo(digest(m, null));
        var parsed = json.readTree(bytes.get("codeless-export.json"));
        assertThat(parsed.propertyNames()).containsExactly("protocol", "applicationId", "versionId", "versionNumber", "status", "buildId",
                "sourceDigest", "artifactDigest", "reportDigest", "templateDigest", "contentDigest", "toolchain", "files");
        assertThat(json.treeToValue(parsed, SourceExportService.Manifest.class)).isEqualTo(m);
        String readme = new String(bytes.get("README.md"), StandardCharsets.UTF_8);
        assertThat(readme).contains(m.versionId().toString(), m.sourceDigest(), m.artifactDigest(), m.templateDigest(), export.root(),
                "corepack pnpm@" + fixed.pnpm() + " install --frozen-lockfile", "Node.js " + fixed.node()).doesNotContain("{{", "\r");
        assertThat(export.modified()).isEqualTo(java.time.LocalDateTime.of(2026, 10, 19, 0, 30));

        var out = new ByteArrayOutputStream();
        ExportArchive.write(out, export.root(), export.entries(), export.modified());
        var names = new ArrayList<String>();
        try (var zip = new ZipInputStream(new ByteArrayInputStream(out.toByteArray()))) {
            for (var e = zip.getNextEntry(); e != null; e = zip.getNextEntry()) names.add(e.getName());
        }
        assertThat(names).allMatch(n -> n.startsWith(export.root() + "/")).hasSize(export.entries().size());
        // Developer smoke input for tests/export Node tools; the official T1-T4 archive comes from the HTTP test.
        Path target = Files.createDirectories(Path.of("target/export-compose"));
        Files.write(target.resolve("compose.zip"), out.toByteArray());
    }

    /** D16-B review P2: every path the frozen store accepts (≤240) is exported completely under the real root. */
    @Test void longestStoredSourcePathsComposeAndStreamCompletely() throws Exception {
        String reported = "src/pages/" + "A".repeat(210) + ".vue", longest = "src/components/" + "B".repeat(221) + ".vue";
        assertThat(reported).hasSize(224);
        assertThat(longest).hasSize(240);
        var source = new TreeMap<String, byte[]>();
        for (String path : List.of(reported, longest)) {
            dev.codeless.api.versions.LocalVolumeSnapshotStore.sourcePath(path); // accepted by the frozen store
            source.put(path, "<template><p>long</p></template>\n".getBytes(StandardCharsets.UTF_8));
        }
        var export = SourceExportService.compose(identity(source), source, new ExportTemplate(REPOSITORY).load());
        var out = new ByteArrayOutputStream();
        assertThat(ExportArchive.write(out, export.root(), export.entries(), export.modified())).isEqualTo(out.size());
        var names = new ArrayList<String>();
        try (var zip = new ZipInputStream(new ByteArrayInputStream(out.toByteArray()))) {
            for (var e = zip.getNextEntry(); e != null; e = zip.getNextEntry()) { names.add(e.getName()); zip.readAllBytes(); }
        }
        assertThat(names).hasSize(export.entries().size()).contains(export.root() + "/" + reported, export.root() + "/" + longest);
    }

    @Test void versionSourceCannotReplaceFixedFilesOrAddUnapprovedPaths() throws Exception {
        var fixed = new ExportTemplate(REPOSITORY).load();
        for (String path : List.of("src/main.ts", "src/router.ts", "package.json", ".env", "src/pages/.env", "src/pages/Home.ts",
                "node_modules/vue/index.js", "dist/index.html", "src/pages/../../.env")) {
            var source = new TreeMap<>(Map.of(path, "x".getBytes(StandardCharsets.UTF_8)));
            assertThatThrownBy(() -> SourceExportService.compose(identity(source), source, fixed)).as(path).hasMessage("EXPORT_PATH_REJECTED");
        }
        var alias = new TreeMap<String, byte[]>(Map.of("src/pages/HomePage.vue", new byte[] {'a'}, "src/pages/homepage.vue", new byte[] {'b'}));
        assertThatThrownBy(() -> SourceExportService.compose(identity(alias), alias, fixed)).hasMessage("EXPORT_PATH_REJECTED");
    }

    String digest(SourceExportService.Manifest m, String origin) {
        var entries = m.files().stream().filter(f -> origin == null || f.origin().equals(origin))
                .map(f -> new dev.codeless.api.versions.SnapshotStore.Entry(f.path(), f.bytes(), f.digest()))
                .sorted(Comparator.comparing(dev.codeless.api.versions.SnapshotStore.Entry::path)).toList();
        return LocalVolumeSnapshotStore.hash(json.writeValueAsBytes(entries));
    }
    static <T> List<T> concat(Collection<T> a, Collection<T> b) { var r = new ArrayList<T>(a); r.addAll(b); return r; }
}
