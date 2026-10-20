package dev.codeless.api.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.data.PostgresTestBase;
import dev.codeless.api.edit.EditMetadata;
import dev.codeless.api.tasks.TaskQueueService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.SqlParameterValue;
import org.springframework.test.context.TestPropertySource;
import org.springframework.util.FileSystemUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** D17-A acceptance over real HTTP and PostgreSQL. Metric fixtures live in private historical windows. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
        "CODELESS_DEMO_PASSWORD=demo-password-for-test-only",
        "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only",
        "codeless.admin.audit-root=target/d17a-admin-audit"
})
class AdminIntegrationTest extends PostgresTestBase {
    static final Path AUDIT = Path.of("target/d17a-admin-audit").toAbsolutePath().normalize();
    static final String[] LISTS = {"users", "applications", "tasks", "deployments", "model-calls", "audit"};
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    @Autowired TaskQueueService queue;
    private final HttpClient client = HttpClient.newHttpClient();

    record Browser(String cookie, String csrf) {}
    record Response(int status, String body, String cacheControl) {}

    @BeforeAll static void freshAuditRoot() throws Exception {
        FileSystemUtils.deleteRecursively(AUDIT);
        FileSystemUtils.deleteRecursively(AUDIT.resolveSibling("d17a-admin-audit.moved"));
    }

    @Test void d17aT1OrdinaryUsersHaveNoAdministrativeCapability() throws Exception {
        Browser user = login("demo@codeless.local", "demo-password-for-test-only");
        Browser admin = login("admin@codeless.local", "admin-password-for-test-only");
        UUID app = app(id("demo@codeless.local"), "T1 app", "ACTIVE", "MOCK", OffsetDateTime.now());
        UUID running = runningTask(app, "GENERATE");
        List<Map<String, Object>> matrix = new ArrayList<>();
        List<String> paths = new ArrayList<>();
        for (String list : LISTS) paths.add("/api/v0/admin/" + list);
        paths.add("/api/v0/admin/metrics");
        for (String path : paths) {
            Response anonymous = send("GET", path, null, null, false);
            Response ordinary = send("GET", path, user, null, false);
            Response administrator = send("GET", path, admin, null, false);
            assertThat(anonymous.status()).isEqualTo(401);
            assertThat(code(anonymous)).isEqualTo("UNAUTHENTICATED");
            assertThat(ordinary.status()).as(path).isEqualTo(403);
            assertThat(code(ordinary)).isEqualTo("FORBIDDEN");
            assertThat(ordinary.body()).doesNotContain("totalItems", "admin@codeless.local", "generation");
            assertThat(administrator.status()).as(path).isEqualTo(200);
            assertThat(administrator.cacheControl()).contains("no-store");
            matrix.add(row("GET", path, anonymous.status(), ordinary.status(), administrator.status()));
        }
        String cancel = "/api/v0/admin/tasks/" + running + "/cancel";
        String reason = "{\"reason\":\"ordinary user tries\"}";
        Response ordinaryCancel = send("POST", cancel, user, reason, true);
        assertThat(ordinaryCancel.status()).isEqualTo(403);
        assertThat(code(ordinaryCancel)).isEqualTo("FORBIDDEN");
        Response anonymousCancel = send("POST", cancel, null, reason, false);
        assertThat(anonymousCancel.status()).isEqualTo(401);
        Response adminWithoutCsrf = send("POST", cancel, admin, reason, false);
        assertThat(adminWithoutCsrf.status()).isEqualTo(403);
        assertThat(code(adminWithoutCsrf)).isEqualTo("CSRF_INVALID");
        matrix.add(row("POST", "/api/v0/admin/tasks/{taskId}/cancel", anonymousCancel.status(), ordinaryCancel.status(),
                adminWithoutCsrf.status()));
        // None of the rejected attempts touched the task or produced an audit entry.
        assertThat(taskRow(running)).containsEntry("status", "GENERATE").containsEntry("queue_state", "RUNNING");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM task_events WHERE task_id = ?", Integer.class, running))
                .isZero();
        assertThat(json(admin, "/api/v0/admin/audit?targetId=" + running).get("totalItems").asLong()).isZero();
        // Path spellings that might slip past a prefix check never return admin data to an ordinary user.
        List<Map<String, Object>> variants = new ArrayList<>();
        for (String path : List.of("/api/v0//admin/users", "/api/v0/admin//users", "/api/v0/admin/./users",
                "/api/v0/tasks/../admin/users", "/api/v0/admin/users/", "/api/v0/admin/%75sers",
                "/api/v0/%61dmin/users", "/api/v0/ADMIN/users", "/api/v0/admin;x=1/users", "/api/v0/admin/users;x=1")) {
            Response response = send("GET", path, user, null, false);
            assertThat(response.status()).as(path).isNotEqualTo(200);
            assertThat(response.body()).as(path).doesNotContain("totalItems", "admin@codeless.local");
            variants.add(Map.of("path", path, "status", response.status()));
        }
        // The pre-existing role-check endpoint: the filter now checks the decoded routed path, and the handler re-checks.
        for (String path : List.of("/api/v0/admin/session", "/api/v0/%61dmin/session", "/api/v0/admin;x=1/session",
                "/api/v0/%61dmin/users", "/api/v0/admin;x=1/users")) {
            Response response = send("GET", path, user, null, false);
            assertThat(response.status()).as(path).isEqualTo(403);
            assertThat(code(response)).isEqualTo("FORBIDDEN");
            variants.add(Map.of("path", path, "status", response.status(), "exact403", true));
        }
        assertThat(send("GET", "/api/v0/admin/session", admin, null, false).status()).isEqualTo(200);
        // The admin role grants only the admin API: owner routes for another user's task stay 404.
        assertThat(send("GET", "/api/v0/tasks/" + running, admin, null, false).status()).isEqualTo(404);
        assertThat(send("POST", "/api/v0/tasks/" + running + "/cancel", admin, null, true).status()).isEqualTo(404);
        assertThat(taskRow(running)).containsEntry("status", "GENERATE");
        evidence("D17-A-T1.json", Map.of("case", "D17-A-T1", "matrix", matrix, "pathVariants", variants,
                "taskAfterRejectedAttempts", taskRow(running), "auditEntriesForTask", 0));
    }

