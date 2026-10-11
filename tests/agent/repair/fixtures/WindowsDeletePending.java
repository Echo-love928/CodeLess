import java.nio.channels.FileChannel;
import java.nio.file.*;
import static java.nio.file.StandardOpenOption.READ;

/** Diagnostic mechanism fixture, not proof of the historical file-tool failure's handle owner. */
class WindowsDeletePending {
    public static void main(String[] args) throws Exception {
        if (!System.getProperty("os.name").startsWith("Windows") || args.length != 1)
            throw new IllegalArgumentException("Windows and a private task output directory required");
        Path parent = Path.of(args[0]).toAbsolutePath().normalize();
        Path allowed = Path.of(".local-data/d10-a").toAbsolutePath().normalize();
        if (!parent.startsWith(allowed)) throw new IllegalArgumentException("Output outside private task directory");
        Files.createDirectories(parent);
        run(parent, false);
        run(parent, true);
    }
    private static void run(Path parent, boolean held) throws Exception {
        Path directory = Files.createTempDirectory(parent, "delete-pending-");
        if (!directory.getParent().equals(parent)) throw new IllegalStateException("Fixture path escaped parent");
        Path file = directory.resolve("receipt.json");
        Files.writeString(file, "explicit diagnostic fixture\n");
        String fileDelete = "NOT_ATTEMPTED", directoryDelete = "NOT_ATTEMPTED";
        boolean fileVisible;
        int entries = 0;
        FileChannel channel = FileChannel.open(file, READ);
        try {
            if (!held) channel.close();
            try { Files.delete(file); fileDelete = "DELETED"; }
            catch (Exception error) { fileDelete = error.getClass().getSimpleName(); }
            fileVisible = Files.exists(file, LinkOption.NOFOLLOW_LINKS);
            try (var stream = Files.newDirectoryStream(directory)) { for (var ignored : stream) entries++; }
            try { Files.delete(directory); directoryDelete = "DELETED"; }
            catch (Exception error) { directoryDelete = error.getClass().getSimpleName(); }
        } finally { channel.close(); }
        // Own freshly created paths only; no recursive delete, retry loop or historical scene removal.
        Files.deleteIfExists(file);
        Files.deleteIfExists(directory);
        String report = "{\"heldHandleFixture\":" + held + ",\"fileDelete\":\"" + fileDelete
                + "\",\"fileVisibleAfterDelete\":" + fileVisible + ",\"directoryEntriesAfterFileDelete\":" + entries
                + ",\"directoryDeleteBeforeRelease\":\"" + directoryDelete + "\",\"releasedThenRemoved\":true"
                + ",\"historicalHandleOwner\":null,\"historicalRootCause\":\"UNKNOWN\"}\n";
        Files.writeString(parent.resolve(held ? "held-handle-mechanism.json" : "closed-handle-control.json"), report);
        System.out.print(report);
    }
}
