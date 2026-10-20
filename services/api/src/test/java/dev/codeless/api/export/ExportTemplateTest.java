package dev.codeless.api.export;

import static org.assertj.core.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

class ExportTemplateTest {
    static final Path REPOSITORY = Path.of("../..").toAbsolutePath().normalize();
    @TempDir Path temporary;

    static byte[] lf(Path file) throws Exception {
        return new String(Files.readAllBytes(file), StandardCharsets.UTF_8).replace("\r\n", "\n").getBytes(StandardCharsets.UTF_8);
    }
    /** Copy of only the inputs an export may read, so planted files cannot come from the real checkout. */
    Path copy() throws Exception {
        Path root = Files.createTempDirectory(temporary, "repository-");
        for (String path : Stream.concat(ExportTemplate.FIXED.stream(), ExportTemplate.DEFAULTS.stream()).toList()) {
            Path target = root.resolve(ExportTemplate.TEMPLATE_ROOT).resolve(path);
            Files.createDirectories(target.getParent());
            Files.copy(REPOSITORY.resolve(ExportTemplate.TEMPLATE_ROOT).resolve(path), target);
        }
        Files.createDirectories(root.resolve("docs"));
        Files.copy(REPOSITORY.resolve(ExportTemplate.README_TEMPLATE), root.resolve(ExportTemplate.README_TEMPLATE));
        return root;
    }

    @Test void loadsExactlyTheAllowlistAsLfCanonicalRepositoryBytes() throws Exception {
        var loaded = new ExportTemplate(REPOSITORY).load();
        assertThat(loaded.fixed().keySet()).containsExactlyElementsOf(ExportTemplate.FIXED);
        assertThat(loaded.defaults().keySet()).containsExactlyElementsOf(ExportTemplate.DEFAULTS);
        var all = new LinkedHashMap<String, byte[]>(loaded.fixed()); all.putAll(loaded.defaults());
        for (var entry : all.entrySet()) {
            assertThat(entry.getValue()).as(entry.getKey()).isEqualTo(lf(REPOSITORY.resolve("templates/vue").resolve(entry.getKey())));
            assertThat(new String(entry.getValue(), StandardCharsets.UTF_8)).as(entry.getKey()).doesNotContain("\r");
        }
        var root = JsonMapper.builder().build().readTree(Files.readAllBytes(REPOSITORY.resolve("package.json"))).path("engines");
        assertThat(loaded.node()).isEqualTo(root.path("node").asText());
        assertThat(loaded.pnpm()).isEqualTo(root.path("pnpm").asText());
        assertThat(loaded.digest()).matches("sha256:[a-f0-9]{64}");
        assertThat(loaded.readme()).contains("{{VERSION_ID}}", "{{SOURCE_DIGEST}}", "{{PNPM_VERSION}}").doesNotContain("\r");
    }

    /**
     * Drift guard: the export must contain exactly what the trusted build image copies from templates/vue,
     * except the platform dependency policy. A new template file therefore needs an explicit export decision.
     */
    @Test void allowlistMatchesBuildImageTemplateInputs() throws Exception {
        var copied = new TreeSet<String>();
        for (String line : Files.readAllLines(REPOSITORY.resolve("infra/build-image/Dockerfile"))) {
            if (!line.startsWith("COPY templates/vue/")) continue;
            var parts = line.trim().split("\\s+");
            for (int i = 1; i < parts.length - 1; i++) {
                Path source = REPOSITORY.resolve(parts[i]);
                Path template = REPOSITORY.resolve("templates/vue");
                if (Files.isDirectory(source)) try (var files = Files.walk(source)) {
                    files.filter(Files::isRegularFile).forEach(f -> copied.add(template.relativize(f).toString().replace('\\', '/')));
                }
                else copied.add(template.relativize(source).toString().replace('\\', '/'));
            }
        }
        var expected = new TreeSet<String>(ExportTemplate.FIXED);
        expected.addAll(ExportTemplate.DEFAULTS);
        expected.add("allowed-dependencies.json");
        assertThat(copied).isEqualTo(expected);
    }

