package dev.codeless.api.tools;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Comparator;
import java.util.stream.Stream;

/** Test-owned teardown: release all enumeration handles before deleting any entry. */
public final class OwnedWorkspaceCleanup {
    @FunctionalInterface interface Walk { Stream<Path> open(Path root) throws IOException; }
    @FunctionalInterface interface Delete { void remove(Path path) throws IOException; }

    public static void delete(Path root, Path parent) throws IOException {
        delete(root, parent, p -> snapshot(p).stream(), Files::delete);
    }

    static void delete(Path root, Path parent, Walk walk, Delete delete) throws IOException {
        Path owned = root.toAbsolutePath().normalize();
        Path expected = parent.toAbsolutePath().normalize();
        if (!expected.equals(owned.getParent()) || !owned.getFileName().toString().startsWith("task-"))
            throw new IOException("Workspace teardown ownership mismatch");
        if (Files.notExists(owned, LinkOption.NOFOLLOW_LINKS)) return;
        if (!Files.isDirectory(owned, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(owned)
                || !owned.toRealPath().equals(expected.toRealPath().resolve(owned.getFileName())))
            throw new IOException("Workspace teardown root is not an owned real directory");
        java.util.List<Path> entries;
        // Files.walkFileTree deletes entries while ancestor enumeration handles are
        // still open. Snapshot without following links, then close before deleting.
        try (var stream = walk.open(owned)) {
            entries = stream.sorted(Comparator.comparingInt(Path::getNameCount).reversed()).toList();
        }
        for (Path entry : entries) {
            if (!entry.toAbsolutePath().normalize().startsWith(owned))
                throw new IOException("Workspace teardown entry escaped ownership");
        }
        for (Path entry : entries) {
            try {delete.remove(entry);}
            catch(IOException failure) {
                // Keep the original native failure. Capture the directory immediately,
                // before JUnit or an operator changes it; never retry a failed delete.
                String state="UNKNOWN";long remaining=-1;
                try {
                    if(Files.notExists(entry,LinkOption.NOFOLLOW_LINKS)) state="ALREADY_ABSENT";
                    else if(Files.isDirectory(entry,LinkOption.NOFOLLOW_LINKS) && !Files.isSymbolicLink(entry)) {
                        try(var children=Files.newDirectoryStream(entry)) {remaining=0;for(var ignored:children)remaining++;}
                        state=remaining==0?"EMPTY_AT_FAILURE":"ENTRIES_AT_FAILURE";
                    } else state="NON_DIRECTORY_AT_FAILURE";
                } catch(IOException unavailable) {state="INSPECTION_FAILED";}
                failure.addSuppressed(new IOException("Owned cleanup diagnostic: os="+System.getProperty("os.name")+
                        "; relative="+owned.relativize(entry)+"; state="+state+"; remaining="+remaining+"; retries=0"));
                throw failure;
            }
        }
        if (!Files.notExists(owned, LinkOption.NOFOLLOW_LINKS))
            throw new IOException("Workspace teardown absence was not confirmed");
    }

    private static java.util.List<Path> snapshot(Path root) throws IOException {
        var entries=new java.util.ArrayList<Path>();
        // Windows junctions are reported as isOther, not necessarily symbolic
        // links. Never enumerate a reparse target, even with default walk flags.
        try(var children=Files.newDirectoryStream(root)) {
            for(Path child:children) {
                var attrs=Files.readAttributes(child,BasicFileAttributes.class,LinkOption.NOFOLLOW_LINKS);
                if(attrs.isDirectory()&&!attrs.isSymbolicLink()&&!attrs.isOther())entries.addAll(snapshot(child));
                else entries.add(child);
            }
        }
        entries.add(root);
        return entries;
    }
}
