package dev.codeless.api.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Private append-only administrator audit ledger. An immutable REQUESTED record is written (and forced to disk)
 * before the action runs; a separate immutable COMPLETED record follows. A missing completion stays UNKNOWN.
 * Any unreadable or unexpected ledger content fails closed instead of silently dropping entries.
 */
@Component
public class AdminAuditLog {
    public static final class Unavailable extends RuntimeException {
        Unavailable(Throwable cause) { super("ADMIN_AUDIT_UNAVAILABLE", cause, false, false); }
    }
    record Requested(UUID id, String action, UUID actorId, String targetType, UUID targetId, String reason,
                     String requestedAt) {}
    record Completed(UUID id, String outcome, String previousStatus, String resultingStatus, String completedAt) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Entry(UUID id, String action, UUID actorId, String targetType, UUID targetId, String reason,
                        Instant requestedAt, String outcome, String previousStatus, String resultingStatus,
                        Instant completedAt) {}

    private static final Pattern NAME = Pattern.compile(
            "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\.(requested|completed)\\.json");
    private static final long MAX_RECORD_BYTES = 8192;
    private final JsonMapper json = JsonMapper.builder().build();
    private final Path root;

    public AdminAuditLog(@Value("${codeless.admin.audit-root:${codeless.agent.private-root:.local-data/agent}/admin-audit}")
                         String root) {
        this.root = Path.of(root).toAbsolutePath().normalize();
    }

    public synchronized Entry request(String action, UUID actorId, String targetType, UUID targetId, String reason) {
        Requested requested = new Requested(UUID.randomUUID(), action, actorId, targetType, targetId, reason,
                Instant.now().toString());
        write(requested.id(), "requested", requested);
        return entry(requested, null);
    }

    public synchronized Entry complete(Entry requested, String outcome, String previousStatus, String resultingStatus) {
        Completed completed = new Completed(requested.id(), outcome, previousStatus, resultingStatus,
                Instant.now().toString());
        write(requested.id(), "completed", completed);
        return entry(new Requested(requested.id(), requested.action(), requested.actorId(), requested.targetType(),
                requested.targetId(), requested.reason(), requested.requestedAt().toString()), completed);
    }

    Path root() {
        return root;
    }

    /** All entries, newest first. */
    public synchronized List<Entry> entries() {
        Map<UUID, Requested> requested = new HashMap<>();
        Map<UUID, Completed> completed = new HashMap<>();
        try {
            if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) return List.of();
            checkRoot();
            try (DirectoryStream<Path> files = Files.newDirectoryStream(root)) {
                for (Path file : files) {
                    String name = file.getFileName().toString();
                    if (name.startsWith(".pending-")) continue; // never moved into place: the record does not exist
                    Matcher matcher = NAME.matcher(name);
                    if (!matcher.matches() || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)
                            || Files.size(file) > MAX_RECORD_BYTES) throw new IOException("unexpected ledger entry");
                    UUID id = UUID.fromString(matcher.group(1));
                    byte[] bytes = Files.readAllBytes(file);
                    if (matcher.group(2).equals("requested")) {
                        Requested record = json.readValue(bytes, Requested.class);
                        if (!id.equals(record.id()) || record.action() == null || record.actorId() == null
                                || record.targetId() == null) throw new IOException("inconsistent ledger entry");
                        Instant.parse(record.requestedAt());
                        requested.put(id, record);
                    } else {
                        Completed record = json.readValue(bytes, Completed.class);
                        if (!id.equals(record.id()) || record.outcome() == null) throw new IOException("inconsistent ledger entry");
                        Instant.parse(record.completedAt());
                        completed.put(id, record);
                    }
                }
            }
        } catch (IOException | RuntimeException exception) {
            throw new Unavailable(exception);
        }
        if (!requested.keySet().containsAll(completed.keySet())) throw new Unavailable(null);
        List<Entry> entries = new ArrayList<>();
        requested.values().forEach(record -> entries.add(entry(record, completed.get(record.id()))));
        entries.sort(Comparator.comparing(Entry::requestedAt).thenComparing(Entry::id).reversed());
        return entries;
    }

    private static Entry entry(Requested requested, Completed completed) {
        return new Entry(requested.id(), requested.action(), requested.actorId(), requested.targetType(),
                requested.targetId(), requested.reason(), Instant.parse(requested.requestedAt()),
                completed == null ? "UNKNOWN" : completed.outcome(),
                completed == null ? null : completed.previousStatus(),
                completed == null ? null : completed.resultingStatus(),
                completed == null ? null : Instant.parse(completed.completedAt()));
    }

    private void write(UUID id, String kind, Object record) {
        Path pending = null;
        try {
            Files.createDirectories(root);
            checkRoot();
            Path target = root.resolve(id + "." + kind + ".json");
            if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) throw new IOException("audit records are immutable");
            byte[] bytes = json.writeValueAsBytes(record);
            pending = Files.createTempFile(root, ".pending-", ".json");
            try (FileChannel channel = FileChannel.open(pending, StandardOpenOption.WRITE,
                    StandardOpenOption.TRUNCATE_EXISTING, LinkOption.NOFOLLOW_LINKS)) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            Files.move(pending, target, StandardCopyOption.ATOMIC_MOVE);
            pending = null;
        } catch (IOException | RuntimeException exception) {
            throw new Unavailable(exception);
        } finally {
            if (pending != null) try { Files.deleteIfExists(pending); } catch (IOException ignored) { /* best effort */ }
        }
    }

    private void checkRoot() throws IOException {
        if (Files.isSymbolicLink(root) || !Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS)
                || !root.equals(root.toRealPath())) throw new IOException("audit root must be a real directory");
    }
}
