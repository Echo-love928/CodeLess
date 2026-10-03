package dev.codeless.api.tools;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import tools.jackson.databind.json.JsonMapper;

/** Immutable request/observation/commit receipts on a private persistent volume, outside source. */
public final class FileToolAudit {
    public record Input(String tool, String path, int inputChars, String inputDigest, Integer contentBytes, String contentDigest) {}
    public record Receipt(UUID callId, UUID taskId, String stage, String status, Input input,
                          String observedStatus, String errorCode, Long durationMs,
                          String beforeDigest, String afterDigest, ControlledWorkspace.View source, String occurredAt) {}
    private final Path root;
    private final JsonMapper mapper = JsonMapper.builder().build();
    public FileToolAudit(Path root) { this.root = root.toAbsolutePath().normalize(); }

    int count(UUID task) {
        try {
            ControlledWorkspace.directory(root.resolve(task.toString()));
            try (var paths = Files.newDirectoryStream(root.resolve(task.toString()), "*.request.json")) {
                int count = 0;
                for (var ignored : paths) { if (++count >= FileToolRegistry.MAX_CALLS) break; }
                return count;
            }
        } catch (IOException exception) { throw new FileToolFailure("FILE_AUDIT_UNAVAILABLE"); }
    }

    void write(Receipt receipt, String phase) {
        Path temporary = null;
        try {
            Path directory = root.resolve(receipt.taskId().toString());
            ControlledWorkspace.directory(directory);
            Path target = directory.resolve(receipt.callId() + "." + phase + ".json");
            if (Files.exists(target, java.nio.file.LinkOption.NOFOLLOW_LINKS)) throw new IOException("immutable receipt exists");
            temporary = Files.createTempFile(directory, ".receipt-", ".tmp");
            byte[] bytes = (mapper.writeValueAsString(receipt) + "\n").getBytes(StandardCharsets.UTF_8);
            try (var channel = FileChannel.open(temporary, StandardOpenOption.WRITE)) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException exception) { throw new FileToolFailure("FILE_AUDIT_UNAVAILABLE"); }
        finally { if (temporary != null) try { Files.deleteIfExists(temporary); } catch (IOException ignored) { /* private */ } }
    }
}
