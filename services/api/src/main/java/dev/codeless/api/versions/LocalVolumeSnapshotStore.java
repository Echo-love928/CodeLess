package dev.codeless.api.versions;

import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Append-only version directories on a platform-owned persistent volume. DB remains the visibility gate. */
public final class LocalVolumeSnapshotStore implements SnapshotStore {
    private final Path root;
    private final JsonMapper json = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
    public LocalVolumeSnapshotStore(Path root) { this.root = root.toAbsolutePath().normalize(); }
    public static String hash(byte[] bytes) {
        try { return "sha256:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }
    private static void check(Path path, boolean directory) throws Exception {
        Path absolute = path.toAbsolutePath().normalize();
        for (Path current = absolute; current != null; current = current.getParent()) {
            boolean dir = !current.equals(absolute) || directory;
            if (Files.isSymbolicLink(current) || !current.equals(current.toRealPath())
                    || !(dir ? Files.isDirectory(current, LinkOption.NOFOLLOW_LINKS) : Files.isRegularFile(current, LinkOption.NOFOLLOW_LINKS)))
                throw new SnapshotFailure("SNAPSHOT_PATH_REJECTED");
        }
        if (!directory && path.getFileSystem().supportedFileAttributeViews().contains("unix")
                && ((Number) Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS)).longValue() != 1)
            throw new SnapshotFailure("SNAPSHOT_PATH_REJECTED");
    }
    private static void directory(Path path) throws Exception {
        Path absolute = path.toAbsolutePath().normalize(), current = absolute.getRoot();
        for (Path segment : absolute) {
            current = current.resolve(segment);
            if (!Files.exists(current, LinkOption.NOFOLLOW_LINKS)) Files.createDirectory(current);
            check(current, true);
        }
    }
    private static byte[] read(Path path, int limit) throws Exception {
        check(path, false);
        if (Files.size(path) > limit) throw new SnapshotFailure("SNAPSHOT_LIMIT_EXCEEDED");
        byte[] bytes;
        try (var stream = Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS)) { bytes = stream.readNBytes(limit + 1); }
        check(path, false);
        if (bytes.length > limit) throw new SnapshotFailure("SNAPSHOT_LIMIT_EXCEEDED");
        return bytes;
    }
    private static void write(Path path, byte[] bytes) throws Exception {
        directory(path.getParent());
        try (var channel = FileChannel.open(path, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
            var buffer = ByteBuffer.wrap(bytes);
            while (buffer.hasRemaining()) channel.write(buffer);
            channel.force(true);
        }
    }
    public static void sourcePath(String path) {
        if (path == null || path.length() > 240 || !path.matches("src/(?:pages|components)/[A-Za-z][A-Za-z0-9_-]*\\.vue|src/data/[A-Za-z][A-Za-z0-9_-]*\\.ts"))
            throw new SnapshotFailure("SNAPSHOT_PATH_REJECTED");
        String base = path.substring(path.lastIndexOf('/') + 1, path.lastIndexOf('.')).toUpperCase(Locale.ROOT);
        if (Set.of("CON", "PRN", "AUX", "NUL", "CONIN", "CONOUT").contains(base) || base.matches("(?:COM|LPT)[0-9]+"))
            throw new SnapshotFailure("SNAPSHOT_PATH_REJECTED");
    }
    private static void artifactPath(String path) {
        if (path.length() > 240 || !path.matches("[A-Za-z0-9_./-]+") || path.startsWith("/")
                || Arrays.stream(path.split("/", -1)).anyMatch(p -> p.isEmpty() || p.equals(".") || p.equals("..")
                    || p.endsWith(".") || p.matches("(?i)(?:CON|PRN|AUX|NUL|COM[0-9]+|LPT[0-9]+)(?:\\..*)?")))
            throw new SnapshotFailure("SNAPSHOT_PATH_REJECTED");
    }
    private Manifest scan(Path base, boolean source, Path copy) throws Exception {
        check(base, true);
        var entries = new ArrayList<Entry>();
        var names = new HashSet<String>();
        long total = 0; int visited = 0;
        try (var paths = Files.walk(base)) {
            var iterator = paths.iterator();
            while (iterator.hasNext()) {
                Path file = iterator.next();
                if (++visited > (source ? 45 : 4000)) throw new SnapshotFailure("SNAPSHOT_LIMIT_EXCEEDED");
                check(file, Files.isDirectory(file, LinkOption.NOFOLLOW_LINKS));
                String name = base.relativize(file).toString().replace('\\', '/');
                if (Files.isDirectory(file, LinkOption.NOFOLLOW_LINKS)) {
                    if (!name.isEmpty()) {
                        if (source && !Set.of("src", "src/pages", "src/components", "src/data").contains(name))
                            throw new SnapshotFailure("SNAPSHOT_PATH_REJECTED");
                        if (!source) artifactPath(name);
                    }
                    continue;
                }
                if (source) sourcePath(name); else artifactPath(name);
                if (!names.add(name.toLowerCase(Locale.ROOT))) throw new SnapshotFailure("SNAPSHOT_PATH_REJECTED");
                byte[] bytes = read(file, source ? 131072 : 32 * 1024 * 1024);
                total += bytes.length;
                if (total > (source ? 524288 : 32 * 1024 * 1024) || entries.size() >= (source ? 40 : 2000))
                    throw new SnapshotFailure("SNAPSHOT_LIMIT_EXCEEDED");
                if (source) decode(bytes);
                entries.add(new Entry(name, bytes.length, hash(bytes)));
                if (copy != null) write(copy.resolve(name), bytes);
            }
        }
        entries.sort(Comparator.comparing(Entry::path));
        return new Manifest(hash(json.writeValueAsBytes(entries)), List.copyOf(entries));
    }
    private static String decode(byte[] bytes) throws Exception {
        return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
    }
    private Path version(UUID id) { return root.resolve(id.toString()); }
    private static void digest(Manifest actual, String expected, JsonNode files, JsonMapper json) {
        // Jackson's in-memory LongNode(bytes) differs from a parsed small IntNode(bytes).
        // Compare the canonical JSON values, keeping every path/byte/digest field checked.
        if (!actual.digest().equals(expected) || !json.readTree(json.writeValueAsBytes(actual.files()))
                .equals(json.readTree(json.writeValueAsBytes(files))))
            throw new SnapshotFailure("SNAPSHOT_DIGEST_MISMATCH");
    }
    @Override public synchronized Source freezeSource(UUID id, Path input, String expected, JsonNode files) {
        try {
            Path version = version(id); directory(version);
            Path target = version.resolve("source");
            if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) throw new SnapshotFailure("SNAPSHOT_ALREADY_FROZEN");
            Path pending = Files.createTempDirectory(version, ".source-");
            var actual = scan(input.toAbsolutePath().normalize(), true, pending);
            digest(actual, expected, files, json);
            directory(pending); // Empty sources still have an immutable directory.
            write(version.resolve("source-manifest.json"), json.writeValueAsBytes(actual));
            Files.move(pending, target, StandardCopyOption.ATOMIC_MOVE);
            return source(id, expected);
        } catch (SnapshotFailure failure) { throw failure; }
        catch (Exception failure) { throw new SnapshotFailure("SNAPSHOT_UNAVAILABLE"); }
    }
    @Override public Source source(UUID id, String expected) {
        try {
            Path base = version(id).resolve("source");
            var saved = json.readValue(read(version(id).resolve("source-manifest.json"), 1024 * 1024), Manifest.class);
            var actual = scan(base, true, null);
            if (!saved.equals(actual) || !actual.digest().equals(expected)) throw new SnapshotFailure("SNAPSHOT_DIGEST_MISMATCH");
            return new Source(base, actual);
        } catch (SnapshotFailure failure) { throw failure; }
        catch (Exception failure) { throw new SnapshotFailure("SNAPSHOT_UNAVAILABLE"); }
    }
    private String text(JsonNode value, String field, Set<String> allowed) {
        String candidate = value.path(field).asText();
        return allowed.contains(candidate) ? candidate : null;
    }
    private String id(JsonNode value) {
        try { return UUID.fromString(value.asText()).toString(); } catch (Exception invalid) { return null; }
    }
    @Override public synchronized Outcome freezeOutcome(UUID versionId, String sourceDigest, String status, JsonNode result, String failureCode) {
        try {
            source(versionId, sourceDigest);
            if (!Set.of("VERIFIED", "FAILED").contains(status)) throw new SnapshotFailure("SNAPSHOT_STATUS_INVALID");
            Path target = version(versionId).resolve("outcome");
            if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) throw new SnapshotFailure("SNAPSHOT_ALREADY_FROZEN");
            Path pending = Files.createTempDirectory(version(versionId), ".outcome-");
            var build = result.path("build"); var verification = result.path("verification");
            Manifest artifact = null;
            if (status.equals("VERIFIED")) {
                if (!"VERIFIED".equals(result.path("status").asText()) || !sourceDigest.equals(result.path("sourceDigest").asText())
                        || !"SUCCEEDED".equals(build.path("status").asText()) || !build.path("exitCode").isIntegralNumber()
                        || build.path("exitCode").asInt() != 0 || !"PASSED".equals(verification.path("status").asText())
                        || !verification.path("workerExitCode").isIntegralNumber() || verification.path("workerExitCode").asInt() != 0)
                    throw new SnapshotFailure("SNAPSHOT_REPORT_INVALID");
                Path artifactCopy = pending.resolve("artifact"); directory(artifactCopy);
                artifact = scan(Path.of(build.path("artifact").path("directory").asText()).toAbsolutePath().normalize(), false, artifactCopy);
                digest(artifact, build.path("artifact").path("digest").asText(), build.path("artifact").path("files"), json);
                if (!sourceDigest.equals(verification.path("sourceDigest").asText())
                        || !artifact.digest().equals(verification.path("artifactDigest").asText())
                        || !Objects.equals(id(build.path("id")), id(verification.path("buildId")))
                        || id(build.path("id")) == null || id(verification.path("id")) == null)
                    throw new SnapshotFailure("SNAPSHOT_REPORT_INVALID");
            }
            Map<String, Object> report = new LinkedHashMap<>();
            report.put("status", status); report.put("sourceDigest", sourceDigest);
            report.put("buildId", id(build.path("id"))); report.put("buildStatus", text(build, "status", Set.of("QUEUED", "RUNNING", "SUCCEEDED", "FAILED")));
            report.put("exitCode", build.path("exitCode").isIntegralNumber() ? build.path("exitCode").asInt() : null);
            report.put("verificationId", id(verification.path("id"))); report.put("verificationStatus", text(verification, "status", Set.of("PASSED", "FAILED")));
            report.put("artifactDigest", artifact == null ? null : artifact.digest());
            report.put("failureCode", failureCode != null && failureCode.matches("[A-Z][A-Z0-9_]{1,100}") ? failureCode : null);
            byte[] reportBytes = json.writeValueAsBytes(report);
            write(pending.resolve("report.json"), reportBytes);
            var outcome = new Outcome(status, sourceDigest, artifact == null ? null : artifact.digest(), artifact, hash(reportBytes), json.valueToTree(report));
            write(pending.resolve("manifest.json"), json.writeValueAsBytes(outcome));
            Files.move(pending, target, StandardCopyOption.ATOMIC_MOVE);
            return outcome(versionId, sourceDigest, status);
        } catch (SnapshotFailure failure) { throw failure; }
        catch (Exception failure) { throw new SnapshotFailure("SNAPSHOT_UNAVAILABLE"); }
    }
    @Override public Outcome outcome(UUID id, String sourceDigest, String status) {
        try {
            source(id, sourceDigest);
            Path base = version(id).resolve("outcome");
            var outcome = json.readValue(read(base.resolve("manifest.json"), 1024 * 1024), Outcome.class);
            byte[] report = read(base.resolve("report.json"), 131072);
            if (!outcome.status().equals(status) || !outcome.sourceDigest().equals(sourceDigest)
                    || !outcome.reportDigest().equals(hash(report)) || !outcome.report().equals(json.readTree(report)))
                throw new SnapshotFailure("SNAPSHOT_DIGEST_MISMATCH");
            if (status.equals("VERIFIED")) {
                var artifact = scan(base.resolve("artifact"), false, null);
                if (!artifact.equals(outcome.artifact()) || !artifact.digest().equals(outcome.artifactDigest()))
                    throw new SnapshotFailure("SNAPSHOT_DIGEST_MISMATCH");
            } else if (outcome.artifact() != null || outcome.artifactDigest() != null) throw new SnapshotFailure("SNAPSHOT_REPORT_INVALID");
            return outcome;
        } catch (SnapshotFailure failure) { throw failure; }
        catch (Exception failure) { throw new SnapshotFailure("SNAPSHOT_UNAVAILABLE"); }
    }
    @Override public String readSource(UUID id, String digest, String path) {
        sourcePath(path);
        var source = source(id, digest);
        var entry = source.manifest().files().stream().filter(f -> f.path().equals(path)).findFirst()
                .orElseThrow(() -> new SnapshotFailure("SNAPSHOT_FILE_NOT_FOUND"));
        try {
            byte[] bytes = read(source.directory().resolve(path), 131072);
            if (bytes.length != entry.bytes() || !hash(bytes).equals(entry.digest())) throw new SnapshotFailure("SNAPSHOT_DIGEST_MISMATCH");
            return decode(bytes);
        } catch (SnapshotFailure failure) { throw failure; }
        catch (Exception failure) { throw new SnapshotFailure("SNAPSHOT_UNAVAILABLE"); }
    }
}
