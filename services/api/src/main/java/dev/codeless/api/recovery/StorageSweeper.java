package dev.codeless.api.recovery;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Retention sweep of temporary platform data. A candidate is removed only when nothing in PostgreSQL references it
 * and nothing in its subtree changed within the retention period; every decision is re-read from the database just
 * before deletion. Usable (VERIFIED) versions, versions referenced by any publication or as an application's current
 * preview, their builds and their source tasks are protected explicitly, in addition to the reference rules.
 *
 * <p>Swept roots: version volume (pending {@code .source-*}/{@code .outcome-*} attempts and directories without a
 * version row), runner artifacts without a build row, runner scratch, and D08 workspaces of FAILED tasks. Journals,
 * receipts, browser evidence, audit ledgers, deployment ledgers and hosting roots are records, not temporary data,
 * and are never listed. Unrecognized names are kept. Any error makes the report PARTIAL, never COMPLETE.
 */
public final class StorageSweeper {
    public static final Duration MINIMUM_RETENTION = Duration.ofHours(1);
    private static final Pattern UUID_NAME = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    private static final Pattern PENDING_VERSION = Pattern.compile("\\.(source|outcome)-[A-Za-z0-9_-]{1,64}");
    private static final int MAX_CHILDREN = 10_000;

    public record Roots(Path versions, Path artifacts, Path work, Path workspaces) {}
    public record Report(String status, Instant startedAt, Instant cutoff, Map<String, Integer> removed,
                         Map<String, Integer> kept, List<String> removedPaths, List<String> errors) {}

    private final JdbcClient jdbc;
    private final Roots roots;
    private final Duration retention;
    private final Clock clock;

    public StorageSweeper(JdbcClient jdbc, Roots roots, Duration retention, Clock clock) {
        if (retention.compareTo(MINIMUM_RETENTION) < 0)
            throw new IllegalStateException("retention must be at least " + MINIMUM_RETENTION + ", longer than any task");
        this.jdbc = jdbc;
        this.roots = new Roots(SafeTree.normal(roots.versions()), SafeTree.normal(roots.artifacts()),
                SafeTree.normal(roots.work()), SafeTree.normal(roots.workspaces()));
        this.retention = retention;
        this.clock = clock;
    }

    public Report sweep() {
        Instant started = clock.instant();
        var run = new Run(started.minus(retention));
        List<Path> all = List.of(roots.versions(), roots.artifacts(), roots.work(), roots.workspaces());
        for (int i = 0; i < all.size(); i++)
            for (int j = i + 1; j < all.size(); j++)
                if (SafeTree.overlaps(all.get(i), all.get(j))) run.error("CLEANUP_ROOTS_OVERLAP", all.get(i).getFileName().toString());
        if (run.errors.isEmpty()) {
            versions(run);
            artifacts(run);
            work(run);
            workspaces(run);
        }
        return new Report(run.errors.isEmpty() ? "COMPLETE" : "PARTIAL", started, run.cutoff, run.removed, run.kept,
                List.copyOf(run.paths), List.copyOf(run.errors));
    }

    private void versions(Run run) {
        for (Path child : run.children("versions", roots.versions())) {
            String name = child.getFileName().toString();
            if (!UUID_NAME.matcher(name).matches() || !Files.isDirectory(child, LinkOption.NOFOLLOW_LINKS)) { run.keep("UNRECOGNIZED"); continue; }
            UUID id = UUID.fromString(name);
            if (versionReferenced(id)) {
                // Never the frozen source/outcome themselves: only abandoned attempts beside them.
                for (Path attempt : run.children("versions/" + name, child))
                    if (PENDING_VERSION.matcher(attempt.getFileName().toString()).matches())
                        run.removeIfOld("versions/" + name, child, attempt, "PENDING_VERSION_ATTEMPT", () -> true);
                run.keep("REFERENCED");
            } else {
                run.removeIfOld("versions", roots.versions(), child, "ORPHAN_VERSION", () -> !versionReferenced(id));
            }
        }
    }

    private void artifacts(Run run) {
        for (Path child : run.children("artifacts", roots.artifacts())) {
            String name = child.getFileName().toString();
            if (name.startsWith(".build-")) { run.removeIfOld("artifacts", roots.artifacts(), child, "PENDING_ARTIFACT", () -> true); continue; }
            if (!UUID_NAME.matcher(name).matches()) { run.keep("UNRECOGNIZED"); continue; }
            UUID id = UUID.fromString(name);
            if (buildReferenced(id)) run.keep("REFERENCED");
            else run.removeIfOld("artifacts", roots.artifacts(), child, "ORPHAN_ARTIFACT", () -> !buildReferenced(id));
        }
    }

    private void work(Run run) {
        for (Path child : run.children("work", roots.work())) {
            String name = child.getFileName().toString();
            if (UUID_NAME.matcher(name).matches()) {
                UUID task = UUID.fromString(name);
                if (taskState(task).map(TaskState::active).orElse(false)) run.keep("ACTIVE");
                else run.removeIfOld("work", roots.work(), child, "RUNNER_SCRATCH",
                        () -> !taskState(task).map(TaskState::active).orElse(false));
            } else if (name.equals("build") && SafeTree.realDirectory(child)) {
                for (Path staging : run.children("work/build", child))
                    if (staging.getFileName().toString().startsWith("codeless-build-"))
                        run.removeIfOld("work/build", child, staging, "RUNNER_SCRATCH", () -> true);
                    else run.keep("UNRECOGNIZED");
            } else if (name.startsWith("source-")) {
                run.removeIfOld("work", roots.work(), child, "RUNNER_SCRATCH", () -> true);
            } else run.keep("UNRECOGNIZED");
        }
    }

