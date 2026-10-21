package dev.codeless.api.recovery;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Idempotent, task-ID scoped release of runner execution resources: the task's runner scratch root
 * ({@code <agent>/work/<taskId>}) and its D08 mutable working copy. Immutable D08 snapshots stay, because the
 * resident preview of a READY task reads them; the retention sweep decides about them later.
 *
 * <p>Only a terminal, FINISHED task is cleaned, and never while this process still executes it. The task row lock
 * serializes concurrent requests across API instances; a receipt records the first complete cleanup. Repeating a
 * request removes anything that reappeared and returns {@code ALREADY_CLEANED}; it never throws for a known task.
 */
public final class RunnerCleanup {
    public record Report(UUID taskId, String status, String taskStatus, int removedEntries,
                         List<String> errors, String receipt) {}

    private final JdbcClient jdbc;
    private final TransactionTemplate tx;
    private final Path work, workspaces, receipts;
    private final Set<UUID> executing = ConcurrentHashMap.newKeySet();
    private final JsonMapper json = JsonMapper.builder().build();

    public RunnerCleanup(JdbcClient jdbc, PlatformTransactionManager manager, Path work, Path workspaces, Path receipts) {
        if (SafeTree.overlaps(work, workspaces) || SafeTree.overlaps(work, receipts) || SafeTree.overlaps(workspaces, receipts))
            throw new IllegalStateException("runner cleanup roots must be separate");
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(manager);
        this.work = SafeTree.normal(work);
        this.workspaces = SafeTree.normal(workspaces);
        this.receipts = SafeTree.normal(receipts);
    }

    public interface Execution extends AutoCloseable {
        @Override void close();
    }

    /** Marks a task as executing in this process until the returned handle is closed. */
    public Execution executing(UUID taskId) {
        executing.add(taskId);
        return () -> executing.remove(taskId);
    }

    public Report request(UUID taskId) {
        if (executing.contains(taskId)) return new Report(taskId, "DEFERRED_ACTIVE", null, 0, List.of(), null);
        return tx.execute(status -> {
            record Row(String status, String queueState, String failureCode) {}
            var row = jdbc.sql("SELECT status, queue_state, failure_code FROM generation_tasks WHERE id = ? FOR UPDATE")
                    .param(taskId).query((rs, n) -> new Row(rs.getString(1), rs.getString(2), rs.getString(3))).optional();
            if (row.isEmpty()) return new Report(taskId, "NOT_FOUND", null, 0, List.of(), null);
            String taskStatus = row.get().status();
            if (!Set.of("READY", "FAILED").contains(taskStatus) || !"FINISHED".equals(row.get().queueState()))
                return new Report(taskId, "DEFERRED_ACTIVE", taskStatus, 0, List.of(), null);
            var errors = new ArrayList<String>();
            int removed = remove(work, work.resolve(taskId.toString()), errors);
            Path workspace = workspaces.resolve(taskId.toString());
            if (Files.isDirectory(workspace, LinkOption.NOFOLLOW_LINKS)) {
                if (!SafeTree.realDirectory(workspace)) errors.add("CLEANUP_LINK_REJECTED:workspace");
                else {
                    removed += remove(workspace, workspace.resolve("source"), errors);
                    try (var entries = Files.list(workspace)) {
                        for (Path entry : entries.filter(p -> p.getFileName().toString().matches("\\.write-.*\\.tmp")).toList())
                            removed += remove(workspace, entry, errors);
                    } catch (IOException failure) {
                        errors.add("CLEANUP_IO_FAILED:workspace");
                    }
                }
            }
            if (!errors.isEmpty()) return new Report(taskId, "PARTIAL", taskStatus, removed, List.copyOf(errors), null);
            Path receipt = receipts.resolve(taskId + ".json");
            try {
                if (Files.exists(receipt, LinkOption.NOFOLLOW_LINKS))
                    return new Report(taskId, "ALREADY_CLEANED", taskStatus, removed, List.of(), receipt.toString());
                write(receipt, taskId, row.get().status(), row.get().failureCode(), removed);
                return new Report(taskId, "CLEANED", taskStatus, removed, List.of(), receipt.toString());
            } catch (IOException failure) {
                return new Report(taskId, "PARTIAL", taskStatus, removed, List.of("CLEANUP_RECEIPT_UNAVAILABLE"), null);
            }
        });
    }

    private int remove(Path root, Path target, List<String> errors) {
        try {
            return Files.exists(root, LinkOption.NOFOLLOW_LINKS) ? SafeTree.delete(root, target) : 0;
        } catch (SafeTree.Rejected rejected) {
            errors.add(rejected.getMessage() + ":" + root.relativize(SafeTree.normal(target)));
        } catch (IOException failure) {
            errors.add("CLEANUP_IO_FAILED:" + root.relativize(SafeTree.normal(target)));
        }
        return 0;
    }

    /** Temporary file then a non-replacing move: a second writer observes the existing receipt, never overwrites it. */
    private void write(Path receipt, UUID taskId, String status, String failureCode, int removed) throws IOException {
        Files.createDirectories(receipts);
        if (!SafeTree.realDirectory(receipts)) throw new IOException("receipt root rejected");
        var body = new LinkedHashMap<String, Object>();
        body.put("taskId", taskId.toString());
        body.put("taskStatus", status);
        body.put("failureCode", failureCode);
        body.put("removedEntries", removed);
        body.put("scopes", List.of("work/<taskId>", "workspaces/<taskId>/source", "workspaces/<taskId>/.write-*.tmp"));
        body.put("cleanedAt", Instant.now().toString());
        Path pending = Files.createTempFile(receipts, ".receipt-", ".tmp");
        try {
            Files.write(pending, json.writeValueAsString(body).getBytes(StandardCharsets.UTF_8), StandardOpenOption.WRITE);
            try {
                Files.move(pending, receipt);
            } catch (FileAlreadyExistsException raced) {
                // Another instance completed first; its receipt stays authoritative.
            }
        } finally {
            Files.deleteIfExists(pending);
        }
    }
}
