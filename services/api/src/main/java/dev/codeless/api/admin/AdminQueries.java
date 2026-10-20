package dev.codeless.api.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import dev.codeless.api.edit.EditMetadata;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read-only administrator projections. Every count and page of one response comes from one REPEATABLE READ
 * snapshot. List filters and metric buckets share the same SQL clauses, so a metric count always equals the
 * totalItems of the matching filtered list for the same window. Unknown values stay null, never 0.
 */
@Service
public class AdminQueries {
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Page<T>(List<T> items, int page, int size, long totalItems, long totalPages) {
        static <T> Page<T> of(List<T> all, int page, int size) {
            long offset = (long) page * size;
            List<T> items = offset >= all.size() ? List.of()
                    : all.subList((int) offset, (int) Math.min(all.size(), offset + size));
            return new Page<>(items, page, size, all.size(), (all.size() + size - 1L) / size);
        }
    }
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record User(UUID id, String email, String displayName, String status, String role,
                       long applicationCount, OffsetDateTime createdAt) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Application(UUID id, UUID ownerId, String ownerEmail, String name, String status, String dataMode,
                              UUID latestReadyVersionId, OffsetDateTime createdAt, OffsetDateTime updatedAt) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Task(UUID id, UUID applicationId, UUID ownerId, String kind, String status, String queueState,
                       int repairAttempts, String failureCode, String promptPreview, int promptLength,
                       boolean cancellable, OffsetDateTime createdAt, OffsetDateTime updatedAt) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Deployment(UUID id, UUID applicationId, UUID versionId, UUID requestedBy, String status, String url,
                             OffsetDateTime createdAt, OffsetDateTime updatedAt, OffsetDateTime publishedAt) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ModelCall(UUID id, UUID taskId, UUID applicationId, String stage, String provider, String model,
                            String status, String usage, Integer inputTokens, Integer outputTokens, Long totalTokens,
                            String errorCode, OffsetDateTime createdAt, OffsetDateTime completedAt) {}
    public record Window(OffsetDateTime from, OffsetDateTime to) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Metrics(MetricWindow window, Generation generation, Deployments deployment, Repairs repairs,
                          Tokens tokens, Instant generatedAt) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record MetricWindow(OffsetDateTime from, OffsetDateTime to, String field) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Outcomes(long total, long ready, long failed, long cancelled, long active, long denominator,
                           Double successRate) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Generation(long total, long ready, long failed, long cancelled, long active, long denominator,
                             Double successRate, Map<String, Outcomes> byKind) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Deployments(long total, long published, long failed, long inProgress, long denominator,
                              Double successRate) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Repairs(long total, long tasksWithRepairs, long readyAfterRepair, long denominator,
                          Double averagePerTask) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Tokens(long calls, long knownCalls, long unknownCalls, long pendingCalls, Long inputTokens,
                         Long outputTokens, Long totalTokens, long knownInputTokens, long knownOutputTokens,
                         long knownTotalTokens, boolean complete) {}

    static {
        if (EditMetadata.PREFIX.contains("'")) throw new IllegalStateException("edit marker must be a plain literal");
    }
    /** Task kind comes only from the server-authored first event (D12), never from prompt text. */
    private static final String TASKS = """
            (SELECT t.id, t.application_id, a.owner_id, t.status, t.queue_state, t.repair_attempts, t.failure_code,
                    t.prompt, t.created_at, t.updated_at,
                    CASE WHEN EXISTS (SELECT 1 FROM task_events e WHERE e.task_id = t.id AND e.sequence = 1
                                      AND e.type = 'STAGE_STARTED' AND e.stage = 'PLAN'
                                      AND starts_with(e.message, '%s'))
                         THEN 'EDIT' ELSE 'GENERATION' END AS kind
             FROM generation_tasks t JOIN applications a ON a.id = t.application_id) x""".formatted(EditMetadata.PREFIX);
    /** Generation outcome buckets. CANCELLED (user or admin) is not a generation failure; INTERRUPTED is. */
    static final Map<String, String> OUTCOMES = Map.of(
            "ACTIVE", "x.status NOT IN ('READY', 'FAILED')",
            "READY", "x.status = 'READY'",
            "FAILED", "x.status = 'FAILED' AND x.failure_code <> 'CANCELLED'",
            "CANCELLED", "x.status = 'FAILED' AND x.failure_code = 'CANCELLED'");
    /** Usage is KNOWN only when the provider reported both input and output tokens for a finished call. */
    static final Map<String, String> USAGE = Map.of(
            "KNOWN", "m.status <> 'REQUESTED' AND m.input_tokens IS NOT NULL AND m.output_tokens IS NOT NULL",
            "UNKNOWN", "m.status <> 'REQUESTED' AND (m.input_tokens IS NULL OR m.output_tokens IS NULL)",
            "PENDING", "m.status = 'REQUESTED'");