    private void workspaces(Run run) {
        for (Path child : run.children("workspaces", roots.workspaces())) {
            String name = child.getFileName().toString();
            if (!UUID_NAME.matcher(name).matches()) { run.keep("UNRECOGNIZED"); continue; }
            UUID task = UUID.fromString(name);
            var state = taskState(task);
            if (state.isPresent() && state.get().active()) run.keep("ACTIVE");
            else if (state.isPresent() && state.get().protectedSource()) run.keep("PROTECTED");
            else if (state.isPresent() && !"FAILED".equals(state.get().status())) run.keep("REFERENCED");
            else if (state.isPresent() && !state.get().updatedBefore(run.cutoff)) run.keep("RETENTION");
            else run.removeIfOld("workspaces", roots.workspaces(), child, "FAILED_TASK_WORKSPACE", () -> {
                var now = taskState(task);
                return now.isEmpty() || (!now.get().active() && !now.get().protectedSource()
                        && "FAILED".equals(now.get().status()) && now.get().updatedBefore(run.cutoff));
            });
        }
    }

    /** Protected: the task is the source of a usable, published or current-preview version, or built one. */
    private record TaskState(String status, String queueState, OffsetDateTime updatedAt, boolean protectedSource) {
        boolean active() { return !"FINISHED".equals(queueState) || !("READY".equals(status) || "FAILED".equals(status)); }
        boolean updatedBefore(Instant cutoff) { return updatedAt.toInstant().isBefore(cutoff); }
    }

    private static final String PROTECTED_VERSIONS = """
            (SELECT id FROM application_versions WHERE status = 'VERIFIED'
             UNION SELECT version_id FROM publications
             UNION SELECT latest_ready_version_id FROM applications WHERE latest_ready_version_id IS NOT NULL)
            """;

    private Optional<TaskState> taskState(UUID task) {
        return jdbc.sql("""
                SELECT t.status, t.queue_state, t.updated_at,
                       EXISTS (SELECT 1 FROM application_versions v WHERE v.source_task_id = t.id AND v.id IN %1$s)
                       OR EXISTS (SELECT 1 FROM builds b WHERE b.task_id = t.id AND b.version_id IN %1$s) AS protected_source
                FROM generation_tasks t WHERE t.id = ?
                """.formatted(PROTECTED_VERSIONS)).param(task)
                .query((rs, n) -> new TaskState(rs.getString(1), rs.getString(2),
                        rs.getObject(3, OffsetDateTime.class), rs.getBoolean(4))).optional();
    }

    private boolean versionReferenced(UUID id) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM application_versions WHERE id = ?)
                    OR EXISTS (SELECT 1 FROM publications WHERE version_id = ?)
                    OR EXISTS (SELECT 1 FROM applications WHERE latest_ready_version_id = ?)
                """).params(id, id, id).query(Boolean.class).single();
    }

    private boolean buildReferenced(UUID id) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM builds WHERE id = ?)
                    OR EXISTS (SELECT 1 FROM application_versions WHERE build_id = ?)
                """).params(id, id).query(Boolean.class).single();
    }

    private interface Recheck { boolean stillUnreferenced(); }

    private static final class Run {
        final Instant cutoff;
        final Map<String, Integer> removed = new TreeMap<>(), kept = new TreeMap<>();
        final List<String> paths = new ArrayList<>(), errors = new ArrayList<>();
        Run(Instant cutoff) { this.cutoff = cutoff; }

        void keep(String reason) { kept.merge(reason, 1, Integer::sum); }
        void error(String code, String where) { errors.add(code + ":" + where); }

        List<Path> children(String label, Path root) {
            if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) { keep("ABSENT_ROOT"); return List.of(); }
            if (!SafeTree.realDirectory(root)) { error("CLEANUP_ROOT_REJECTED", label); return List.of(); }
            try (var stream = Files.list(root)) {
                var list = stream.sorted().limit(MAX_CHILDREN + 1L).toList();
                if (list.size() > MAX_CHILDREN) { error("CLEANUP_ROOT_TRUNCATED", label); return list.subList(0, MAX_CHILDREN); }
                return list;
            } catch (IOException failure) {
                error("CLEANUP_IO_FAILED", label);
                return List.of();
            }
        }

        void removeIfOld(String label, Path root, Path child, String category, Recheck recheck) {
            String where = label + "/" + child.getFileName();
            try {
                if (!SafeTree.newest(child).isBefore(cutoff)) { keep("RETENTION"); return; }
                if (!recheck.stillUnreferenced()) { keep("REFERENCED"); return; }
                SafeTree.delete(root, child);
                removed.merge(category, 1, Integer::sum);
                paths.add(where);
            } catch (SafeTree.Rejected rejected) {
                error(rejected.getMessage(), where);
            } catch (IOException | RuntimeException failure) {
                error("CLEANUP_IO_FAILED", where);
            }
        }
    }

    static Clock utc() { return Clock.system(ZoneOffset.UTC); }
}