    @Test void plantedSecretsLogsDependenciesAndExtraSourcesAreNeverRead() throws Exception {
        Path root = copy(), template = root.resolve(ExportTemplate.TEMPLATE_ROOT);
        var planted = Map.of(".env", "CODELESS_DATABASE_PASSWORD=planted-secret", ".npmrc", "//registry.npmjs.org/:_authToken=planted-token",
                "node_modules/leak/index.js", "planted-dependency", "npm-debug.log", "planted-log", "dist/index.html", "planted-build",
                "src/pages/Leak.vue", "<template>planted-page</template>", "src/secret.ts", "export const key = 'planted-key'",
                "id_rsa", "-----BEGIN OPENSSH PRIVATE KEY-----");
        for (var entry : planted.entrySet()) {
            Files.createDirectories(template.resolve(entry.getKey()).getParent());
            Files.writeString(template.resolve(entry.getKey()), entry.getValue());
        }
        var loaded = new ExportTemplate(root).load();
        var keys = new TreeSet<String>(loaded.fixed().keySet()); keys.addAll(loaded.defaults().keySet());
        assertThat(keys).doesNotContainAnyElementsOf(planted.keySet());
        for (var bytes : Stream.concat(loaded.fixed().values().stream(), loaded.defaults().values().stream()).toList())
            assertThat(new String(bytes, StandardCharsets.UTF_8)).doesNotContain("planted");
    }

    @Test void crlfIsCanonicalButLoneCarriageReturnAndInvalidUtf8AreRejected() throws Exception {
        assertThat(ExportTemplate.canonical("a\r\nb\n".getBytes(StandardCharsets.UTF_8))).isEqualTo("a\nb\n".getBytes(StandardCharsets.UTF_8));
        assertThatThrownBy(() -> ExportTemplate.canonical("a\rb".getBytes(StandardCharsets.UTF_8))).hasMessage("EXPORT_TEMPLATE_INVALID");
        Path root = copy();
        Files.write(root.resolve("templates/vue/src/main.ts"), new byte[] {(byte) 0xc3, 0x28});
        assertThatThrownBy(() -> new ExportTemplate(root).load()).hasMessage("EXPORT_TEMPLATE_INVALID");
    }

    @Test void missingOversizedOrInvalidInputsFailClosed() throws Exception {
        Path missing = copy();
        Files.delete(missing.resolve("templates/vue/pnpm-lock.yaml"));
        assertThatThrownBy(() -> new ExportTemplate(missing).load()).hasMessage("EXPORT_TEMPLATE_UNAVAILABLE");
        Path readme = copy();
        Files.delete(readme.resolve(ExportTemplate.README_TEMPLATE));
        assertThatThrownBy(() -> new ExportTemplate(readme).load()).hasMessage("EXPORT_TEMPLATE_UNAVAILABLE");
        Path big = copy();
        Files.writeString(big.resolve("templates/vue/vite.config.ts"), "x".repeat(ExportTemplate.MAX_FILE_BYTES + 1));
        assertThatThrownBy(() -> new ExportTemplate(big).load()).hasMessage("EXPORT_LIMIT_EXCEEDED");
        Path directory = copy();
        Files.delete(directory.resolve("templates/vue/tsconfig.json"));
        Files.createDirectory(directory.resolve("templates/vue/tsconfig.json"));
        assertThatThrownBy(() -> new ExportTemplate(directory).load()).hasMessage("EXPORT_TEMPLATE_INVALID");
        Path engines = copy();
        Files.writeString(engines.resolve("templates/vue/package.json"), "{\"engines\":{\"node\":\">=18\",\"pnpm\":\"latest\"}}");
        assertThatThrownBy(() -> new ExportTemplate(engines).load()).hasMessage("EXPORT_TEMPLATE_INVALID");
    }