    @Test void d17aT2PagingAndFiltersAreExactAndStrict() throws Exception {
        Browser admin = login("admin@codeless.local", "admin-password-for-test-only");
        String tag = "d17a-t2-" + UUID.randomUUID().toString().substring(0, 8);
        OffsetDateTime base = OffsetDateTime.parse("2002-02-02T00:00:00Z");
        List<UUID> users = new ArrayList<>();
        for (int i = 0; i < 23; i++) {
            String role = i == 22 ? null : i % 5 == 0 ? "ADMIN" : "USER";
            // users 11 and 12 share a timestamp: the id tie-breaker must keep pages disjoint and complete
            users.add(user(tag + "-" + i + "@example.test", role, i % 7 == 3 ? "DISABLED" : "ACTIVE",
                    base.plusMinutes(i == 12 ? 11 : i)));
        }
        Map<String, Object> evidence = new LinkedHashMap<>();
        Set<String> seen = new HashSet<>();
        List<JsonNode> pages = new ArrayList<>();
        for (int page = 0; page < 3; page++) {
            JsonNode body = json(admin, "/api/v0/admin/users?q=" + tag + "&size=10&page=" + page);
            assertThat(body.get("totalItems").asLong()).isEqualTo(23);
            assertThat(body.get("totalPages").asLong()).isEqualTo(3);
            assertThat(body.get("page").asInt()).isEqualTo(page);
            assertThat(body.get("items")).hasSize(page < 2 ? 10 : 3);
            body.get("items").forEach(item -> assertThat(seen.add(item.get("id").asText())).isTrue());
            pages.add(body);
        }
        assertThat(seen).isEqualTo(new HashSet<>(users.stream().map(UUID::toString).toList()));
        assertThat(pages.getFirst().get("items").get(0).get("id").asText()).isEqualTo(users.get(22).toString());
        assertThat(pages.getFirst().get("items").get(0).has("role")).isTrue();
        assertThat(pages.getFirst().get("items").get(0).get("role").isNull()).isTrue();
        JsonNode beyond = json(admin, "/api/v0/admin/users?q=" + tag + "&size=10&page=3");
        assertThat(beyond.get("items")).isEmpty();
        assertThat(beyond.get("totalItems").asLong()).isEqualTo(23);
        evidence.put("userPages", pages);
        evidence.put("pageBeyondEnd", beyond);
        Map<String, Long> filters = new LinkedHashMap<>();
        filters.put("q=" + tag + "&role=ADMIN", 5L);
        filters.put("q=" + tag + "&role=USER", 17L);
        filters.put("q=" + tag + "&status=DISABLED", 3L);
        filters.put("q=" + tag + "&role=ADMIN&status=DISABLED", 1L);
        filters.put("q=" + tag.toUpperCase(), 23L);
        filters.put("q=" + tag + "-2", 4L); // -2, -20, -21, -22
        UUID owner = users.get(1);
        for (int i = 0; i < 12; i++)
            app(owner, "T2 app " + i, i < 3 ? "ARCHIVED" : "ACTIVE", List.of("STATIC", "MOCK", "LOCAL_STORAGE").get(i % 3),
                    base.plusHours(i));
        filters.put("ownerId=" + owner, 12L);
        filters.put("ownerId=" + owner + "&status=ARCHIVED", 3L);
        filters.put("ownerId=" + owner + "&dataMode=MOCK", 4L);
        filters.put("ownerId=" + owner + "&status=ACTIVE&dataMode=STATIC", 3L);
        UUID taskOwner = users.get(2);
        UUID app = app(taskOwner, "T2 tasks", "ACTIVE", "MOCK", base);
        String[][] tasks = {{"READY", null, "GENERATION"}, {"READY", null, "EDIT"}, {"FAILED", "BUILD_FAILED", "GENERATION"},
                {"FAILED", "CANCELLED", "GENERATION"}, {"FAILED", "INTERRUPTED", "EDIT"}, {"PLAN", null, "GENERATION"},
                {"VERIFY", null, "EDIT"}, {"READY", null, "GENERATION"}};
        List<UUID> taskIds = new ArrayList<>();
        for (int i = 0; i < tasks.length; i++)
            taskIds.add(task(app, "T2 prompt " + i, tasks[i][0], tasks[i][1], 0, tasks[i][2], base.plusMinutes(i)));
        filters.put("applicationId=" + app, 8L);
        filters.put("applicationId=" + app + "&status=FAILED", 3L);
        filters.put("applicationId=" + app + "&outcome=FAILED", 2L);
        filters.put("applicationId=" + app + "&outcome=CANCELLED", 1L);
        filters.put("applicationId=" + app + "&outcome=ACTIVE", 2L);
        filters.put("applicationId=" + app + "&kind=EDIT", 3L);
        filters.put("applicationId=" + app + "&kind=EDIT&outcome=READY", 1L);
        filters.put("ownerId=" + taskOwner + "&from=2002-02-02T00:02:00Z&to=2002-02-02T00:05:00Z", 3L);
        UUID version = verifiedVersion(app, taskIds.getFirst());
        String[] deployments = {"PUBLISHED", "FAILED", "FAILED", "REQUESTED", "PUBLISHED", "FAILED"};
        for (int i = 0; i < deployments.length; i++) publication(app, version, taskOwner, deployments[i], base.plusMinutes(i));
        filters.put("applicationId=" + app + "&status=FAILED", 3L);
        String[][] calls = {{"PLAN", "SUCCEEDED", "10", "5"}, {"GENERATE", "SUCCEEDED", null, null},
                {"GENERATE", "FAILED", "7", null}, {"REPAIR", "REQUESTED", null, null}};
        for (int i = 0; i < calls.length; i++)
            call(taskIds.getFirst(), calls[i][0], calls[i][1], calls[i][2] == null ? null : Integer.valueOf(calls[i][2]),
                    calls[i][3] == null ? null : Integer.valueOf(calls[i][3]), base.plusMinutes(i));
        List<Map<String, Object>> checked = new ArrayList<>();
        for (var filter : filters.entrySet()) {
            String resource = filter.getKey().startsWith("q=") ? "users"
                    : filter.getKey().contains("dataMode") || filter.getKey().contains("status=ARCHIVED")
                    || filter.getKey().equals("ownerId=" + owner) ? "applications" : "tasks";
            if (filter.getKey().equals("applicationId=" + app + "&status=FAILED")) {
                // same query string, two resources with different populations
                assertThat(json(admin, "/api/v0/admin/tasks?" + filter.getKey()).get("totalItems").asLong()).isEqualTo(3);
                resource = "deployments";
            }
            JsonNode body = json(admin, "/api/v0/admin/" + resource + "?" + filter.getKey());
            assertThat(body.get("totalItems").asLong()).as(resource + "?" + filter.getKey()).isEqualTo(filter.getValue());
            checked.add(Map.of("resource", resource, "query", filter.getKey(), "totalItems", body.get("totalItems").asLong()));
        }
        Map<String, Long> calledFilters = Map.of("taskId=" + taskIds.getFirst(), 4L,
                "taskId=" + taskIds.getFirst() + "&usage=UNKNOWN", 2L,
                "taskId=" + taskIds.getFirst() + "&usage=KNOWN", 1L,
                "taskId=" + taskIds.getFirst() + "&usage=PENDING&stage=REPAIR", 1L,
                "taskId=" + taskIds.getFirst() + "&status=SUCCEEDED", 2L);
        for (var filter : calledFilters.entrySet()) {
            JsonNode body = json(admin, "/api/v0/admin/model-calls?" + filter.getKey());
            assertThat(body.get("totalItems").asLong()).as(filter.getKey()).isEqualTo(filter.getValue());
            checked.add(Map.of("resource", "model-calls", "query", filter.getKey(), "totalItems", body.get("totalItems").asLong()));
        }
        JsonNode deploymentPage = json(admin, "/api/v0/admin/deployments?applicationId=" + app + "&size=4&page=1");
        assertThat(deploymentPage.get("items")).hasSize(2);
        assertThat(deploymentPage.get("totalPages").asLong()).isEqualTo(2);
        evidence.put("filters", checked);
        evidence.put("deploymentSecondPage", deploymentPage);
        evidence.put("modelCallPage", json(admin, "/api/v0/admin/model-calls?taskId=" + taskIds.getFirst()));
        evidence.put("taskPage", json(admin, "/api/v0/admin/tasks?applicationId=" + app + "&size=3"));
        evidence.put("applicationPage", json(admin, "/api/v0/admin/applications?ownerId=" + owner + "&size=5&page=2"));
        // Literal LIKE metacharacters: the API count equals an independent literal count.
        for (String q : List.of("%", "_")) {
            long expected = jdbc.queryForObject("SELECT count(*) FROM platform_users WHERE strpos(lower(email), ?) > 0 "
                    + "OR strpos(lower(display_name), ?) > 0", Long.class, q, q);
            assertThat(json(admin, "/api/v0/admin/users?size=1&q=" + (q.equals("%") ? "%25" : q)).get("totalItems").asLong())
                    .isEqualTo(expected);
        }
        List<Map<String, Object>> rejected = new ArrayList<>();
        for (String query : List.of("users?page=-1", "users?page=abc", "users?page=10001", "users?page=01", "users?size=0",
                "users?size=101", "users?size=1.5", "users?role=admin", "users?stauts=ACTIVE", "users?status=ACTIVE&status=DISABLED",
                "users?status=", "users?q=" + "x".repeat(101), "applications?ownerId=not-a-uuid", "applications?dataMode=REACT",
                "tasks?outcome=SUCCESS", "tasks?kind=AGENT", "tasks?from=2002-02-02", "tasks?from=2002-02-03T00:00:00Z&to=2002-02-02T00:00:00Z",
                "tasks?from=2002-02-02T00:00:00Z&to=2002-02-02T00:00:00Z", "deployments?status=UNKNOWN", "model-calls?usage=ZERO",
                "model-calls?taskId=1-1-1-1-1", "metrics?page=0", "metrics?from=yesterday", "audit?outcome=SUCCEEDED")) {
            Response response = send("GET", "/api/v0/admin/" + query, admin, null, false);
            assertThat(response.status()).as(query).isEqualTo(400);
            assertThat(code(response)).isEqualTo("INVALID_REQUEST");
            rejected.add(Map.of("query", query, "status", response.status(), "code", code(response)));
        }
        evidence.put("rejected", rejected);
        evidence("D17-A-T2.json", Map.of("case", "D17-A-T2", "result", evidence));
    }

