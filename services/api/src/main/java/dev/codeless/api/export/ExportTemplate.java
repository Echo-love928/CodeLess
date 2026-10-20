package dev.codeless.api.export;

import dev.codeless.api.versions.LocalVolumeSnapshotStore;
import dev.codeless.api.versions.SnapshotStore;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;

/**
 * Controlled Vue template inputs for source export, read from the trusted, read-only repository checkout that also
 * builds the runner image. Only the explicit allowlist below is opened; nothing else under the root is listed or read.
 */
public final class ExportTemplate {
    /** Build-image-owned configuration, lockfile and entry files. A version can never supply these paths. */
    public static final List<String> FIXED = List.of("index.html", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
            "src/App.vue", "src/build-node.d.ts", "src/main.ts", "src/router.ts", "tsconfig.json", "vite.config.ts");
    /** Default page slots. A version file at the same path replaces it, exactly like the build container overlay. */
    public static final List<String> DEFAULTS = List.of("src/pages/CatalogPage.vue", "src/pages/HomePage.vue", "src/pages/TasksPage.vue");
    public static final String TEMPLATE_ROOT = "templates/vue", README_TEMPLATE = "docs/generated-project-readme.md";
    static final int MAX_FILE_BYTES = 1024 * 1024, MAX_README_BYTES = 64 * 1024;

    public record Loaded(Map<String, byte[]> fixed, Map<String, byte[]> defaults, String readme,
                         String node, String pnpm, String digest) {}

    private final Path repository;
    private final JsonMapper json = JsonMapper.builder().build();

    public ExportTemplate(Path repository) { this.repository = repository.toAbsolutePath().normalize(); }

    public Loaded load() {
        try {
            Path root = repository.resolve(TEMPLATE_ROOT);
            var fixed = new LinkedHashMap<String, byte[]>();
            for (String path : FIXED) fixed.put(path, canonical(read(root, path, MAX_FILE_BYTES)));
            var defaults = new LinkedHashMap<String, byte[]>();
            for (String path : DEFAULTS) defaults.put(path, canonical(read(root, path, MAX_FILE_BYTES)));
            String readme = new String(canonical(read(repository, README_TEMPLATE, MAX_README_BYTES)), StandardCharsets.UTF_8);
            var engines = json.readTree(fixed.get("package.json")).path("engines");
            String node = engines.path("node").asText(), pnpm = engines.path("pnpm").asText();
            if (!node.matches("[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}") || !pnpm.matches("[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}"))
                throw new ExportFailure("EXPORT_TEMPLATE_INVALID");
            return new Loaded(Collections.unmodifiableMap(fixed), Collections.unmodifiableMap(defaults), readme, node, pnpm,
                    digest(json, fixed));
        } catch (ExportFailure failure) { throw failure; }
        catch (NoSuchFileException missing) { throw new ExportFailure("EXPORT_TEMPLATE_UNAVAILABLE", missing); }
        catch (Exception failure) { throw new ExportFailure("EXPORT_TEMPLATE_INVALID", failure); }
    }

    /** D11 canonical identity: SHA-256 of sorted UTF-8 JSON [{path,bytes,digest}]. */
    static String digest(JsonMapper json, Map<String, byte[]> files) {
        var entries = files.entrySet().stream()
                .map(e -> new SnapshotStore.Entry(e.getKey(), e.getValue().length, LocalVolumeSnapshotStore.hash(e.getValue())))
                .sorted(Comparator.comparing(SnapshotStore.Entry::path)).toList();
        return LocalVolumeSnapshotStore.hash(json.writeValueAsBytes(entries));
    }

    /** Regular, single-link file whose real path is exactly the requested child; no link, junction or alias. */
    private static byte[] read(Path base, String relative, int limit) throws Exception {
        Path realBase = base.toRealPath();
        Path file = base.resolve(relative).normalize();
        if (!file.startsWith(base)) throw new ExportFailure("EXPORT_TEMPLATE_INVALID");
        for (Path current = file; !current.equals(base); current = current.getParent())
            if (Files.isSymbolicLink(current)) throw new ExportFailure("EXPORT_TEMPLATE_INVALID");
        if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
            if (!Files.exists(file, LinkOption.NOFOLLOW_LINKS)) throw new NoSuchFileException(relative);
            throw new ExportFailure("EXPORT_TEMPLATE_INVALID");
        }
        // String comparison: Windows Path.equals ignores case and would accept a case alias.
        if (!file.toRealPath().toString().equals(realBase.resolve(relative).normalize().toString()))
            throw new ExportFailure("EXPORT_TEMPLATE_INVALID");
        if (file.getFileSystem().supportedFileAttributeViews().contains("unix")
                && ((Number) Files.getAttribute(file, "unix:nlink", LinkOption.NOFOLLOW_LINKS)).longValue() != 1)
            throw new ExportFailure("EXPORT_TEMPLATE_INVALID");
        if (Files.size(file) > limit) throw new ExportFailure("EXPORT_LIMIT_EXCEEDED");
        byte[] bytes;
        try (var stream = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS)) { bytes = stream.readNBytes(limit + 1); }
        if (bytes.length > limit) throw new ExportFailure("EXPORT_LIMIT_EXCEEDED");
        return bytes;
    }

    /**
     * Repository text is stored with LF; a Windows checkout may present CRLF. Export the Git-canonical LF bytes so
     * the template identity is the same on every platform. Lone CR or invalid UTF-8 is rejected, not repaired.
     */
    static byte[] canonical(byte[] bytes) throws Exception {
        String text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        String lf = text.replace("\r\n", "\n");
        if (lf.indexOf('\r') >= 0) throw new ExportFailure("EXPORT_TEMPLATE_INVALID");
        return lf.getBytes(StandardCharsets.UTF_8);
    }
}
