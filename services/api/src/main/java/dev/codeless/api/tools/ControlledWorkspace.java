package dev.codeless.api.tools;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Private platform-owned volume; only this service writes it. Runner receives copied snapshots. */
public final class ControlledWorkspace {
    public record SourceFile(String path, long bytes, String digest) {}
    public record View(List<SourceFile> files, long totalBytes, String sourceDigest) {}
    private final Path root;
    public ControlledWorkspace(Path root) { this.root = root.toAbsolutePath().normalize(); }

    Path source(UUID task) { return root.resolve(task.toString()).resolve("source"); }

    void initialize(UUID task) throws IOException {
        directory(root);
        directory(root.resolve(task.toString()));
        directory(source(task));
        directory(source(task).resolve("src"));
        for (String folder : List.of("pages", "components", "data")) directory(source(task).resolve("src").resolve(folder));
    }

    static void directory(Path path) throws IOException {
        Path absolute = path.toAbsolutePath().normalize();
        Path current = absolute.getRoot();
        for (Path segment : absolute) {
            current = current.resolve(segment);
            if (!Files.exists(current, LinkOption.NOFOLLOW_LINKS)) Files.createDirectory(current);
            check(current, true);
        }
    }

    static void check(Path path, boolean directory) throws IOException {
        var attrs = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (attrs.isSymbolicLink() || attrs.isOther() || (directory ? !attrs.isDirectory() : !attrs.isRegularFile())
                || !path.toAbsolutePath().normalize().equals(path.toRealPath()))
            throw new FileToolFailure("FILE_LINK_REJECTED");
        if (!directory && path.getFileSystem().supportedFileAttributeViews().contains("unix")
                && ((Number) Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS)).longValue() != 1)
            throw new FileToolFailure("FILE_LINK_REJECTED");
    }

    Path target(UUID task, String relative) throws IOException {
        FileToolRegistry.validatePath(relative);
        Path base = source(task), target = base.resolve(relative).normalize();
        if (!target.startsWith(base) || !base.relativize(target).toString().replace('\\', '/').equals(relative))
            throw new FileToolFailure("FILE_PATH_REJECTED");
        directory(target.getParent());
        return target;
    }

    View inspect(UUID task) throws IOException {
        initialize(task);
        List<SourceFile> files = new ArrayList<>();
        visit(source(task), source(task), files);
        files.sort(Comparator.comparing(SourceFile::path));
        java.util.Set<String> portablePaths = new java.util.HashSet<>();
        for (var file : files) if (!portablePaths.add(file.path().toLowerCase(java.util.Locale.ROOT)))
            throw new FileToolFailure("FILE_PATH_CONFLICT");
        long total = files.stream().mapToLong(SourceFile::bytes).sum();
        if (total > FileToolRegistry.MAX_TOTAL_BYTES) throw new FileToolFailure("FILE_TOTAL_LIMIT");
        return view(files, total);
    }

    private void visit(Path base, Path current, List<SourceFile> files) throws IOException {
        check(current, true);
        try (var stream = Files.newDirectoryStream(current)) {
            for (Path child : stream) {
                String relative = base.relativize(child).toString().replace('\\', '/');
                var attrs = Files.readAttributes(child, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
                if (attrs.isSymbolicLink() || attrs.isOther()) throw new FileToolFailure("FILE_LINK_REJECTED");
                if (attrs.isDirectory()) {
                    if (!Set.of("src", "src/pages", "src/components", "src/data").contains(relative))
                        throw new FileToolFailure("FILE_PATH_REJECTED");
                    visit(base, child, files);
                } else {
                    FileToolRegistry.validatePath(relative);
                    if (files.size() >= FileToolRegistry.MAX_FILES) throw new FileToolFailure("FILE_COUNT_LIMIT");
                    byte[] bytes = read(child);
                    files.add(new SourceFile(relative, bytes.length, hash(bytes)));
                }
            }
        }
    }

    static byte[] read(Path path) throws IOException {
        check(path, false);
        var before = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (before.size() > FileToolRegistry.MAX_FILE_BYTES) throw new FileToolFailure("FILE_SIZE_LIMIT");
        ByteBuffer buffer = ByteBuffer.allocate(FileToolRegistry.MAX_FILE_BYTES + 1);
        try (var channel = FileChannel.open(path, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
            while (buffer.hasRemaining() && channel.read(buffer) != -1) { /* bounded */ }
        }
        check(path, false);
        var after = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (!java.util.Objects.equals(before.fileKey(), after.fileKey()) || before.size() != after.size()
                || !before.lastModifiedTime().equals(after.lastModifiedTime())) throw new FileToolFailure("FILE_SOURCE_CHANGED");
        if (buffer.position() > FileToolRegistry.MAX_FILE_BYTES) throw new FileToolFailure("FILE_SIZE_LIMIT");
        return java.util.Arrays.copyOf(buffer.array(), buffer.position());
    }

    static byte[] encode(String text) {
        try {
            var bytes = StandardCharsets.UTF_8.newEncoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).encode(java.nio.CharBuffer.wrap(text));
            if (bytes.remaining() > FileToolRegistry.MAX_FILE_BYTES) throw new FileToolFailure("FILE_SIZE_LIMIT");
            byte[] result = new byte[bytes.remaining()]; bytes.get(result); return result;
        } catch (CharacterCodingException exception) { throw new FileToolFailure("FILE_ENCODING_INVALID"); }
    }

    static String decode(byte[] bytes) {
        try { return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes)).toString(); }
        catch (CharacterCodingException exception) { throw new FileToolFailure("FILE_ENCODING_INVALID"); }
    }

    void write(UUID task, Path target, byte[] bytes, boolean replace) throws IOException {
        Path temporary = Files.createTempFile(root.resolve(task.toString()), ".write-", ".tmp");
        try {
            try (var channel = FileChannel.open(temporary, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            directory(target.getParent());
            if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
                check(target, false);
                if (!replace) throw new FileToolFailure("FILE_ALREADY_EXISTS");
            } else if (replace) throw new FileToolFailure("FILE_NOT_FOUND");
            // Root is platform-owned and task row lock serializes every API instance.
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally { Files.deleteIfExists(temporary); }
    }

    static View view(List<SourceFile> files, long total) {
        // Matches D08-B's sorted JSON.stringify([{path,bytes,digest}, ...]) byte for byte.
        byte[] manifest = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsBytes(files);
        return new View(List.copyOf(files), total, hash(manifest));
    }
    static String hash(byte[] bytes) {
        try { return "sha256:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
}