    private final JdbcClient jdbc;

    public AdminQueries(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Page<User> users(int page, int size, String role, String status, String text) {
        Where where = new Where().eq("c.role", role).eq("u.status", status);
        if (text != null) {
            String like = "%" + text.toLowerCase(java.util.Locale.ROOT).replace("\\", "\\\\")
                    .replace("%", "\\%").replace("_", "\\_") + "%";
            where.raw("(lower(u.email) LIKE ? ESCAPE '\\' OR lower(u.display_name) LIKE ? ESCAPE '\\')", like, like);
        }
        return page("""
                u.id, u.email, u.display_name, u.status, c.role, u.created_at,
                (SELECT count(*) FROM applications a WHERE a.owner_id = u.id) AS application_count""",
                "platform_users u LEFT JOIN auth_credentials c ON c.user_id = u.id", where,
                "u.created_at DESC, u.id DESC", (rs, n) -> new User(uuid(rs, "id"), rs.getString("email"),
                        rs.getString("display_name"), rs.getString("status"), rs.getString("role"),
                        rs.getLong("application_count"), time(rs, "created_at")), page, size);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Page<Application> applications(int page, int size, UUID ownerId, String status, String dataMode) {
        Where where = new Where().eq("a.owner_id", ownerId).eq("a.status", status).eq("a.data_mode", dataMode);
        return page("""
                a.id, a.owner_id, u.email AS owner_email, a.name, a.status, a.data_mode, a.latest_ready_version_id,
                a.created_at, a.updated_at""", "applications a JOIN platform_users u ON u.id = a.owner_id", where,
                "a.created_at DESC, a.id DESC", (rs, n) -> new Application(uuid(rs, "id"), uuid(rs, "owner_id"),
                        rs.getString("owner_email"), rs.getString("name"), rs.getString("status"),
                        rs.getString("data_mode"), uuid(rs, "latest_ready_version_id"), time(rs, "created_at"),
                        time(rs, "updated_at")), page, size);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Page<Task> tasks(int page, int size, String status, String outcome, String kind, UUID applicationId,
                            UUID ownerId, Window window) {
        Where where = new Where().eq("x.status", status).eq("x.kind", kind).eq("x.application_id", applicationId)
                .eq("x.owner_id", ownerId).window("x.created_at", window);
        if (outcome != null) where.raw(OUTCOMES.get(outcome));
        return page("x.*", TASKS, where, "x.created_at DESC, x.id DESC", AdminQueries::task, page, size);
    }

    @Transactional(readOnly = true)
    public Task task(UUID id) {
        Where where = new Where().eq("x.id", id);
        return page("x.*", TASKS, where, "x.id", AdminQueries::task, 0, 1).items().getFirst();
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Page<Deployment> deployments(int page, int size, String status, UUID applicationId, Window window) {
        Where where = new Where().eq("p.status", status).eq("p.application_id", applicationId)
                .window("p.created_at", window);
        return page("""
                p.id, p.application_id, p.version_id, p.requested_by, p.status, p.url, p.created_at, p.updated_at,
                p.published_at""", "publications p", where, "p.created_at DESC, p.id DESC",
                (rs, n) -> new Deployment(uuid(rs, "id"), uuid(rs, "application_id"), uuid(rs, "version_id"),
                        uuid(rs, "requested_by"), rs.getString("status"), rs.getString("url"), time(rs, "created_at"),
                        time(rs, "updated_at"), time(rs, "published_at")), page, size);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Page<ModelCall> modelCalls(int page, int size, String status, String stage, String usage, UUID taskId,
                                      Window window) {
        Where where = new Where().eq("m.status", status).eq("m.stage", stage).eq("m.task_id", taskId)
                .window("m.created_at", window);
        if (usage != null) where.raw(USAGE.get(usage));
        return page("""
                m.id, m.task_id, t.application_id, m.stage, m.provider, m.model, m.status, m.input_tokens,
                m.output_tokens, m.error_code, m.created_at, m.completed_at""",
                "model_calls m JOIN generation_tasks t ON t.id = m.task_id", where, "m.created_at DESC, m.id DESC",
                (rs, n) -> {
                    String state = rs.getString("status");
                    Integer input = rs.getObject("input_tokens", Integer.class);
                    Integer output = rs.getObject("output_tokens", Integer.class);
                    String known = state.equals("REQUESTED") ? "PENDING"
                            : input != null && output != null ? "KNOWN" : "UNKNOWN";
                    return new ModelCall(uuid(rs, "id"), uuid(rs, "task_id"), uuid(rs, "application_id"),
                            rs.getString("stage"), rs.getString("provider"), rs.getString("model"), state, known,
                            input, output, known.equals("KNOWN") ? (long) input + output : null,
                            rs.getString("error_code"), time(rs, "created_at"), time(rs, "completed_at"));
                }, page, size);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Metrics metrics(Window window) {
        Where tasks = new Where().window("x.created_at", window);
        Map<String, long[]> kinds = new LinkedHashMap<>();
        kinds.put("GENERATION", new long[8]);
        kinds.put("EDIT", new long[8]);
        jdbc.sql("SELECT x.kind, count(*) AS total"
                + ", count(*) FILTER (WHERE " + OUTCOMES.get("READY") + ") AS ready"
                + ", count(*) FILTER (WHERE " + OUTCOMES.get("FAILED") + ") AS failed"
                + ", count(*) FILTER (WHERE " + OUTCOMES.get("CANCELLED") + ") AS cancelled"
                + ", count(*) FILTER (WHERE " + OUTCOMES.get("ACTIVE") + ") AS active"
                + ", coalesce(sum(x.repair_attempts), 0) AS repairs"
                + ", count(*) FILTER (WHERE x.repair_attempts > 0) AS repaired"
                + ", count(*) FILTER (WHERE " + OUTCOMES.get("READY") + " AND x.repair_attempts > 0) AS ready_repaired"
                + " FROM " + TASKS + tasks.sql() + " GROUP BY x.kind")
                .params(tasks.params).query((ResultSet rs) -> {
                    long[] row = kinds.get(rs.getString("kind"));
                    String[] columns = {"total", "ready", "failed", "cancelled", "active", "repairs", "repaired",
                            "ready_repaired"};
                    for (int i = 0; i < columns.length; i++) row[i] = rs.getLong(columns[i]);
                });
        long[] all = new long[8];
        Map<String, Outcomes> byKind = new LinkedHashMap<>();
        kinds.forEach((kind, row) -> {
            for (int i = 0; i < all.length; i++) all[i] += row[i];
            byKind.put(kind, outcomes(row));
        });
        Outcomes overall = outcomes(all);
        Generation generation = new Generation(overall.total(), overall.ready(), overall.failed(), overall.cancelled(),
                overall.active(), overall.denominator(), overall.successRate(), byKind);
        Repairs repairs = new Repairs(all[5], all[6], all[7], all[0], ratio(all[5], all[0]));

        Where publications = new Where().window("p.created_at", window);
        Deployments deployments = jdbc.sql("""
                SELECT count(*) AS total, count(*) FILTER (WHERE p.status = 'PUBLISHED') AS published,
                       count(*) FILTER (WHERE p.status = 'FAILED') AS failed,
                       count(*) FILTER (WHERE p.status = 'REQUESTED') AS in_progress
                FROM publications p""" + publications.sql()).params(publications.params).query((rs, n) -> {
                    long published = rs.getLong("published"), failed = rs.getLong("failed");
                    return new Deployments(rs.getLong("total"), published, failed, rs.getLong("in_progress"),
                            published + failed, ratio(published, published + failed));
                }).single();

        Where calls = new Where().window("m.created_at", window);
        Tokens tokens = jdbc.sql("SELECT count(*) AS calls"
                + ", count(*) FILTER (WHERE " + USAGE.get("KNOWN") + ") AS known"
                + ", count(*) FILTER (WHERE " + USAGE.get("UNKNOWN") + ") AS unknown"
                + ", count(*) FILTER (WHERE " + USAGE.get("PENDING") + ") AS pending"
                + ", coalesce(sum(m.input_tokens::bigint) FILTER (WHERE " + USAGE.get("KNOWN") + "), 0) AS input"
                + ", coalesce(sum(m.output_tokens::bigint) FILTER (WHERE " + USAGE.get("KNOWN") + "), 0) AS output"
                + " FROM model_calls m" + calls.sql()).params(calls.params).query((rs, n) -> {
                    long count = rs.getLong("calls"), known = rs.getLong("known");
                    long input = rs.getLong("input"), output = rs.getLong("output");
                    boolean complete = count == known;
                    return new Tokens(count, known, rs.getLong("unknown"), rs.getLong("pending"),
                            complete ? input : null, complete ? output : null, complete ? input + output : null,
                            input, output, input + output, complete);
                }).single();
        return new Metrics(new MetricWindow(window == null ? null : window.from(), window == null ? null : window.to(),
                "createdAt"), generation, deployments, repairs, tokens, Instant.now());
    }

    private static Outcomes outcomes(long[] row) {
        long denominator = row[1] + row[2];
        return new Outcomes(row[0], row[1], row[2], row[3], row[4], denominator, ratio(row[1], denominator));
    }

    /** null when there is nothing to divide by: "no data" is never reported as a 0% (or 100%) rate. */
    static Double ratio(long numerator, long denominator) {
        return denominator == 0 ? null : Math.round(numerator * 10000.0 / denominator) / 10000.0;
    }

    private <T> Page<T> page(String columns, String source, Where where, String order, RowMapper<T> mapper,
                             int page, int size) {
        long total = jdbc.sql("SELECT count(*) FROM " + source + where.sql()).params(where.params)
                .query(Long.class).single();
        List<Object> params = new ArrayList<>(where.params);
        params.add(size);
        params.add((long) page * size);
        List<T> items = jdbc.sql("SELECT " + columns + " FROM " + source + where.sql() + " ORDER BY " + order
                + " LIMIT ? OFFSET ?").params(params).query(mapper).list();
        return new Page<>(items, page, size, total, (total + size - 1) / size);
    }

    private static Task task(ResultSet rs, int row) throws SQLException {
        String status = rs.getString("status");
        String prompt = rs.getString("prompt");
        return new Task(uuid(rs, "id"), uuid(rs, "application_id"), uuid(rs, "owner_id"), rs.getString("kind"), status,
                rs.getString("queue_state"), rs.getInt("repair_attempts"), rs.getString("failure_code"),
                AdminRedaction.preview(prompt), prompt.codePointCount(0, prompt.length()),
                !status.equals("READY") && !status.equals("FAILED"), time(rs, "created_at"), time(rs, "updated_at"));
    }

    private static UUID uuid(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, UUID.class);
    }

    private static OffsetDateTime time(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, OffsetDateTime.class);
    }

    /** Column names and clauses are code constants; only validated values are bound as parameters. */
    private static final class Where {
        private final List<String> clauses = new ArrayList<>();
        private final List<Object> params = new ArrayList<>();

        Where eq(String column, Object value) {
            if (value != null) raw(column + " = ?", value);
            return this;
        }

        Where raw(String clause, Object... values) {
            clauses.add("(" + clause + ")");
            params.addAll(List.of(values));
            return this;
        }

        Where window(String column, Window window) {
            if (window != null && window.from() != null) raw(column + " >= ?", window.from());
            if (window != null && window.to() != null) raw(column + " < ?", window.to());
            return this;
        }

        String sql() {
            return clauses.isEmpty() ? "" : " WHERE " + String.join(" AND ", clauses);
        }
    }
}
