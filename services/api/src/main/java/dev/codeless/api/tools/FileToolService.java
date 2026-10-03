package dev.codeless.api.tools;

import dev.codeless.api.data.TaskDiagnosticsService;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;

/** Internal invocation only. It neither advances task state nor grants model access to trusted paths. */
@Service
public class FileToolService {
    public record Result(UUID callId, String status, String errorCode, String content,
                         String beforeDigest, String afterDigest, ControlledWorkspace.View source) {}
    public record Snapshot(Path directory, ControlledWorkspace.View source) {}
    private record Observed(Result result, FileToolAudit.Receipt receipt) {}
    private final FileToolRegistry registry;
    private final ControlledWorkspace workspace;
    private final FileToolAudit audit;
    private final JdbcClient jdbc;
    private final TransactionTemplate transactions;
    private final TaskDiagnosticsService diagnostics;

    public FileToolService(FileToolRegistry registry, ControlledWorkspace workspace, FileToolAudit audit,
                           JdbcClient jdbc, PlatformTransactionManager manager, TaskDiagnosticsService diagnostics) {
        this.registry = registry; this.workspace = workspace; this.audit = audit;
        this.jdbc = jdbc; this.transactions = new TransactionTemplate(manager); this.diagnostics = diagnostics;
    }

    public Result execute(UUID taskId, UUID originalLeaseToken, String name, String input) {
        if (taskId == null || originalLeaseToken == null) throw new FileToolFailure("FILE_CONTEXT_INVALID");
        // Must commit independently: an enclosing transaction could otherwise roll back a returned success.
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive())
            throw new FileToolFailure("FILE_TRANSACTION_CONTEXT_INVALID");
        Observed observed;
        try { observed = transactions.execute(tx -> invoke(taskId, originalLeaseToken, name, input)); }
        catch (FileToolFailure failure) { throw failure; }
        catch (RuntimeException exception) { throw new FileToolFailure("FILE_RECORD_UNAVAILABLE"); }
        var receipt = observed.receipt();
        audit.write(new FileToolAudit.Receipt(receipt.callId(), taskId, receipt.stage(), observed.result().status(),
                receipt.input(), receipt.observedStatus(), receipt.errorCode(), receipt.durationMs(),
                receipt.beforeDigest(), receipt.afterDigest(), receipt.source(), Instant.now().toString()), "committed");
        return observed.result();
    }

    private Observed invoke(UUID taskId, UUID token, String name, String input) {
        String stage = lock(taskId, token);
        if (audit.count(taskId) >= FileToolRegistry.MAX_CALLS) throw new FileToolFailure("FILE_CALL_LIMIT");
        UUID callId = UUID.randomUUID();
        long started = System.nanoTime();
        JsonNode args = null;
        String error = null;
        try { args = registry.validate(name, input); } catch (FileToolFailure failure) { error = failure.getMessage(); }
        FileToolAudit.Input summary = summary(name, input, args);
        audit.write(new FileToolAudit.Receipt(callId, taskId, stage, "REQUESTED", summary,
                null, null, null, null, null, null, Instant.now().toString()), "request");
        Result result;
        String before = null, after = null, content = null;
        ControlledWorkspace.View view = null;
        try {
            if (error != null) throw new FileToolFailure(error);
            view = workspace.inspect(taskId);
            if (!name.equals("files.list")) {
                String requestedPath = args.get("path").asText();
                if (view.files().stream().anyMatch(f -> f.path().equalsIgnoreCase(requestedPath) && !f.path().equals(requestedPath)))
                    throw new FileToolFailure("FILE_PATH_CONFLICT");
                Path target = workspace.target(taskId, args.get("path").asText());
                boolean exists = Files.exists(target, LinkOption.NOFOLLOW_LINKS);
                if (name.equals("files.create") && exists) throw new FileToolFailure("FILE_ALREADY_EXISTS");
                if (!name.equals("files.create") && !exists) throw new FileToolFailure("FILE_NOT_FOUND");
                byte[] old = exists ? ControlledWorkspace.read(target) : null;
                before = old == null ? null : ControlledWorkspace.hash(old);
                if (args.has("expectedDigest") && !args.get("expectedDigest").asText().equals(before))
                    throw new FileToolFailure("FILE_DIGEST_CONFLICT");
                if (name.equals("files.read")) { content = ControlledWorkspace.decode(old); after = before; }
                else {
                    byte[] bytes = args.has("content") ? ControlledWorkspace.encode(args.get("content").asText()) : null;
                    if (name.equals("files.create") && view.files().size() >= FileToolRegistry.MAX_FILES)
                        throw new FileToolFailure("FILE_COUNT_LIMIT");
                    long total = view.totalBytes() - (old == null ? 0 : old.length) + (bytes == null ? 0 : bytes.length);
                    if (total > FileToolRegistry.MAX_TOTAL_BYTES) throw new FileToolFailure("FILE_TOTAL_LIMIT");
                    requireLease(taskId, token);
                    // After this point a failed post-write observation has unknown source state.
                    view = null;
                    if (name.equals("files.delete")) Files.delete(target);
                    else workspace.write(taskId, target, bytes, name.equals("files.update"));
                    view = workspace.inspect(taskId);
                    after = name.equals("files.delete") ? null : ControlledWorkspace.hash(ControlledWorkspace.read(target));
                }
            }
            result = new Result(callId, "SUCCEEDED", null, content, before, after, view);
        } catch (FileToolFailure failure) {
            result = new Result(callId, "FAILED", failure.getMessage(), null, before, null, view);
        } catch (IOException exception) {
            result = new Result(callId, "FAILED", "FILE_IO_ERROR", null, before, null, null);
        } catch (RuntimeException exception) {
            result = new Result(callId, "FAILED", "FILE_INTERNAL_ERROR", null, before, null, null);
        }
        var receipt = new FileToolAudit.Receipt(callId, taskId, stage, "OBSERVED", summary, result.status(),
                result.errorCode(), Math.max(0, (System.nanoTime() - started) / 1000000), result.beforeDigest(),
                result.afterDigest(), result.source(), Instant.now().toString());
        // Save observed bytes/result before DB metadata; DB failure leaves no success commit receipt.
        audit.write(receipt, "observed");
        if (result.status().equals("SUCCEEDED") && !name.equals("files.list") && !name.equals("files.read")
                && !java.util.Objects.equals(before, after)) {
            int revision = jdbc.sql("SELECT revision FROM task_file_snapshots WHERE task_id=?").param(taskId)
                    .query(Integer.class).optional().orElse(0);
            diagnostics.recordFiles(taskId, token, revision, List.of(new TaskDiagnosticsService.FileChange(
                    summary.path(), before == null ? "ADDED" : after == null ? "DELETED" : "MODIFIED", before, after)));
        }
        appendEvent(taskId, token, stage, callId, result.status(), result.errorCode());
        return new Observed(result, receipt);
    }

    private FileToolAudit.Input summary(String name, String input, JsonNode args) {
        String safeName = registry.definitions().path("tools").valueStream().map(t -> t.path("name").asText())
                .filter(n -> n.equals(name)).findFirst().orElse("unregistered");
        byte[] text = input == null ? null : input.getBytes(StandardCharsets.UTF_8);
        byte[] content = args != null && args.has("content") ? args.get("content").asText().getBytes(StandardCharsets.UTF_8) : null;
        return new FileToolAudit.Input(safeName, args != null && args.has("path") ? args.get("path").asText() : null,
                input == null ? 0 : input.length(), text == null ? null : ControlledWorkspace.hash(text),
                content == null ? null : content.length, content == null ? null : ControlledWorkspace.hash(content));
    }

    private String lock(UUID taskId, UUID token) {
        jdbc.sql("SELECT id FROM generation_tasks WHERE id=? FOR UPDATE").param(taskId).query(UUID.class)
                .optional().orElseThrow(() -> new FileToolFailure("FILE_TASK_UNAVAILABLE"));
        requireLease(taskId, token);
        return jdbc.sql("SELECT status FROM generation_tasks WHERE id=?").param(taskId).query(String.class).single();
    }
    private void requireLease(UUID taskId, UUID token) {
        boolean valid = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM generation_tasks WHERE id=? AND lease_token=?
                    AND queue_state='RUNNING' AND status IN ('GENERATE','REPAIR')
                    AND lease_expires_at > clock_timestamp() AND deadline_at > clock_timestamp())
                """).params(taskId, token).query(Boolean.class).single();
        if (!valid) throw new FileToolFailure("FILE_LEASE_INVALID");
    }
    private void appendEvent(UUID taskId, UUID token, String stage, UUID callId, String status, String error) {
        // As in D05, recheck the database clock in the write itself, after acquiring the row lock.
        int sequence = jdbc.sql("""
                UPDATE generation_tasks SET event_sequence=event_sequence+1,row_version=row_version+1,
                    updated_at=clock_timestamp() WHERE id=? AND lease_token=? AND queue_state='RUNNING'
                    AND status IN ('GENERATE','REPAIR') AND lease_expires_at > clock_timestamp()
                    AND deadline_at > clock_timestamp() RETURNING event_sequence
                """).params(taskId, token).query(Integer.class).optional()
                .orElseThrow(() -> new FileToolFailure("FILE_LEASE_INVALID"));
        jdbc.sql("""
                INSERT INTO task_events(id,task_id,sequence,type,stage,message,occurred_at)
                VALUES (?,?,?,'TOOL_RESULT',?,?,clock_timestamp())
                """).params(UUID.randomUUID(), taskId, sequence, stage,
                "File tool " + callId + " " + status + (error == null ? "" : " " + error)).update();
    }

    /** Trusted coordinator export: unique copied source only, no audit files or configuration. */
    public Snapshot snapshot(UUID taskId, UUID originalLeaseToken) {
        if (taskId == null || originalLeaseToken == null) throw new FileToolFailure("FILE_CONTEXT_INVALID");
        return transactions.execute(tx -> {
            lock(taskId, originalLeaseToken);
            try {
                var view = workspace.inspect(taskId);
                if (view.files().isEmpty()) throw new FileToolFailure("FILE_SOURCE_EMPTY");
                Path target = workspace.source(taskId).getParent().resolve("snapshots").resolve(UUID.randomUUID().toString());
                ControlledWorkspace.directory(target);
                for (var file : view.files()) {
                    Path source = workspace.target(taskId, file.path());
                    byte[] bytes = ControlledWorkspace.read(source);
                    if (!ControlledWorkspace.hash(bytes).equals(file.digest())) throw new FileToolFailure("FILE_SOURCE_CHANGED");
                    Path destination = target.resolve(file.path());
                    ControlledWorkspace.directory(destination.getParent());
                    Files.write(destination, bytes, StandardOpenOption.CREATE_NEW);
                }
                requireLease(taskId, originalLeaseToken);
                return new Snapshot(target, view);
            } catch (IOException exception) { throw new FileToolFailure("FILE_IO_ERROR"); }
        });
    }
}
