package dev.codeless.api.model;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Private platform volume, never mounted in generated-code containers. No prompts or secrets. */
public final class ModelCallAudit {
    public record Record(UUID callId, UUID taskId, String stage, String provider, String requestedModel,
                         String actualModel, String requestId, String responseId, String status,
                         Long durationMs, ModelProvider.Usage usage, String errorCode,
                         String createdAt, String completedAt) {}
    private final Path root;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public ModelCallAudit(Path root) { this.root = root.toAbsolutePath().normalize(); }
    public Path write(Record record) { return write(record.callId() + ".json", mapper.writeValueAsString(record)); }
    public Path writePlan(UUID id, JsonNode plan) { return write(id + ".plan.json", plan.toString()); }
    public Path recordPath(UUID id) { return root.resolve(id + ".json"); }

    private Path write(String filename, String content) {
        Path temporary = null;
        try {
            Files.createDirectories(root);
            if (Files.isSymbolicLink(root)) throw new IOException("Audit root must not be a symlink");
            temporary = Files.createTempFile(root, ".model-", ".tmp");
            Files.writeString(temporary, content + "\n", StandardCharsets.UTF_8);
            try (var channel = FileChannel.open(temporary, StandardOpenOption.WRITE)) { channel.force(true); }
            Path target = root.resolve(filename);
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            return target;
        } catch (IOException exception) {
            throw new ModelFailure("MODEL_AUDIT_UNAVAILABLE");
        } finally {
            if (temporary != null) try { Files.deleteIfExists(temporary); } catch (IOException ignored) { /* no secrets */ }
        }
    }
}
