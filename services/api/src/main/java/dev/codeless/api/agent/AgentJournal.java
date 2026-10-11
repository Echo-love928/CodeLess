package dev.codeless.api.agent;

import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Append-only private recovery record. A pending reservation is never replayed automatically. */
public final class AgentJournal {
    private static final int MAX_EVENTS=160; // 12 model attempts, 20 tools and all three repair checkpoints.
    private final Path root;
    private final JsonMapper json = JsonMapper.builder().build();
    public AgentJournal(Path root) { this.root = root.toAbsolutePath().normalize(); }

    public synchronized List<JsonNode> read(UUID task) {
        try {
            Path directory = root.resolve(task.toString());
            safeDirectory(directory);
            List<JsonNode> events = new ArrayList<>();
            try (var stream = Files.list(directory)) {
                for (Path file : stream.sorted().toList()) {
                    if (!file.getFileName().toString().matches("[0-9]{4}\\.json")) throw new AgentFailure("AGENT_CHECKPOINT_INVALID");
                    safeFile(file);
                    if (Files.size(file) > 2 * 1024 * 1024) throw new AgentFailure("AGENT_CHECKPOINT_INVALID");
                    var event = json.readTree(Files.readString(file));
                    if (event.path("sequence").asInt() != events.size() + 1 || !task.toString().equals(event.path("taskId").asText()))
                        throw new AgentFailure("AGENT_CHECKPOINT_INVALID");
                    events.add(event);
                }
            }
            if (events.size() > MAX_EVENTS) throw new AgentFailure("AGENT_CHECKPOINT_INVALID");
            return List.copyOf(events);
        } catch (AgentFailure failure) { throw failure; }
        catch (Exception failure) { throw new AgentFailure("AGENT_CHECKPOINT_UNAVAILABLE"); }
    }

    public synchronized void append(UUID task, String stage, String kind, Object payload) {
        var events = read(task);
        if (events.size() >= MAX_EVENTS) throw new AgentFailure("AGENT_CHECKPOINT_LIMIT");
        try {
            var event = Map.of("sequence", events.size() + 1, "taskId", task.toString(), "stage", stage,
                    "kind", kind, "payload", payload, "at", java.time.Instant.now().toString());
            byte[] bytes = json.writeValueAsString(event).getBytes(StandardCharsets.UTF_8);
            if (bytes.length > 2 * 1024 * 1024) throw new AgentFailure("AGENT_CHECKPOINT_LIMIT");
            Path file = root.resolve(task.toString()).resolve(String.format(Locale.ROOT, "%04d.json", events.size() + 1));
            try (var channel = FileChannel.open(file, StandardOpenOption.WRITE, StandardOpenOption.CREATE_NEW)) {
                var buffer = java.nio.ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
        } catch (AgentFailure failure) { throw failure; }
        catch (Exception failure) { throw new AgentFailure("AGENT_CHECKPOINT_UNAVAILABLE"); }
    }

    static void safeDirectory(Path path) throws Exception {
        Path current = path.toAbsolutePath().normalize().getRoot();
        for (Path part : path.toAbsolutePath().normalize()) {
            current = current.resolve(part);
            if (!Files.exists(current, LinkOption.NOFOLLOW_LINKS)) Files.createDirectory(current);
            if (!Files.isDirectory(current, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(current)
                    || !current.equals(current.toRealPath())) throw new AgentFailure("AGENT_PATH_REJECTED");
        }
    }
    static void safeFile(Path path) throws Exception {
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(path)
                || !path.toAbsolutePath().normalize().equals(path.toRealPath())) throw new AgentFailure("AGENT_PATH_REJECTED");
        if (path.getFileSystem().supportedFileAttributeViews().contains("unix")
                && ((Number) Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS)).longValue() != 1)
            throw new AgentFailure("AGENT_PATH_REJECTED");
    }
    public static JsonNode latest(List<JsonNode> events, String kind) {
        return events.stream().filter(e -> kind.equals(e.path("kind").asText())).reduce((a,b) -> b)
                .map(e -> e.path("payload")).orElseThrow(() -> new AgentFailure("AGENT_CHECKPOINT_MISSING"));
    }
}