    @Test void d17aT3GenerationAndDeploymentRatesNeverShareADenominator() throws Exception {
        Browser admin = login("admin@codeless.local", "admin-password-for-test-only");
        JsonNode empty = json(admin, "/api/v0/admin/metrics?from=1999-01-01T00:00:00Z&to=1999-01-02T00:00:00Z");
        for (String rate : List.of("/generation/successRate", "/deployment/successRate", "/repairs/averagePerTask",
                "/generation/byKind/GENERATION/successRate", "/generation/byKind/EDIT/successRate")) {
            assertThat(empty.at(rate).isNull()).as(rate).isTrue();
            assertThat(empty.at(rate).isMissingNode()).as(rate).isFalse();
        }
        assertThat(empty.at("/generation/denominator").asLong()).isZero();
        assertThat(empty.at("/deployment/denominator").asLong()).isZero();
        assertThat(empty.at("/tokens/calls").asLong()).isZero();
        String window = "from=2001-03-01T00:00:00Z&to=2001-03-02T00:00:00Z";
        OffsetDateTime from = OffsetDateTime.parse("2001-03-01T00:00:00Z");
        UUID owner = user("d17a-t3-" + UUID.randomUUID() + "@example.test", "USER", "ACTIVE", from);
        UUID app = app(owner, "T3 app", "ACTIVE", "STATIC", from);
        Object[][] tasks = {{"READY", null, 0, "GENERATION"}, {"READY", null, 2, "GENERATION"}, {"READY", null, 0, "GENERATION"},
                {"FAILED", "BUILD_FAILED", 3, "GENERATION"}, {"FAILED", "CANCELLED", 0, "GENERATION"},
                {"FAILED", "INTERRUPTED", 0, "GENERATION"}, {"PLAN", null, 0, "GENERATION"},
                {"READY", null, 0, "EDIT"}, {"FAILED", "VERIFY_FAILED", 1, "EDIT"}};
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < tasks.length; i++)
            ids.add(task(app, "T3 " + i, (String) tasks[i][0], (String) tasks[i][1], (Integer) tasks[i][2],
                    (String) tasks[i][3], from.plusMinutes(i))); // first at exactly `from`: included
        task(app, "T3 at exclusive end", "READY", null, 0, "GENERATION", OffsetDateTime.parse("2001-03-02T00:00:00Z"));
        UUID version = verifiedVersion(app, ids.getFirst());
        for (String status : List.of("PUBLISHED", "FAILED", "FAILED", "REQUESTED"))
            publication(app, version, owner, status, from.plusMinutes(30));
        JsonNode metrics = json(admin, "/api/v0/admin/metrics?" + window);
        assertGeneration(metrics.get("generation"), 9, 4, 3, 1, 1, 7, 0.5714);
        assertGeneration(metrics.at("/generation/byKind/GENERATION"), 7, 3, 2, 1, 1, 5, 0.6);
        assertGeneration(metrics.at("/generation/byKind/EDIT"), 2, 1, 1, 0, 0, 2, 0.5);
        assertDeployment(metrics.get("deployment"), 4, 1, 2, 1, 3, 0.3333);
        JsonNode repairs = metrics.get("repairs");
        assertThat(List.of(repairs.get("total").asLong(), repairs.get("tasksWithRepairs").asLong(),
                repairs.get("readyAfterRepair").asLong(), repairs.get("denominator").asLong())).containsExactly(6L, 3L, 1L, 9L);
        assertThat(repairs.get("averagePerTask").asDouble()).isEqualTo(0.6667);
        // Mixing would give READY/deployments = 4/4 or PUBLISHED/tasks = 1/9; neither appears.
        assertThat(metrics.at("/generation/successRate").asDouble()).isNotIn(1.0, 0.1111, 0.3333);
        assertThat(metrics.at("/deployment/successRate").asDouble()).isNotIn(1.0, 0.25, 0.5714);
        List<Map<String, Object>> drill = new ArrayList<>();
        Map<String, String> buckets = Map.of("READY", "/generation/ready", "FAILED", "/generation/failed",
                "CANCELLED", "/generation/cancelled", "ACTIVE", "/generation/active");
        for (var bucket : buckets.entrySet()) drill.add(drill(admin, "tasks?outcome=" + bucket.getKey() + "&" + window,
                metrics.at(bucket.getValue()).asLong()));
        for (var bucket : Map.of("PUBLISHED", "/deployment/published", "FAILED", "/deployment/failed",
                "REQUESTED", "/deployment/inProgress").entrySet())
            drill.add(drill(admin, "deployments?status=" + bucket.getKey() + "&" + window, metrics.at(bucket.getValue()).asLong()));
        drill.add(drill(admin, "tasks?kind=EDIT&" + window, metrics.at("/generation/byKind/EDIT/total").asLong()));
        // One more failed deployment moves only the deployment rate.
        publication(app, version, owner, "FAILED", from.plusMinutes(40));
        JsonNode afterDeployment = json(admin, "/api/v0/admin/metrics?" + window);
        assertThat(afterDeployment.get("generation")).isEqualTo(metrics.get("generation"));
        assertDeployment(afterDeployment.get("deployment"), 5, 1, 3, 1, 4, 0.25);
        // One more READY task moves only the generation rate.
        task(app, "T3 extra", "READY", null, 0, "GENERATION", from.plusMinutes(50));
        JsonNode afterTask = json(admin, "/api/v0/admin/metrics?" + window);
        assertThat(afterTask.get("deployment")).isEqualTo(afterDeployment.get("deployment"));
        assertGeneration(afterTask.get("generation"), 10, 5, 3, 1, 1, 8, 0.625);
        evidence("D17-A-T3.json", Map.of("case", "D17-A-T3", "window", window, "emptyWindow", empty, "metrics", metrics,
                "afterExtraFailedDeployment", afterDeployment, "afterExtraReadyTask", afterTask, "drillDown", drill));
    }

    @Test void d17aT4UnknownUsageStaysUnknownAndAdministratorCancelIsAudited() throws Exception {
        Browser admin = login("admin@codeless.local", "admin-password-for-test-only");
        Browser owner = login("demo@codeless.local", "demo-password-for-test-only");
        UUID adminId = id("admin@codeless.local");
        OffsetDateTime at = OffsetDateTime.parse("2001-04-01T00:00:00Z");
        UUID app = app(id("demo@codeless.local"), "T4 app", "ACTIVE", "MOCK", at);
        UUID task = task(app, "T4 usage", "READY", null, 0, "GENERATION", at);
        call(task, "PLAN", "SUCCEEDED", 100, 50, at);
        call(task, "GENERATE", "FAILED", 30, null, at.plusMinutes(1));
        call(task, "GENERATE", "SUCCEEDED", null, null, at.plusMinutes(2));
        call(task, "REPAIR", "REQUESTED", null, null, at.plusMinutes(3));
        call(task, "REPAIR", "FAILED", 0, 0, at.plusMinutes(4));
        call(task, "PLAN", "SUCCEEDED", null, null, OffsetDateTime.parse("2001-04-02T12:00:00Z"));
        call(task, "PLAN", "SUCCEEDED", 8, 4, OffsetDateTime.parse("2001-04-03T12:00:00Z"));
        JsonNode mixed = json(admin, "/api/v0/admin/metrics?from=2001-04-01T00:00:00Z&to=2001-04-02T00:00:00Z").get("tokens");
        assertThat(List.of(mixed.get("calls").asLong(), mixed.get("knownCalls").asLong(), mixed.get("unknownCalls").asLong(),
                mixed.get("pendingCalls").asLong(), mixed.get("knownInputTokens").asLong(), mixed.get("knownOutputTokens").asLong(),
                mixed.get("knownTotalTokens").asLong())).containsExactly(5L, 2L, 2L, 1L, 100L, 50L, 150L);
        for (String field : List.of("inputTokens", "outputTokens", "totalTokens"))
            assertThat(mixed.get(field).isNull()).as(field).isTrue();
        assertThat(mixed.get("complete").asBoolean()).isFalse();
        JsonNode unknownOnly = json(admin, "/api/v0/admin/metrics?from=2001-04-02T00:00:00Z&to=2001-04-03T00:00:00Z").get("tokens");
        assertThat(unknownOnly.get("totalTokens").isNull()).isTrue();
        assertThat(unknownOnly.get("knownCalls").asLong()).isZero();
        assertThat(unknownOnly.get("unknownCalls").asLong()).isEqualTo(1);
        JsonNode knownOnly = json(admin, "/api/v0/admin/metrics?from=2001-04-03T00:00:00Z&to=2001-04-04T00:00:00Z").get("tokens");
        assertThat(knownOnly.get("totalTokens").asLong()).isEqualTo(12);
        assertThat(knownOnly.get("complete").asBoolean()).isTrue();
        JsonNode calls = json(admin, "/api/v0/admin/model-calls?taskId=" + task + "&from=2001-04-01T00:00:00Z&to=2001-04-02T00:00:00Z");
        Map<String, JsonNode> byStage = new LinkedHashMap<>();
        calls.get("items").forEach(item -> byStage.put(item.get("stage").asText() + "/" + item.get("status").asText(), item));
        JsonNode unknown = byStage.get("GENERATE/SUCCEEDED"), partial = byStage.get("GENERATE/FAILED"), zero = byStage.get("REPAIR/FAILED");
        assertThat(unknown.get("usage").asText()).isEqualTo("UNKNOWN");
        for (String field : List.of("inputTokens", "outputTokens", "totalTokens")) {
            assertThat(unknown.has(field) && unknown.get(field).isNull()).as(field).isTrue();
        }
        assertThat(partial.get("usage").asText()).isEqualTo("UNKNOWN");
        assertThat(partial.get("inputTokens").asLong()).isEqualTo(30);
        assertThat(partial.get("totalTokens").isNull()).isTrue();
        assertThat(zero.get("usage").asText()).isEqualTo("KNOWN");
        assertThat(zero.get("totalTokens").isNumber()).isTrue();
        assertThat(zero.get("totalTokens").asLong()).isZero();
        assertThat(byStage.get("REPAIR/REQUESTED").get("usage").asText()).isEqualTo("PENDING");

        UUID running = runningTask(app, "GENERATE");
        UUID lease = jdbc.queryForObject("SELECT lease_token FROM generation_tasks WHERE id = ?", UUID.class, running);
        String cancel = "/api/v0/admin/tasks/" + running + "/cancel";
        Response first = send("POST", cancel, admin, "{\"reason\":\"Stuck build loop; leaked token=sk-live-abcdef1234567890\"}", true);
        assertThat(first.status()).isEqualTo(200);
        assertThat(first.cacheControl()).contains("no-store");
        JsonNode cancelled = mapper.readTree(first.body());
        assertThat(cancelled.at("/task/status").asText()).isEqualTo("FAILED");
        assertThat(cancelled.at("/task/failureCode").asText()).isEqualTo("CANCELLED");
        assertThat(cancelled.at("/task/cancellable").asBoolean()).isFalse();
        assertThat(cancelled.at("/audit/outcome").asText()).isEqualTo("CANCELLED");
        assertThat(cancelled.at("/audit/previousStatus").asText()).isEqualTo("GENERATE");
        assertThat(cancelled.at("/audit/resultingStatus").asText()).isEqualTo("FAILED");
        assertThat(cancelled.at("/audit/actorId").asText()).isEqualTo(adminId.toString());
        assertThat(cancelled.at("/audit/targetId").asText()).isEqualTo(running.toString());
        assertThat(cancelled.at("/audit/reason").asText()).contains("[REDACTED]").doesNotContain("sk-live", "abcdef1234567890");
        assertThat(first.body()).doesNotContain("sk-live");
        assertThat(taskRow(running)).containsEntry("queue_state", "FINISHED").containsEntry("lease_token", null);
        assertThat(jdbc.queryForObject("SELECT message FROM task_events WHERE task_id = ? ORDER BY sequence DESC LIMIT 1",
                String.class, running)).isEqualTo("Task cancelled by administrator");
        JsonNode ownerView = json(owner, "/api/v0/tasks/" + running);
        assertThat(ownerView.get("failureCode").asText()).isEqualTo("CANCELLED");
        assertThatThrownBy(() -> queue.advance(new TaskQueueService.Claim(running, lease, TaskStatus.GENERATE),
                TaskStatus.VERIFY, EventType.STAGE_COMPLETED, "stale worker", null)).isInstanceOf(RuntimeException.class);
        assertThat(taskRow(running)).containsEntry("status", "FAILED");
        int events = jdbc.queryForObject("SELECT count(*) FROM task_events WHERE task_id = ?", Integer.class, running);
        Response repeat = send("POST", cancel, admin, "{\"reason\":\"double click\"}", true);
        assertThat(repeat.status()).isEqualTo(200);
        assertThat(mapper.readTree(repeat.body()).at("/audit/outcome").asText()).isEqualTo("ALREADY_TERMINAL");
        assertThat(mapper.readTree(repeat.body()).at("/audit/previousStatus").asText()).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM task_events WHERE task_id = ?", Integer.class, running))
                .isEqualTo(events);
        UUID missing = UUID.randomUUID();
        Response notFound = send("POST", "/api/v0/admin/tasks/" + missing + "/cancel", admin, "{\"reason\":\"gone\"}", true);
        assertThat(notFound.status()).isEqualTo(404);
        assertThat(code(notFound)).isEqualTo("NOT_FOUND");
        JsonNode audit = json(admin, "/api/v0/admin/audit?targetId=" + running);
        assertThat(audit.get("totalItems").asLong()).isEqualTo(2);
        assertThat(audit.at("/items/0/outcome").asText()).isEqualTo("ALREADY_TERMINAL");
        assertThat(audit.at("/items/1/outcome").asText()).isEqualTo("CANCELLED");
        assertThat(audit.at("/items/1/action").asText()).isEqualTo("TASK_CANCEL");
        JsonNode missingAudit = json(admin, "/api/v0/admin/audit?targetId=" + missing);
        assertThat(missingAudit.at("/items/0/outcome").asText()).isEqualTo("NOT_FOUND");
        long before = json(admin, "/api/v0/admin/audit").get("totalItems").asLong();
        List<Map<String, Object>> invalid = new ArrayList<>();
        UUID other = runningTask(app(id("demo@codeless.local"), "T4 second", "ACTIVE", "MOCK", at), "VERIFY");
        String otherCancel = "/api/v0/admin/tasks/" + other + "/cancel";
        for (String body : List.of("{}", "{\"reason\":\"\"}", "{\"reason\":\"   \"}", "{\"reason\":\"" + "r".repeat(201) + "\"}",
                "{\"reason\":\"ok\",\"force\":true}", "{\"reason\":7}", "{\"reason\":\"tab\\tinside\"}", "[\"reason\"]", "not json")) {
            Response response = send("POST", otherCancel, admin, body, true);
            assertThat(response.status()).as(body).isEqualTo(400);
            invalid.add(Map.of("body", body.length() > 40 ? body.substring(0, 40) + "…" : body, "status", response.status()));
        }
        Response badId = send("POST", "/api/v0/admin/tasks/1-1-1-1-1/cancel", admin, "{\"reason\":\"x\"}", true);
        assertThat(badId.status()).isEqualTo(400);
        assertThat(json(admin, "/api/v0/admin/audit").get("totalItems").asLong()).isEqualTo(before);
        assertThat(taskRow(other)).containsEntry("status", "VERIFY");
        // Audit unavailable: nothing is cancelled and the audit list fails closed instead of looking empty.
        Path moved = AUDIT.resolveSibling("d17a-admin-audit.moved");
        Files.move(AUDIT, moved);
        Files.writeString(AUDIT, "not a directory");
        Response unavailable;
        Response unavailableList;
        try {
            unavailable = send("POST", otherCancel, admin, "{\"reason\":\"audit offline\"}", true);
            unavailableList = send("GET", "/api/v0/admin/audit", admin, null, false);
        } finally {
            Files.delete(AUDIT);
            Files.move(moved, AUDIT);
        }
        assertThat(unavailable.status()).isEqualTo(503);
        assertThat(code(unavailable)).isEqualTo("ADMIN_AUDIT_UNAVAILABLE");
        assertThat(unavailableList.status()).isEqualTo(503);
        assertThat(taskRow(other)).containsEntry("status", "VERIFY").containsEntry("queue_state", "RUNNING");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM task_events WHERE task_id = ?", Integer.class, other)).isZero();
        assertThat(json(admin, "/api/v0/admin/audit").get("totalItems").asLong()).isEqualTo(before);
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("case", "D17-A-T4");
        evidence.put("tokensMixedWindow", mixed);
        evidence.put("tokensUnknownOnlyWindow", unknownOnly);
        evidence.put("tokensKnownOnlyWindow", knownOnly);
        evidence.put("modelCallPage", calls);
        evidence.put("cancel", cancelled);
        evidence.put("repeatCancel", mapper.readTree(repeat.body()));
        evidence.put("notFound", Map.of("status", notFound.status(), "code", code(notFound)));
        evidence.put("auditForTask", audit);
        evidence.put("auditForMissingTask", missingAudit);
        evidence.put("invalidBodies", invalid);
        evidence.put("auditUnavailable", Map.of("cancelStatus", unavailable.status(), "cancelCode", code(unavailable),
                "listStatus", unavailableList.status(), "taskAfter", taskRow(other)));
        evidence("D17-A-T4.json", evidence);
    }

    @Test void d17a04SecretsAndFullPromptsNeverReachAdministrators() throws Exception {
        Browser admin = login("admin@codeless.local", "admin-password-for-test-only");
        OffsetDateTime at = OffsetDateTime.parse("2001-05-01T00:00:00Z");
        UUID owner = user("d17a-04-" + UUID.randomUUID() + "@example.test", "USER", "ACTIVE", at);
        UUID app = app(owner, "Secrets app", "ACTIVE", "LOCAL_STORAGE", at);
        String prompt = "Build a portfolio page. api_key=sk-test-1234567890abcdef password: hunter2hunter2 "
                + "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY----- "
                + "Authorization: Bearer abcdefghijklmnopqrstu 密码：秘密口令123 and a long private brief that must stay private";
        String straddle = "x".repeat(35) + " sk-abcdefghijklmnopqrstuvwx";
        task(app, prompt, "READY", null, 0, "GENERATION", at);
        task(app, straddle, "PLAN", null, 0, "GENERATION", at.plusMinutes(1));
        JsonNode page = json(admin, "/api/v0/admin/tasks?applicationId=" + app);
        String body = mapper.writeValueAsString(page);
        for (String secret : List.of("sk-test", "1234567890abcdef", "hunter2", "BEGIN PRIVATE", "MIIEvQ", "abcdefghijklmnop",
                "秘密口令", "must stay private", "sk-ab"))
            assertThat(body).as(secret).doesNotContain(secret);
        for (JsonNode item : page.get("items")) {
            assertThat(item.has("prompt")).isFalse();
            String preview = item.get("promptPreview").asText();
            assertThat(preview.codePointCount(0, preview.length())).isLessThanOrEqualTo(AdminRedaction.PREVIEW_CODE_POINTS + 1);
        }
        assertThat(page.at("/items/1/promptLength").asInt()).isEqualTo(prompt.codePointCount(0, prompt.length()));
        JsonNode users = json(admin, "/api/v0/admin/users?q=d17a-04");
        assertThat(mapper.writeValueAsString(users)).doesNotContain("$2a$", "password", "hash");
        Set<String> fields = new HashSet<>();
        users.at("/items/0").propertyNames().forEach(fields::add);
        assertThat(fields).containsExactlyInAnyOrder("id", "email", "displayName", "status", "role", "applicationCount", "createdAt");
        evidence("D17-A-04.json", Map.of("case", "D17-A-04", "taskPage", page, "userFields", fields));
    }

    private void assertGeneration(JsonNode node, long total, long ready, long failed, long cancelled, long active,
                                  long denominator, double rate) {
        assertThat(List.of(node.get("total").asLong(), node.get("ready").asLong(), node.get("failed").asLong(),
                node.get("cancelled").asLong(), node.get("active").asLong(), node.get("denominator").asLong()))
                .containsExactly(total, ready, failed, cancelled, active, denominator);
        assertThat(node.get("successRate").asDouble()).isEqualTo(rate);
    }

    private void assertDeployment(JsonNode node, long total, long published, long failed, long inProgress,
                                  long denominator, double rate) {
        assertThat(List.of(node.get("total").asLong(), node.get("published").asLong(), node.get("failed").asLong(),
                node.get("inProgress").asLong(), node.get("denominator").asLong()))
                .containsExactly(total, published, failed, inProgress, denominator);
        assertThat(node.get("successRate").asDouble()).isEqualTo(rate);
    }

    private Map<String, Object> drill(Browser admin, String query, long metric) throws Exception {
        long listed = json(admin, "/api/v0/admin/" + query).get("totalItems").asLong();
        assertThat(listed).as(query).isEqualTo(metric);
        return Map.of("query", query, "totalItems", listed, "metric", metric);
    }

    private static Map<String, Object> row(String method, String path, int anonymous, int ordinary, int admin) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("method", method);
        row.put("path", path);
        row.put("anonymous", anonymous);
        row.put("ordinaryUser", ordinary);
        row.put(method.equals("GET") ? "admin" : "adminWithoutCsrf", admin);
        return row;
    }

    private Browser login(String email, String password) throws Exception {
        HttpResponse<String> csrf = client.send(HttpRequest.newBuilder(URI.create(base("/api/v0/auth/csrf"))).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        String cookie = csrf.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        String token = mapper.readTree(csrf.body()).get("token").asText();
        HttpResponse<String> login = client.send(HttpRequest.newBuilder(URI.create(base("/api/v0/auth/login")))
                .header("Cookie", cookie).header("X-CSRF-Token", token).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .build(), HttpResponse.BodyHandlers.ofString());
        assertThat(login.statusCode()).isEqualTo(200);
        return new Browser(login.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0], token);
    }

    private Response send(String method, String path, Browser browser, String body, boolean csrf) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(base(path)));
        if (browser != null) request.header("Cookie", browser.cookie());
        if (browser != null && csrf) request.header("X-CSRF-Token", browser.csrf());
        if (body != null) request.header("Content-Type", "application/json");
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        HttpResponse<String> response = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        return new Response(response.statusCode(), response.body(), response.headers().firstValue("cache-control").orElse(""));
    }

    private JsonNode json(Browser browser, String path) throws Exception {
        Response response = send("GET", path, browser, null, false);
        assertThat(response.status()).as(path + " " + response.body()).isEqualTo(200);
        return mapper.readTree(response.body());
    }

    private String code(Response response) {
        return mapper.readTree(response.body()).path("code").asText();
    }

    private String base(String path) {
        return "http://127.0.0.1:" + port + path;
    }

    private UUID id(String email) {
        return jdbc.queryForObject("SELECT id FROM platform_users WHERE lower(email) = lower(?)", UUID.class, email);
    }

    private Map<String, Object> taskRow(UUID task) {
        return jdbc.queryForMap("SELECT status, queue_state, failure_code, lease_token FROM generation_tasks WHERE id = ?", task);
    }

    private UUID user(String email, String role, String status, OffsetDateTime created) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO platform_users(id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                id, email, "D17A " + email, status, created, created);
        if (role != null) jdbc.update("INSERT INTO auth_credentials(user_id, password_hash, role) VALUES (?, ?, ?)",
                id, "$2a$10$" + "x".repeat(53), role);
        return id;
    }

    private UUID app(UUID owner, String name, String status, String dataMode, OffsetDateTime created) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO applications(id, owner_id, name, data_mode, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                id, owner, name, dataMode, status, created, created);
        return id;
    }

    private UUID task(UUID app, String prompt, String status, String failure, int repairs, String kind, OffsetDateTime created) {
        UUID id = UUID.randomUUID();
        boolean active = !status.equals("READY") && !status.equals("FAILED");
        jdbc.update("""
                INSERT INTO generation_tasks(id, application_id, prompt, status, failure_code, repair_attempts, queue_state,
                    deadline_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, now() + interval '1 hour', ?, ?)
                """, id, app, prompt, status, new SqlParameterValue(Types.VARCHAR, failure), repairs,
                active ? "QUEUED" : "FINISHED", created, created);
        if (kind.equals("EDIT")) {
            jdbc.update("INSERT INTO task_events(id, task_id, sequence, type, stage, message) VALUES (?, ?, 1, 'STAGE_STARTED', 'PLAN', ?)",
                    UUID.randomUUID(), id, EditMetadata.PREFIX + "{\"baseVersionId\":null,\"source\":{\"type\":\"CHAT\",\"messageId\":\"m\"}}");
            jdbc.update("UPDATE generation_tasks SET event_sequence = 1 WHERE id = ?", id);
        }
        return id;
    }

    private UUID runningTask(UUID app, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO generation_tasks(id, application_id, prompt, status, queue_state, lease_token, lease_expires_at,
                    deadline_at) VALUES (?, ?, 'Running fixture', ?, 'RUNNING', ?, now() + interval '1 hour', now() + interval '1 hour')
                """, id, app, status, UUID.randomUUID());
        return id;
    }

    private UUID verifiedVersion(UUID app, UUID task) {
        UUID version = UUID.randomUUID(), build = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO application_versions(id, application_id, number, source_digest, status)
                VALUES (?, ?, (SELECT coalesce(max(number), 0) + 1 FROM application_versions WHERE application_id = ?), ?, 'DRAFT')
                """, version, app, app, "sha256:" + "a".repeat(64));
        jdbc.update("INSERT INTO builds(id, task_id, version_id, status, exit_code, artifact_digest, completed_at) "
                + "VALUES (?, ?, ?, 'SUCCEEDED', 0, ?, now())", build, task, version, "sha256:" + "b".repeat(64));
        jdbc.update("UPDATE application_versions SET status = 'VERIFIED', build_id = ? WHERE id = ?", build, version);
        return version;
    }

    private void publication(UUID app, UUID version, UUID owner, String status, OffsetDateTime created) {
        UUID id = UUID.randomUUID();
        boolean published = status.equals("PUBLISHED");
        jdbc.update("""
                INSERT INTO publications(id, application_id, version_id, requested_by, status, url, created_at, updated_at, published_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, app, version, owner, status,
                new SqlParameterValue(Types.VARCHAR, published ? "https://d17a.example.test/" + id + "/" : null), created, created,
                new SqlParameterValue(Types.TIMESTAMP_WITH_TIMEZONE, published ? created : null));
    }

    private void call(UUID task, String stage, String status, Integer input, Integer output, OffsetDateTime created) {
        jdbc.update("""
                INSERT INTO model_calls(id, task_id, stage, provider, model, status, input_tokens, output_tokens, error_code,
                    created_at, completed_at) VALUES (?, ?, ?, 'deterministic-mock', 'fixture-model', ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID(), task, stage, status, new SqlParameterValue(Types.INTEGER, input),
                new SqlParameterValue(Types.INTEGER, output),
                new SqlParameterValue(Types.VARCHAR, status.equals("FAILED") ? "MODEL_TIMEOUT" : null), created,
                new SqlParameterValue(Types.TIMESTAMP_WITH_TIMEZONE, status.equals("REQUESTED") ? null : created.plusSeconds(1)));
    }

    private void evidence(String name, Object value) throws Exception {
        String directory = System.getenv("CODELESS_ADMIN_EVIDENCE_DIR");
        if (directory == null || directory.isBlank()) return;
        Path target = Path.of(directory);
        Files.createDirectories(target);
        Object tree = mapper.valueToTree(value);
        if (tree instanceof ObjectNode object) object.put("source", "AdminIntegrationTest real HTTP + PostgreSQL");
        Files.writeString(target.resolve(name), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(tree) + "\n");
    }
}