    @Test void linksJunctionsAndCaseAliasesAreRejected() throws Exception {
        Path outside = Files.createDirectories(temporary.resolve("outside/src"));
        Files.writeString(outside.resolve("main.ts"), "planted outside");
        Path link = copy();
        Files.delete(link.resolve("templates/vue/src/main.ts"));
        boolean created;
        try { Files.createSymbolicLink(link.resolve("templates/vue/src/main.ts"), outside.resolve("main.ts")); created = true; }
        catch (Exception unsupported) { created = false; } // Windows without Developer Mode cannot create file symlinks.
        if (created) assertThatThrownBy(() -> new ExportTemplate(link).load()).hasMessage("EXPORT_TEMPLATE_INVALID");
        if (System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win")) {
            Path junction = copy(), src = junction.resolve("templates/vue/src");
            try (var files = Files.walk(src)) { files.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete()); }
            var mklink = new ProcessBuilder("cmd", "/d", "/c", "mklink", "/J", src.toString(), outside.toString()).redirectErrorStream(true).start();
            mklink.getInputStream().readAllBytes();
            assertThat(mklink.waitFor()).isZero();
            Files.copy(REPOSITORY.resolve("templates/vue/src/App.vue"), outside.resolve("App.vue"));
            assertThatThrownBy(() -> new ExportTemplate(junction).load()).hasMessage("EXPORT_TEMPLATE_INVALID");
            created = true;
        }
        assertThat(created).as("at least one real link type was exercised").isTrue();
        Path alias = copy(), app = alias.resolve("templates/vue/src/App.vue");
        // Two steps: Windows Files.move treats a case-only rename of the same file as a no-op.
        Files.move(Files.move(app, app.resolveSibling("renamed.vue")), app.resolveSibling("app.vue"));
        try (var names = Files.list(app.getParent())) {
            assertThat(names.map(p -> p.getFileName().toString())).contains("app.vue").doesNotContain("App.vue");
        }
        // Case-insensitive filesystems resolve the alias, which must be rejected; case-sensitive ones report it missing.
        assertThatThrownBy(() -> new ExportTemplate(alias).load()).isInstanceOf(ExportFailure.class)
                .satisfies(e -> assertThat(e.getMessage()).isIn("EXPORT_TEMPLATE_INVALID", "EXPORT_TEMPLATE_UNAVAILABLE"));
    }

    @Test void readmeAcceptsOnlyKnownServerValues() throws Exception {
        var loaded = new ExportTemplate(REPOSITORY).load();
        var values = new HashMap<String, String>(Map.of("APPLICATION_ID", "a", "VERSION_ID", "v", "VERSION_NUMBER", "1", "SOURCE_DIGEST", "s",
                "ARTIFACT_DIGEST", "x", "TEMPLATE_DIGEST", "t", "NODE_VERSION", "n", "PNPM_VERSION", "p", "ROOT_FOLDER", "r"));
        String rendered = new String(SourceExportService.readme(loaded, values), StandardCharsets.UTF_8);
        assertThat(rendered).doesNotContainPattern("\\{\\{[A-Z][A-Z_]*\\}\\}").contains("`v`", "corepack pnpm@p install --frozen-lockfile");
        var unknown = new ExportTemplate.Loaded(loaded.fixed(), loaded.defaults(), loaded.readme() + "{{DATABASE_PASSWORD}}",
                loaded.node(), loaded.pnpm(), loaded.digest());
        assertThatThrownBy(() -> SourceExportService.readme(unknown, values)).hasMessage("EXPORT_TEMPLATE_INVALID");
        var missing = new ExportTemplate.Loaded(loaded.fixed(), loaded.defaults(), "# no version", loaded.node(), loaded.pnpm(), loaded.digest());
        assertThatThrownBy(() -> SourceExportService.readme(missing, values)).hasMessage("EXPORT_TEMPLATE_INVALID");
    }
}
