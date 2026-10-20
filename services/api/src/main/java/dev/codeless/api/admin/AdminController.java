package dev.codeless.api.admin;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.auth.OwnershipGuard;
import dev.codeless.api.error.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Minimal controlled-trial back office: read-only lists, metrics and one audited cancel. Not an enterprise
 * permission platform; the single gate is the ADMIN role, checked by AuthFilter and again here.
 */
@RestController
@RequestMapping("/api/v0/admin")
public class AdminController {
    private static final Pattern UUID_TEXT = Pattern.compile(
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final Pattern PAGE = Pattern.compile("0|[1-9][0-9]{0,3}|10000");
    private static final Pattern SIZE = Pattern.compile("[1-9][0-9]?|100");
    private static final Set<String> TASK_STATUS = Set.of("PLAN", "GENERATE", "VERIFY", "REPAIR", "READY", "FAILED");
    private static final Set<String> AUDIT_OUTCOMES = Set.of("CANCELLED", "ALREADY_TERMINAL", "NOT_FOUND", "FAILED",
            "UNKNOWN");
    private final AdminQueries queries;
    private final AdminTaskCancellation cancellation;
    private final AdminAuditLog audit;
    private final OwnershipGuard ownership;

    public AdminController(AdminQueries queries, AdminTaskCancellation cancellation, AdminAuditLog audit,
                           OwnershipGuard ownership) {
        this.queries = queries;
        this.cancellation = cancellation;
        this.audit = audit;
        this.ownership = ownership;
    }

    @GetMapping("/users")
    public ResponseEntity<AdminQueries.Page<AdminQueries.User>> users(
            @RequestParam MultiValueMap<String, String> params, HttpServletRequest request) {
        ownership.requireAdmin(request);
        Query query = new Query(params, "role", "status", "q");
        return ok(queries.users(query.page(), query.size(), query.oneOf("role", Set.of("USER", "ADMIN")),
                query.oneOf("status", Set.of("ACTIVE", "DISABLED")), query.text("q", 100)));
    }

    @GetMapping("/applications")
    public ResponseEntity<AdminQueries.Page<AdminQueries.Application>> applications(
            @RequestParam MultiValueMap<String, String> params, HttpServletRequest request) {
        ownership.requireAdmin(request);
        Query query = new Query(params, "ownerId", "status", "dataMode");
        return ok(queries.applications(query.page(), query.size(), query.uuid("ownerId"),
                query.oneOf("status", Set.of("ACTIVE", "ARCHIVED")),
                query.oneOf("dataMode", Set.of("STATIC", "MOCK", "LOCAL_STORAGE"))));
    }

    @GetMapping("/tasks")
    public ResponseEntity<AdminQueries.Page<AdminQueries.Task>> tasks(
            @RequestParam MultiValueMap<String, String> params, HttpServletRequest request) {
        ownership.requireAdmin(request);
        Query query = new Query(params, "status", "outcome", "kind", "applicationId", "ownerId", "from", "to");
        return ok(queries.tasks(query.page(), query.size(), query.oneOf("status", TASK_STATUS),
                query.oneOf("outcome", AdminQueries.OUTCOMES.keySet()),
                query.oneOf("kind", Set.of("GENERATION", "EDIT")), query.uuid("applicationId"), query.uuid("ownerId"),
                query.window()));
    }

    @GetMapping("/deployments")
    public ResponseEntity<AdminQueries.Page<AdminQueries.Deployment>> deployments(
            @RequestParam MultiValueMap<String, String> params, HttpServletRequest request) {
        ownership.requireAdmin(request);
        Query query = new Query(params, "status", "applicationId", "from", "to");
        return ok(queries.deployments(query.page(), query.size(),
                query.oneOf("status", Set.of("REQUESTED", "PUBLISHED", "FAILED")), query.uuid("applicationId"),
                query.window()));
    }

    @GetMapping("/model-calls")
    public ResponseEntity<AdminQueries.Page<AdminQueries.ModelCall>> modelCalls(
            @RequestParam MultiValueMap<String, String> params, HttpServletRequest request) {
        ownership.requireAdmin(request);
        Query query = new Query(params, "status", "stage", "usage", "taskId", "from", "to");
        return ok(queries.modelCalls(query.page(), query.size(),
                query.oneOf("status", Set.of("REQUESTED", "SUCCEEDED", "FAILED")),
                query.oneOf("stage", Set.of("PLAN", "GENERATE", "REPAIR")),
                query.oneOf("usage", AdminQueries.USAGE.keySet()), query.uuid("taskId"), query.window()));
    }

    @GetMapping("/metrics")
    public ResponseEntity<AdminQueries.Metrics> metrics(
            @RequestParam MultiValueMap<String, String> params, HttpServletRequest request) {
        ownership.requireAdmin(request);
        Query query = new Query(params, false, "from", "to");
        return ok(queries.metrics(query.window()));
    }

    @GetMapping("/audit")
    public ResponseEntity<AdminQueries.Page<AdminAuditLog.Entry>> audit(
            @RequestParam MultiValueMap<String, String> params, HttpServletRequest request) {
        ownership.requireAdmin(request);
        Query query = new Query(params, "action", "actorId", "targetId", "outcome");
        String action = query.oneOf("action", Set.of(AdminTaskCancellation.ACTION));
        UUID actor = query.uuid("actorId"), target = query.uuid("targetId");
        String outcome = query.oneOf("outcome", AUDIT_OUTCOMES);
        List<AdminAuditLog.Entry> entries = audit.entries().stream()
                .filter(e -> action == null || action.equals(e.action()))
                .filter(e -> actor == null || actor.equals(e.actorId()))
                .filter(e -> target == null || target.equals(e.targetId()))
                .filter(e -> outcome == null || outcome.equals(e.outcome())).toList();
        return ok(AdminQueries.Page.of(entries, query.page(), query.size()));
    }

    @PostMapping("/tasks/{taskId}/cancel")
    public ResponseEntity<AdminTaskCancellation.Result> cancel(@PathVariable String taskId,
            @RequestParam MultiValueMap<String, String> params, @RequestBody JsonNode body,
            HttpServletRequest request) {
        ownership.requireAdmin(request);
        if (!params.isEmpty() || body == null || !body.isObject() || body.size() != 1) invalid();
        JsonNode reason = body.get("reason");
        if (reason == null || !reason.isTextual()) invalid();
        String text = reason.asText().strip();
        int length = text.codePointCount(0, text.length());
        if (length < 1 || length > 200 || text.codePoints().anyMatch(c -> Character.getType(c) == Character.CONTROL
                || Character.getType(c) == Character.FORMAT)) invalid();
        return ok(cancellation.cancel(ownership.userId(request), uuid(taskId), text));
    }

    @ExceptionHandler(AdminAuditLog.Unavailable.class)
    ResponseEntity<ApiError> auditUnavailable(HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).cacheControl(CacheControl.noStore())
                .body(new ApiError("ADMIN_AUDIT_UNAVAILABLE", "Administrative audit is unavailable", Instant.now(),
                        request.getRequestURI(), UUID.randomUUID().toString(), Map.of()));
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    private static UUID uuid(String value) {
        if (value == null || !UUID_TEXT.matcher(value).matches()) invalid();
        return UUID.fromString(value);
    }

    private static void invalid() {
        throw new AuthFailure(HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
    }

    /** Unknown, repeated or empty parameters are rejected: a mistyped filter must not silently list everything. */
    private static final class Query {
        private final MultiValueMap<String, String> params;

        Query(MultiValueMap<String, String> params, String... filters) {
            this(params, true, filters);
        }

        Query(MultiValueMap<String, String> params, boolean paged, String... filters) {
            this.params = params;
            Set<String> allowed = paged ? Set.copyOf(Stream.concat(Stream.of("page", "size"), Stream.of(filters)).toList())
                    : Set.of(filters);
            params.forEach((name, values) -> {
                if (!allowed.contains(name) || values.size() != 1 || values.getFirst() == null
                        || values.getFirst().isEmpty() || values.getFirst().length() > 100) invalid();
            });
        }

        int page() {
            String value = params.getFirst("page");
            if (value == null) return 0;
            if (!PAGE.matcher(value).matches()) invalid();
            return Integer.parseInt(value);
        }

        int size() {
            String value = params.getFirst("size");
            if (value == null) return 20;
            if (!SIZE.matcher(value).matches()) invalid();
            return Integer.parseInt(value);
        }

        String oneOf(String name, Set<String> values) {
            String value = params.getFirst(name);
            if (value != null && !values.contains(value)) invalid();
            return value;
        }

        UUID uuid(String name) {
            String value = params.getFirst(name);
            return value == null ? null : AdminController.uuid(value);
        }

        String text(String name, int max) {
            String value = params.getFirst(name);
            if (value == null) return null;
            if (value.isBlank() || value.codePointCount(0, value.length()) > max
                    || value.codePoints().anyMatch(Character::isISOControl)) invalid();
            return value.strip();
        }

        AdminQueries.Window window() {
            OffsetDateTime from = time("from"), to = time("to");
            if (from == null && to == null) return null;
            if (from != null && to != null && !from.isBefore(to)) invalid();
            return new AdminQueries.Window(from, to);
        }

        private OffsetDateTime time(String name) {
            String value = params.getFirst(name);
            if (value == null) return null;
            try {
                return OffsetDateTime.parse(value);
            } catch (DateTimeParseException exception) {
                invalid();
                return null;
            }
        }
    }
}
