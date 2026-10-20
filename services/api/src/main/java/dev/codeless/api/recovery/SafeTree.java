package dev.codeless.api.recovery;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.util.Set;

/**
 * Bounded deletion of one direct child of a platform-owned root. Links, Windows junctions and other reparse points
 * are never followed or deleted through: any doubt rejects the whole candidate, which is then left for an operator.
 */
final class SafeTree {
    static final int MAX_ENTRIES = 50_000;

    static final class Rejected extends IOException {
        Rejected(String code) { super(code); }
    }

    private SafeTree() {}

    static Path normal(Path path) {
        return path.toAbsolutePath().normalize();
    }

    /** An existing real directory whose own path contains no link or junction. */
    static boolean realDirectory(Path path) {
        try {
            Path absolute = normal(path);
            return Files.isDirectory(absolute, LinkOption.NOFOLLOW_LINKS) && absolute.equals(absolute.toRealPath());
        } catch (IOException unreadable) {
            return false;
        }
    }

    static boolean overlaps(Path a, Path b) {
        Path x = normal(a), y = normal(b);
        return x.startsWith(y) || y.startsWith(x);
    }

    /** Newest modification time of the subtree, or a rejection when it holds links/junctions or is too large. */
    static Instant newest(Path target) throws IOException {
        var newest = new Instant[] {Instant.EPOCH};
        walk(target, (path, attributes) -> {
            Instant modified = attributes.lastModifiedTime().toInstant();
            if (modified.isAfter(newest[0])) newest[0] = modified;
        });
        return newest[0];
    }

    /** Deletes {@code target}, which must be a direct child of {@code root}. Returns the removed entry count. */
    static int delete(Path root, Path target) throws IOException {
        Path base = normal(root), candidate = normal(target);
        if (!base.equals(candidate.getParent())) throw new Rejected("CLEANUP_PATH_REJECTED");
        if (!realDirectory(base)) throw new Rejected("CLEANUP_ROOT_REJECTED");
        if (!Files.exists(candidate, LinkOption.NOFOLLOW_LINKS)) return 0;
        int entries = walk(candidate, (path, attributes) -> { }); // full pre-scan: reject before deleting anything
        Files.walkFileTree(candidate, Set.of(), Integer.MAX_VALUE, new SimpleFileVisitor<>() {
            @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attributes) throws IOException {
                plain(dir, attributes);
                return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) throws IOException {
                plain(file, attributes);
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult postVisitDirectory(Path dir, IOException failure) throws IOException {
                if (failure != null) throw failure;
                Files.delete(dir);
                return FileVisitResult.CONTINUE;
            }
        });
        return entries;
    }

    private interface Visit { void accept(Path path, BasicFileAttributes attributes) throws IOException; }

    private static int walk(Path target, Visit visit) throws IOException {
        var count = new int[] {0};
        Files.walkFileTree(normal(target), Set.of(), Integer.MAX_VALUE, new SimpleFileVisitor<>() {
            @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attributes) throws IOException {
                plain(dir, attributes);
                if (++count[0] > MAX_ENTRIES) throw new Rejected("CLEANUP_TREE_TOO_LARGE");
                visit.accept(dir, attributes);
                return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) throws IOException {
                plain(file, attributes);
                if (++count[0] > MAX_ENTRIES) throw new Rejected("CLEANUP_TREE_TOO_LARGE");
                visit.accept(file, attributes);
                return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult visitFileFailed(Path file, IOException failure) throws IOException {
                throw failure;
            }
        });
        return count[0];
    }

    /** Junctions report isDirectory() and isOther() on Windows; the real-path check also catches linked ancestors. */
    private static void plain(Path path, BasicFileAttributes attributes) throws IOException {
        if (attributes.isSymbolicLink() || attributes.isOther()) throw new Rejected("CLEANUP_LINK_REJECTED");
        if (attributes.isDirectory() && !normal(path).equals(path.toRealPath())) throw new Rejected("CLEANUP_LINK_REJECTED");
    }
}
