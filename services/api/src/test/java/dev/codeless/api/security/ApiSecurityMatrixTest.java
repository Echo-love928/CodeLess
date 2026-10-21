package dev.codeless.api.security;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;

import dev.codeless.api.data.PlatformModels.DataMode;
import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.data.PostgresTestBase;
import dev.codeless.api.versions.SnapshotStore;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * D19-A API permission and input-boundary matrix over real HTTP (embedded Tomcat) and PostgreSQL.
 * <ul>
 *   <li>Every handler Spring MVC registers must be classified in {@link #routes()}; an unclassified new route fails the gate.</li>
 *   <li>T1: every owner route is replayed by another user against the owner's real resources and must be byte-for-byte the
 *   404 of a random ID, with no state change; the owner's identical request is the positive control.</li>
 *   <li>T2: every unsafe route is sent without/with a foreign/with a mangled CSRF token and through non-canonical path
 *   spellings (the production edge forwards the raw request target); none may execute.</li>
 *   <li>T3: everything the process prints from class load on, plus persisted ledgers and task events, is scanned for the
 *   passwords, session ids, CSRF tokens, keys and credentials this class used.</li>
 *   <li>T4: illegal publish, generation, edit and source-read input leaves the database and every storage root unchanged.</li>
 * </ul>
 * Own context (isolated roots, small pool) that is closed after the class, so the shared PostgreSQL budget is unchanged.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "CODELESS_DEMO_PASSWORD=" + ApiSecurityMatrixTest.DEMO_PASSWORD,
        "CODELESS_ADMIN_PASSWORD=" + ApiSecurityMatrixTest.ADMIN_PASSWORD,
        "CODELESS_COOKIE_SECURE=true",
        "CODELESS_PREVIEW_ORIGIN=https://preview.codeless-preview.test",
        "CODELESS_PLATFORM_ORIGIN=https://platform.codeless.test",
        "codeless.deploy.worker-enabled=false",
        "codeless.export.repository-root=../..",
        "spring.datasource.hikari.maximum-pool-size=5"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ApiSecurityMatrixTest extends PostgresTestBase {
    static final String DEMO_PASSWORD = "demo-password-for-test-only";
    static final String ADMIN_PASSWORD = "admin-password-for-test-only";
    static final SecurityFixtures.OutputTee OUTPUT = SecurityFixtures.OutputTee.install();
    static final Path ROOT = Path.of("target", "d19a-security", UUID.randomUUID().toString()).toAbsolutePath().normalize();
    static final String SIGNING_KEY = SecurityFixtures.hex(32);
    static final String REGISTRY_KEY = SecurityFixtures.hex(32);
    static final SecurityFixtures.PreviewGatewayStub GATEWAY = SecurityFixtures.PreviewGatewayStub.start(REGISTRY_KEY);
    static final Set<Integer> REFUSED = Set.of(400, 401, 403, 404, 405);

    @DynamicPropertySource
    static void isolatedRoots(DynamicPropertyRegistry registry) {
        registry.add("codeless.agent.private-root", () -> ROOT.resolve("agent").toString());
        registry.add("codeless.versions.root", () -> ROOT.resolve("versions").toString());
        registry.add("codeless.deploy.root", () -> ROOT.resolve("deployments").toString());
        registry.add("codeless.model.audit-root", () -> ROOT.resolve("model-calls").toString());
        registry.add("CODELESS_FILE_WORKSPACE_ROOT", () -> ROOT.resolve("workspaces").toString());
        registry.add("CODELESS_FILE_AUDIT_ROOT", () -> ROOT.resolve("file-audit").toString());
        registry.add("CODELESS_PREVIEW_SIGNING_KEY", () -> SIGNING_KEY);
        registry.add("CODELESS_PREVIEW_REGISTRY_KEY", () -> REGISTRY_KEY);
        registry.add("CODELESS_PREVIEW_GATEWAY_INTERNAL_ORIGIN", () -> "http://127.0.0.1:" + GATEWAY.port());
    }

    enum Access { PUBLIC, SELF, OWNER, ADMIN, INTERNAL, FRAMEWORK }
    record Account(UUID id, String email, String password) {}
    record Session(String cookie, String csrf) {}
    record Res(int status, String body, HttpHeaders headers) {}
    record Target(UUID app, UUID task, UUID editTask, UUID version, String sourceDigest, String artifactDigest,
                  UUID publication, String publicationKey) {}
    record Call(String method, String path, String body, String key, String accept) {}
    @FunctionalInterface interface Calls { Call on(Target target); }
    /** key = "METHOD pattern" (+ " [produces]") exactly as Spring MVC registers it. */
    record Route(String key, Access access, Calls call, int ownerStatus) {}

    @Value("${local.server.port}") int port;
    @Autowired JdbcClient sql;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformRepository repository;
    @Autowired SnapshotStore store;
    @Autowired BCryptPasswordEncoder encoder;
    @Autowired ObjectMapper mapper;
    @Autowired @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping mappings;
    private final HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();
    /** Every credential-like value this class creates or receives; T3 requires that none reaches a log. */
    private final Map<String, String> secrets = new ConcurrentHashMap<>();

    private Account victimAccount, attackerAccount;
    private Session victim, attacker, admin;
    private Target owned, missing;
    private UUID attackerApp;
    private SecurityFixtures.Version attackerVersion;

    @BeforeAll
    void fixtures() throws Exception {
        secret("demo password", DEMO_PASSWORD);
        secret("admin password", ADMIN_PASSWORD);
        secret("preview signing key", SIGNING_KEY);
        secret("preview registry key", REGISTRY_KEY);
        secret("database password", "local-test-only");
        victimAccount = account("victim");
        attackerAccount = account("attacker");
        UUID app = UUID.randomUUID(), task = UUID.randomUUID();
        repository.createApplication(app, victimAccount.id(), "D19A victim app", DataMode.MOCK);
        repository.createTask(task, app, "D19A victim generation");
        var version = SecurityFixtures.verified(sql, store, ROOT.resolve("scratch"), app, task, 1, "victim-only-marker");
        GATEWAY.register(app, version);
        victim = login(victimAccount.email(), victimAccount.password());
        attacker = login(attackerAccount.email(), attackerAccount.password());
        admin = login("admin@codeless.local", ADMIN_PASSWORD);
        // Owner-created edit task through the real API, cancelled so no task stays active for the owner controls.
        Res edit = send(victim, "POST", "/api/v0/applications/" + app + "/edits", json(Map.of("baseVersionId", version.id().toString(),
                "prompt", "D19A victim edit", "source", Map.of("type", "CHAT"))), victim.csrf(), null, null);
        assertThat(edit.status()).as(edit.body()).isEqualTo(202);
        UUID editTask = UUID.fromString(tree(edit).path("task").path("id").asText());
        assertThat(send(victim, "POST", "/api/v0/tasks/" + editTask + "/cancel", null, victim.csrf(), null, null).status()).isEqualTo(200);
        String key = secret("victim publication key", "d19a-victim-publication-" + SecurityFixtures.hex(8));
        Res publication = send(victim, "POST", "/api/v0/publications", json(Map.of("applicationId", app.toString(),
                "versionId", version.id().toString(), "artifactDigest", version.artifactDigest())), victim.csrf(), key, null);
        assertThat(publication.status()).as(publication.body()).isEqualTo(202);
        owned = new Target(app, task, editTask, version.id(), version.sourceDigest(), version.artifactDigest(),
                UUID.fromString(tree(publication).path("id").asText()), key);
        missing = new Target(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                version.sourceDigest(), version.artifactDigest(), UUID.randomUUID(), key);
        attackerApp = UUID.randomUUID();
        UUID attackerTask = UUID.randomUUID();
        repository.createApplication(attackerApp, attackerAccount.id(), "D19A attacker app", DataMode.MOCK);
        repository.createTask(attackerTask, attackerApp, "D19A attacker generation");
        attackerVersion = SecurityFixtures.verified(sql, store, ROOT.resolve("scratch"), attackerApp, attackerTask, 1, "attacker-marker");
        GATEWAY.register(attackerApp, attackerVersion);
    }

    @AfterAll
    void stop() {
        GATEWAY.stop();
        OUTPUT.restore();
    }

    /** Ordered so that the owner controls which change state (create, cancel, rename, restore) run last. */
    private List<Route> routes() {
        return List.of(
                new Route("GET /api/health", Access.PUBLIC, t -> get("/api/health"), 200),
                new Route("GET /api/v0/auth/csrf", Access.PUBLIC, t -> get("/api/v0/auth/csrf"), 200),
                new Route("POST /api/v0/auth/login", Access.PUBLIC, t -> post("/api/v0/auth/login",
                        Map.of("email", "nobody@d19a.test", "password", "not-a-password")), 401),
                new Route("GET /api/v0/auth/me", Access.SELF, t -> get("/api/v0/auth/me"), 200),
                new Route("POST /api/v0/auth/logout", Access.SELF, t -> post("/api/v0/auth/logout", null), 204),
                new Route("GET /api/v0/applications", Access.SELF, t -> get("/api/v0/applications"), 200),
                new Route("POST /api/v0/applications", Access.SELF, t -> post("/api/v0/applications",
                        Map.of("name", "D19A self app", "dataMode", "MOCK")), 201),
                new Route("GET /api/v0/admin/session", Access.ADMIN, t -> get("/api/v0/admin/session"), 200),
                new Route("GET /api/v0/admin/users", Access.ADMIN, t -> get("/api/v0/admin/users"), 200),
                new Route("GET /api/v0/admin/applications", Access.ADMIN, t -> get("/api/v0/admin/applications"), 200),
                new Route("GET /api/v0/admin/tasks", Access.ADMIN, t -> get("/api/v0/admin/tasks"), 200),
                new Route("GET /api/v0/admin/deployments", Access.ADMIN, t -> get("/api/v0/admin/deployments"), 200),
                new Route("GET /api/v0/admin/model-calls", Access.ADMIN, t -> get("/api/v0/admin/model-calls"), 200),
                new Route("GET /api/v0/admin/metrics", Access.ADMIN, t -> get("/api/v0/admin/metrics"), 200),
                new Route("GET /api/v0/admin/audit", Access.ADMIN, t -> get("/api/v0/admin/audit"), 200),
                new Route("POST /api/v0/admin/tasks/{taskId}/cancel", Access.ADMIN, t -> post("/api/v0/admin/tasks/" + t.task() + "/cancel",
                        Map.of("reason", "D19A admin route check")), 200),
                new Route("GET /internal/preview/versions", Access.INTERNAL, t -> get("/internal/preview/versions"), 200),
                new Route("ANY /error", Access.FRAMEWORK, t -> get("/error"), 0),
                new Route("ANY /error [text/html]", Access.FRAMEWORK, t -> get("/error"), 0),
                new Route("GET /api/v0/applications/{applicationId}", Access.OWNER, t -> get("/api/v0/applications/" + t.app()), 200),
                new Route("GET /api/v0/versions/{versionId}", Access.OWNER, t -> get("/api/v0/versions/" + t.version()), 200),
                new Route("GET /api/v0/applications/{applicationId}/versions", Access.OWNER,
                        t -> get("/api/v0/applications/" + t.app() + "/versions"), 200),
                new Route("GET /api/v0/versions/{versionId}/files", Access.OWNER, t -> get("/api/v0/versions/" + t.version() + "/files"), 200),
                new Route("GET /api/v0/versions/{versionId}/files/content", Access.OWNER,
                        t -> get("/api/v0/versions/" + t.version() + "/files/content?path=src/pages/HomePage.vue"), 200),
                new Route("GET /api/v0/versions/{versionId}/snapshot", Access.OWNER, t -> get("/api/v0/versions/" + t.version() + "/snapshot"), 200),
                new Route("GET /api/v0/versions/{versionId}/export", Access.OWNER, t -> get("/api/v0/versions/" + t.version() + "/export"), 200),
                new Route("GET /api/v0/versions/{versionId}/component-mapping", Access.OWNER,
                        t -> get("/api/v0/versions/" + t.version() + "/component-mapping"), 200),
                new Route("POST /api/v0/versions/{versionId}/component-selection", Access.OWNER,
                        t -> post("/api/v0/versions/" + t.version() + "/component-selection", selection(t.version(), t.sourceDigest())), 200),
                new Route("GET /api/v0/tasks/{taskId}", Access.OWNER, t -> get("/api/v0/tasks/" + t.task()), 200),
                new Route("GET /api/v0/tasks/{taskId}/events [application/json]", Access.OWNER, t -> get("/api/v0/tasks/" + t.task() + "/events"), 200),
                new Route("GET /api/v0/tasks/{taskId}/events [text/event-stream]", Access.OWNER,
                        t -> new Call("GET", "/api/v0/tasks/" + t.task() + "/events", null, null, "text/event-stream"), 200),
                new Route("GET /api/v0/tasks/{taskId}/diagnostics", Access.OWNER, t -> get("/api/v0/tasks/" + t.task() + "/diagnostics"), 200),
                new Route("GET /api/v0/tasks/{taskId}/edit", Access.OWNER, t -> get("/api/v0/tasks/" + t.editTask() + "/edit"), 200),
                new Route("GET /api/v0/publications/{publicationId}", Access.OWNER, t -> get("/api/v0/publications/" + t.publication()), 200),
                new Route("GET /api/v0/publications/{publicationId}/deployment", Access.OWNER,
                        t -> get("/api/v0/publications/" + t.publication() + "/deployment"), 200),
                new Route("GET /api/v0/applications/{applicationId}/publications", Access.OWNER,
                        t -> get("/api/v0/applications/" + t.app() + "/publications"), 200),
                new Route("POST /api/v0/applications/{applicationId}/versions/{versionId}/preview-credentials", Access.OWNER,
                        t -> post("/api/v0/applications/" + t.app() + "/versions/" + t.version() + "/preview-credentials", null), 200),
                // The attacker replays the owner's own idempotency key: it is scoped to the caller, so this is still a plain 404.
                new Route("POST /api/v0/publications", Access.OWNER, t -> new Call("POST", "/api/v0/publications",
                        json(Map.of("applicationId", t.app().toString(), "versionId", t.version().toString(),
                                "artifactDigest", t.artifactDigest())), t.publicationKey(), "application/json"), 202),
                new Route("PATCH /api/v0/applications/{applicationId}", Access.OWNER, t -> new Call("PATCH", "/api/v0/applications/" + t.app(),
                        json(Map.of("name", "D19A victim app")), null, "application/json"), 200),
                new Route("POST /api/v0/applications/{applicationId}/versions/{versionId}/restore", Access.OWNER,
                        t -> post("/api/v0/applications/" + t.app() + "/versions/" + t.version() + "/restore",
                                Map.of("expectedCurrentVersionId", t.version().toString())), 200),
                new Route("POST /api/v0/tasks/{taskId}/cancel", Access.OWNER, t -> post("/api/v0/tasks/" + t.task() + "/cancel", null), 200),
                new Route("POST /api/v0/tasks", Access.OWNER, t -> post("/api/v0/tasks",
                        Map.of("applicationId", t.app().toString(), "prompt", "D19A owner task")), 202),
                new Route("POST /api/v0/applications/{applicationId}/edits", Access.OWNER, t -> post("/api/v0/applications/" + t.app() + "/edits",
                        Map.of("baseVersionId", t.version().toString(), "prompt", "D19A owner edit", "source", Map.of("type", "CHAT"))), 202),
                new Route("POST /api/v0/applications/{applicationId}/component-edits", Access.OWNER,
                        t -> post("/api/v0/applications/" + t.app() + "/component-edits", Map.of("baseVersionId", t.version().toString(),
                                "prompt", "D19A owner component edit", "selection", selection(t.version(), t.sourceDigest()))), 202));
    }

    @Test @Order(0)
    void everyRegisteredRouteIsClassifiedInTheSecurityMatrix() throws Exception {
        var live = new TreeSet<String>();
        mappings.getHandlerMethods().forEach((info, handler) -> {
            var methods = info.getMethodsCondition().getMethods();
            var produces = info.getProducesCondition().getProducibleMediaTypes();
            for (String pattern : info.getPatternValues())
                for (String method : methods.isEmpty() ? List.of("ANY") : methods.stream().map(Enum::name).sorted().toList())
                    live.add(method + " " + pattern + (produces.isEmpty() ? "" : " " + produces.stream().map(MediaType::toString).sorted().toList()));
        });
        var classified = new TreeSet<String>();
        routes().forEach(route -> classified.add(route.key()));
        evidence("D19-A-route-inventory.json", Map.of("case", "D19-A route inventory", "registered", live,
                "unclassified", difference(live, classified), "stale", difference(classified, live)));
        assertThat(difference(live, classified)).as("new routes must be added to the D19-A security matrix").isEmpty();
        assertThat(difference(classified, live)).as("matrix entries without a registered route").isEmpty();
    }

    @Test @Order(1)
    void d19aT1EveryPrivateResourceRejectsAnotherUser() throws Exception {
        var before = fingerprint();
        List<Map<String, Object>> rows = new ArrayList<>();
        List<String> violations = new ArrayList<>();
        Set<String> private_ = Set.of("victim-only-marker", "D19A victim app", victimAccount.email(), owned.sourceDigest(),
                owned.artifactDigest(), owned.publication().toString(), owned.editTask().toString());
        for (Route route : routes()) {
            if (route.access() != Access.OWNER) continue;
            Res foreign = call(attacker, route.call().on(owned));
            Res absent = call(attacker, route.call().on(missing));
            boolean same = foreign.status() == absent.status() && code(foreign).equals(code(absent))
                    && message(foreign).equals(message(absent));
            String leaked = private_.stream().filter(value -> foreign.body().contains(value)
                    && !route.call().on(owned).path().contains(value)).findFirst().orElse(null);
            if (foreign.status() != 404 || !"NOT_FOUND".equals(code(foreign)) || !same || leaked != null)
                violations.add(route.key() + " foreign=" + foreign.status() + "/" + code(foreign) + " missing=" + absent.status()
                        + "/" + code(absent) + (leaked == null ? "" : " leaked private value"));
            rows.add(row("route", route.key(), "foreignStatus", foreign.status(), "foreignCode", code(foreign),
                    "randomIdStatus", absent.status(), "randomIdCode", code(absent), "identicalToRandomId", same, "privateValueLeaked", leaked != null));
        }
        // Own container + foreign child: the foreign child is indistinguishable from a random one and never accepted.
        List<Map<String, Object>> crossObject = new ArrayList<>();
        for (Calls cross : List.<Calls>of(
                t -> post("/api/v0/applications/" + attackerApp + "/edits", Map.of("baseVersionId", t.version().toString(),
                        "prompt", "cross-object edit", "source", Map.of("type", "CHAT"))),
                t -> post("/api/v0/applications/" + attackerApp + "/component-edits", Map.of("baseVersionId", t.version().toString(),
                        "prompt", "cross-object component edit", "selection", selection(t.version(), t.sourceDigest()))),
                t -> post("/api/v0/applications/" + attackerApp + "/versions/" + t.version() + "/restore",
                        Map.of("expectedCurrentVersionId", attackerVersion.id().toString())),
                t -> post("/api/v0/applications/" + attackerApp + "/versions/" + t.version() + "/preview-credentials", null),
                t -> new Call("POST", "/api/v0/publications", json(Map.of("applicationId", attackerApp.toString(),
                        "versionId", t.version().toString(), "artifactDigest", t.artifactDigest())), "d19a-attacker-cross-0001", "application/json"),
                t -> post("/api/v0/versions/" + attackerVersion.id() + "/component-selection", selection(t.version(), t.sourceDigest())))) {
            Call foreignCall = cross.on(owned), randomCall = cross.on(missing);
            Res foreign = call(attacker, foreignCall), random = call(attacker, randomCall);
            boolean same = foreign.status() == random.status() && code(foreign).equals(code(random))
                    && strip(foreign.body(), owned).equals(strip(random.body(), missing));
            if (foreign.status() / 100 == 2 && !foreign.body().contains("\"selectable\":false") || !same)
                violations.add("cross-object " + foreignCall.method() + " " + template(foreignCall.path()) + " foreign=" + foreign.status()
                        + "/" + code(foreign) + " random=" + random.status() + "/" + code(random));
            crossObject.add(row("request", foreignCall.method() + " " + template(foreignCall.path()), "foreignChildStatus", foreign.status(),
                    "foreignChildCode", code(foreign), "randomChildStatus", random.status(), "identicalToRandomChild", same));
        }
        // Self-scoped and role-scoped routes: lists never contain the owner's data; admin routes are 403 for ordinary users.
        Res list = call(attacker, get("/api/v0/applications?size=100"));
        if (list.status() != 200 || list.body().contains(owned.app().toString())) violations.add("application list shows a foreign app");
        List<Map<String, Object>> roleRows = new ArrayList<>();
        for (Route route : routes()) {
            if (route.access() != Access.ADMIN && route.access() != Access.INTERNAL) continue;
            Call call = route.call().on(owned);
            Res ordinary = call(attacker, call);
            if (ordinary.status() != 403) violations.add(route.key() + " ordinary user got " + ordinary.status());
            roleRows.add(row("route", route.key(), "ordinaryUser", ordinary.status(), "code", code(ordinary)));
        }
        Res forgedKey = send(attacker, "GET", "/internal/preview/versions", null, null, null, Map.of("X-Codeless-Preview-Registry-Key",
                SecurityFixtures.hex(32)), "application/json");
        if (forgedKey.status() != 403) violations.add("internal registry accepted a forged key");
        var after = fingerprint();
        boolean unchanged = after.equals(before);
        if (!unchanged) violations.add("rejected requests changed state: " + changed(before, after));

        // Positive controls: the owner's identical requests succeed, so every 404 above is an authorization decision.
        List<Map<String, Object>> controls = new ArrayList<>();
        for (Route route : routes()) {
            if (route.access() != Access.OWNER) continue;
            Res own = call(victim, route.call().on(owned));
            if (own.status() != route.ownerStatus()) violations.add(route.key() + " owner control " + own.status() + " " + code(own));
            controls.add(row("route", route.key(), "ownerStatus", own.status()));
            if (route.key().contains("preview-credentials") && own.status() == 200) {
                String url = tree(own).path("url").asText();
                secret("issued preview credential", url.substring(url.indexOf("credential=") + "credential=".length()));
            }
            if (own.status() == 202 && !route.key().equals("POST /api/v0/publications")) cancel(own);
        }
        Res trusted = send(null, "GET", "/internal/preview/versions", null, null, null,
                Map.of("X-Codeless-Preview-Registry-Key", REGISTRY_KEY), "application/json");
        controls.add(row("route", "GET /internal/preview/versions (loopback + registry key)", "status", trusted.status()));
        if (trusted.status() != 200) violations.add("trusted registry control " + trusted.status());
        evidence("D19-A-T1.json", Map.of("case", "D19-A-T1 cross-user access to every private resource", "ownerRoutes", rows,
                "crossObject", crossObject, "roleScoped", roleRows, "stateUnchangedByRejectedRequests", unchanged,
                "ownerControls", controls, "violations", violations));
        assertThat(violations).isEmpty();
    }

    @Test @Order(2)
    void d19aT2WritesCannotBypassCsrf() throws Exception {
        var before = fingerprint();
        List<String> violations = new ArrayList<>();
        List<Map<String, Object>> tokens = new ArrayList<>();
        List<Map<String, Object>> spellings = new ArrayList<>();
        for (Route route : routes()) {
            Call call = route.call().on(owned);
            if (call.method().equals("GET") || route.access() == Access.FRAMEWORK) continue;
            Session session = route.access() == Access.ADMIN ? admin : route.access() == Access.PUBLIC ? anonymous() : victim;
            Map<String, String> bad = new LinkedHashMap<>();
            bad.put("missing", null);
            bad.put("other session's valid token", attacker.csrf());
            bad.put("upper-cased own token", session.csrf().toUpperCase(Locale.ROOT));
            bad.put("empty", "");
            bad.put("own token truncated", session.csrf().substring(0, 63));
            for (var attempt : bad.entrySet()) {
                Res res = send(session, call.method(), call.path(), call.body(), attempt.getValue(), call.key(), null, call.accept());
                if (res.status() != 403 || !"CSRF_INVALID".equals(code(res)))
                    violations.add(route.key() + " token " + attempt.getKey() + " -> " + res.status() + "/" + code(res));
                tokens.add(row("route", route.key(), "token", attempt.getKey(), "status", res.status(), "code", code(res)));
            }
            String query = (call.path().contains("?") ? "&" : "?") + "X-CSRF-Token=" + session.csrf() + "&_csrf=" + session.csrf();
            Res inQuery = send(session, call.method(), call.path() + query, call.body(), null, call.key(), null, call.accept());
            if (inQuery.status() != 403) violations.add(route.key() + " token in query -> " + inQuery.status());
            tokens.add(row("route", route.key(), "token", "own token in query string only", "status", inQuery.status(), "code", code(inQuery)));
            // Non-canonical spellings of the same route, no token. The production nginx matches /api/v0/ on the decoded,
            // normalized URI but forwards the raw request target, so each of these reaches the API as written.
            for (String spelled : spellings(call.path())) {
                Session target = call.path().equals("/api/v0/auth/logout") ? login(victimAccount.email(), victimAccount.password()) : session;
                String body = call.path().equals("/api/v0/auth/login")
                        ? json(Map.of("email", attackerAccount.email(), "password", attackerAccount.password())) : call.body();
                Map<String, String> headers = new LinkedHashMap<>();
                headers.put("Cookie", target.cookie());
                if (call.key() != null) headers.put("Idempotency-Key", call.key());
                var res = SecurityFixtures.raw(port, call.method(), spelled, headers, body);
                boolean sessionAlive = !call.path().equals("/api/v0/auth/logout") || send(target, "GET", "/api/v0/auth/me", null, null, null, null).status() == 200;
                if (!REFUSED.contains(res.status()) || !sessionAlive)
                    violations.add(call.method() + " " + spelled + " without CSRF -> " + res.status() + (sessionAlive ? "" : " (victim logged out)"));
                spellings.add(row("request", call.method() + " " + template(spelled), "status", res.status(), "sessionStillValid", sessionAlive));
            }
        }
        // Authenticated GET routes through the same spellings must never run outside the filter (no 2xx, no 5xx).
        for (Route route : routes()) {
            Call call = route.call().on(owned);
            if (!call.method().equals("GET") || route.access() == Access.PUBLIC || route.access() == Access.FRAMEWORK
                    || call.accept().equals("text/event-stream")) continue;
            for (String spelled : spellings(call.path())) {
                var res = SecurityFixtures.raw(port, "GET", spelled, Map.of("Cookie", victim.cookie()), null);
                if (!REFUSED.contains(res.status())) violations.add("GET " + spelled + " -> " + res.status());
                spellings.add(row("request", "GET " + template(spelled), "status", res.status()));
            }
        }
        // A session id in the URL is not a credential (only the cookie is), and undecodable targets are refused.
        String sessionId = victim.cookie().substring(victim.cookie().indexOf('=') + 1);
        var urlSession = SecurityFixtures.raw(port, "GET", "/api/v0/auth/me;jsessionid=" + sessionId, Map.of(), null);
        if (urlSession.status() == 200) violations.add("a session id in the URL authenticated the request");
        spellings.add(row("request", "GET /api/v0/auth/me;jsessionid={victim session} without cookie", "status", urlSession.status()));
        for (String undecodable : List.of("/api/v0/%zz/me", "/%zzpi/v0/auth/me", "/api/v0/auth/me%")) {
            var res = SecurityFixtures.raw(port, "GET", undecodable, Map.of("Cookie", victim.cookie()), null);
            if (!REFUSED.contains(res.status())) violations.add("GET " + undecodable + " -> " + res.status());
            spellings.add(row("request", "GET " + undecodable, "status", res.status()));
        }
        // No CORS grant: a foreign origin can neither read a CSRF token nor preflight a token-carrying write.
        Res corsToken = send(null, "GET", "/api/v0/auth/csrf", null, null, null, Map.of("Origin", "https://attacker.example"), "application/json");
        Res preflight = send(null, "OPTIONS", "/api/v0/tasks", null, null, null, Map.of("Origin", "https://attacker.example",
                "Access-Control-Request-Method", "POST", "Access-Control-Request-Headers", "content-type,x-csrf-token"), null);
        boolean noCors = corsToken.headers().firstValue("access-control-allow-origin").isEmpty()
                && preflight.headers().firstValue("access-control-allow-origin").isEmpty()
                && preflight.headers().firstValue("access-control-allow-credentials").isEmpty();
        if (!noCors) violations.add("CORS grants a foreign origin");
        // Safe methods never reach a write handler.
        Res head = send(victim, "HEAD", "/api/v0/tasks/" + owned.task() + "/cancel", null, null, null, null);
        Res getCancel = send(victim, "GET", "/api/v0/tasks/" + owned.task() + "/cancel", null, null, null, null);
        Res override = send(victim, "POST", "/api/v0/auth/me", null, null, null, Map.of("X-HTTP-Method-Override", "GET"), "application/json");
        if (head.status() / 100 == 2 || getCancel.status() / 100 == 2 || override.status() != 403)
            violations.add("method tricks: HEAD " + head.status() + " GET " + getCancel.status() + " override " + override.status());
        var after = fingerprint();
        boolean unchanged = after.equals(before);
        if (!unchanged) violations.add("requests without a valid token changed state: " + changed(before, after));
        if (send(victim, "GET", "/api/v0/auth/me", null, null, null, null).status() != 200) violations.add("victim session was ended");
        evidence("D19-A-T2.json", Map.of("case", "D19-A-T2 writes cannot bypass CSRF", "tokenVariants", tokens, "pathSpellings", spellings,
                "foreignOriginGetsNoCorsGrant", noCors, "safeMethodTricks", Map.of("HEAD cancel", head.status(), "GET cancel", getCancel.status(),
                        "POST with X-HTTP-Method-Override", override.status()), "stateUnchanged", unchanged, "violations", violations));
        assertThat(violations).isEmpty();
    }

    @Test @Order(3)
    void d19aLoginLimitHoldsForSpellingsAndConcurrentGuesses() throws Exception {
        List<String> violations = new ArrayList<>();
        Account sequential = account("limit-seq");
        List<Integer> failures = new ArrayList<>();
        String[] spellings = {sequential.email(), sequential.email().toUpperCase(Locale.ROOT), "  " + sequential.email() + " ",
                "\t" + sequential.email(), sequential.email()};
        for (String spelled : spellings) failures.add(tryLogin(spelled, secret("guess", "wrong-" + SecurityFixtures.hex(6))).status());
        Res locked = tryLogin(sequential.email(), sequential.password());
        Res lockedSpelling = tryLogin(" " + sequential.email().toUpperCase(Locale.ROOT), sequential.password());
        if (!failures.stream().allMatch(s -> s == 401) || locked.status() != 429 || !"LOGIN_RATE_LIMITED".equals(code(locked))
                || lockedSpelling.status() != 429) violations.add("sequential limit: " + failures + " then " + locked.status() + "/" + lockedSpelling.status());

        Account concurrent = account("limit-par");
        List<Integer> known = race(concurrent.email(), 24);
        long knownEvaluated = known.stream().filter(s -> s == 401).count();
        Res knownAfter = tryLogin(concurrent.email(), concurrent.password());
        List<Integer> unknown = race("nobody-" + SecurityFixtures.hex(4) + "@d19a.test", 24);
        long unknownEvaluated = unknown.stream().filter(s -> s == 401).count();
        if (knownEvaluated > 5 || known.stream().anyMatch(s -> s != 401 && s != 429) || knownAfter.status() != 429)
            violations.add("known account: " + knownEvaluated + " of 24 parallel guesses were checked, then " + knownAfter.status());
        if (unknownEvaluated > 5 || unknown.stream().anyMatch(s -> s != 401 && s != 429))
            violations.add("unknown email: " + unknownEvaluated + " of 24 parallel guesses were checked");

        // Another account is unaffected; login rotates the session id and the pre-login cookie stays anonymous.
        Session before = anonymous();
        Res ok = send(before, "POST", "/api/v0/auth/login", json(Map.of("email", victimAccount.email(), "password", victimAccount.password())),
                before.csrf(), null, null);
        String rotated = ok.headers().firstValue("set-cookie").map(c -> c.split(";", 2)[0]).orElse("");
        secret("rotated session cookie", rotated);
        boolean fixed = ok.status() == 200 && !rotated.isEmpty() && !rotated.equals(before.cookie())
                && send(before, "GET", "/api/v0/auth/me", null, null, null, null).status() == 401;
        if (!fixed) violations.add("login did not rotate the session id (status " + ok.status() + ")");
        evidence("D19-A-02-login-limit.json", Map.of("case", "D19-A-02 login rate limit", "sequentialSpellingsStatuses", failures,
                "correctPasswordAfterFiveFailures", locked.status(), "spellingAfterLock", lockedSpelling.status(),
                "parallelKnownAccount", Map.of("attempts", 24, "passwordChecks", knownEvaluated, "limited", known.stream().filter(s -> s == 429).count(),
                        "correctPasswordAfterwards", knownAfter.status()),
                "parallelUnknownEmail", Map.of("attempts", 24, "passwordChecks", unknownEvaluated, "limited", unknown.stream().filter(s -> s == 429).count()),
                "otherAccountUnaffectedAndSessionRotated", fixed, "violations", violations));
        assertThat(violations).isEmpty();
    }

    @Test @Order(4)
    void d19aFieldLengthsAndIdempotencyKeysAreEnforced() throws Exception {
        List<String> violations = new ArrayList<>();
        List<Map<String, Object>> lengths = new ArrayList<>();
        UUID app = UUID.fromString(tree(expect(violations, lengths, "application name 120 code points (astral)", 201,
                post("/api/v0/applications", Map.of("name", "😀".repeat(120), "dataMode", "MOCK")))).path("id").asText());
        expect(violations, lengths, "application name 121 code points", 400, post("/api/v0/applications", Map.of("name", "a".repeat(121), "dataMode", "MOCK")));
        expect(violations, lengths, "application name whitespace only", 400, post("/api/v0/applications", Map.of("name", " \t ", "dataMode", "MOCK")));
        expect(violations, lengths, "application description 1000", 201,
                post("/api/v0/applications", Map.of("name", "d19a desc", "description", "d".repeat(1000), "dataMode", "MOCK")));
        expect(violations, lengths, "application description 1001", 400,
                post("/api/v0/applications", Map.of("name", "d19a desc", "description", "d".repeat(1001), "dataMode", "MOCK")));
        expect(violations, lengths, "application name with NUL", 400, post("/api/v0/applications", Map.of("name", "nul\u0000name", "dataMode", "MOCK")));
        expect(violations, lengths, "rename to 121 code points", 400,
                new Call("PATCH", "/api/v0/applications/" + app, json(Map.of("name", "b".repeat(121))), null, "application/json"));
        Res max = expect(violations, lengths, "task prompt 8000 code points", 202,
                post("/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "p".repeat(8000))));
        cancel(max);
        expect(violations, lengths, "task prompt 8001 code points", 400, post("/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "p".repeat(8001))));
        expect(violations, lengths, "task prompt with NUL", 400, post("/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "nul\u0000prompt")));
        expect(violations, lengths, "edit prompt 8001 code points", 400, post("/api/v0/applications/" + owned.app() + "/edits",
                Map.of("baseVersionId", owned.version().toString(), "prompt", "e".repeat(8001), "source", Map.of("type", "CHAT"))));
        expect(violations, lengths, "edit messageId 129", 400, post("/api/v0/applications/" + owned.app() + "/edits",
                Map.of("baseVersionId", owned.version().toString(), "prompt", "e", "source", Map.of("type", "CHAT", "messageId", "m".repeat(129)))));
        expect(violations, lengths, "component edit prompt 8001", 400, post("/api/v0/applications/" + owned.app() + "/component-edits",
                Map.of("baseVersionId", owned.version().toString(), "prompt", "c".repeat(8001), "selection", selection(owned.version(), owned.sourceDigest()))));
        Res reason = call(admin, post("/api/v0/admin/tasks/" + owned.task() + "/cancel", Map.of("reason", "r".repeat(201))));
        lengths.add(row("case", "admin cancel reason 201 code points", "status", reason.status(), "code", code(reason)));
        if (reason.status() != 400) violations.add("admin reason 201 -> " + reason.status());
        expect(violations, lengths, "JSON nested 2000 deep", 400, new Call("POST", "/api/v0/tasks",
                "{\"applicationId\":" + "[".repeat(2000) + "]".repeat(2000) + ",\"prompt\":\"x\"}", null, "application/json"));
        Session anonymous = anonymous();
        Res email = send(anonymous, "POST", "/api/v0/auth/login", json(Map.of("email", "e".repeat(308) + "@d19a.test.xx", "password", "x")),
                anonymous.csrf(), null, null);
        Res password = send(anonymous, "POST", "/api/v0/auth/login", json(Map.of("email", "x@d19a.test", "password", "p".repeat(1025))),
                anonymous.csrf(), null, null);
        lengths.add(row("case", "login email 321 / password 1025", "status", List.of(email.status(), password.status())));
        if (email.status() != 400 || password.status() != 400) violations.add("login lengths " + email.status() + "/" + password.status());
        Res plain = send(victim, "POST", "/api/v0/tasks", "applicationId=" + app, victim.csrf(), null, Map.of("Content-Type", "text/plain"));
        Res png = send(victim, "GET", "/api/v0/applications/" + app, null, null, null, Map.of("Accept", "image/png"), null);
        lengths.add(row("case", "text/plain body / Accept: image/png", "status", List.of(plain.status(), png.status())));
        if (plain.status() / 100 != 4 || png.status() / 100 != 4) violations.add("media types -> " + plain.status() + "/" + png.status());
        long large = System.nanoTime();
        Res oversized = send(anonymous, "POST", "/api/v0/auth/login", "{\"email\":\"x@d19a.test\",\"password\":\"" + "p".repeat(3 * 1024 * 1024) + "\"}",
                anonymous.csrf(), null, null);
        lengths.add(row("case", "login body of 3 MiB", "status", oversized.status(), "code", code(oversized),
                "elapsedMs", (System.nanoTime() - large) / 1_000_000));
        if (oversized.status() != 400) violations.add("3 MiB login body -> " + oversized.status());

        // Idempotency keys: replay, conflict, per-caller scope, cross-endpoint reuse, concurrency, format.
        List<Map<String, Object>> keys = new ArrayList<>();
        String key = "d19a-task-" + SecurityFixtures.hex(6);
        Res first = expect(violations, keys, "task key first use", 202, keyed(post("/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "same")), key));
        UUID task = UUID.fromString(tree(first).path("id").asText());
        Res replay = expect(violations, keys, "task key replay, same body", 202, keyed(post("/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "same")), key));
        if (!tree(replay).path("id").asText().equals(task.toString())) violations.add("replay created another task");
        expect(violations, keys, "task key reused with another prompt", 409, keyed(post("/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "other")), key));
        expect(violations, keys, "task key reused on the edit endpoint", 409, keyed(post("/api/v0/applications/" + app + "/edits",
                Map.of("baseVersionId", owned.version().toString(), "prompt", "same", "source", Map.of("type", "CHAT"))), key));
        Res foreignApp = call(attacker, keyed(post("/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "same")), key));
        Res randomApp = call(attacker, keyed(post("/api/v0/tasks", Map.of("applicationId", UUID.randomUUID().toString(), "prompt", "same")), key));
        keys.add(row("case", "attacker replays the key on the owner's app", "status", foreignApp.status(), "randomAppStatus", randomApp.status()));
        if (foreignApp.status() != 404 || randomApp.status() != 404 || foreignApp.body().contains(task.toString())) violations.add("key replay on a foreign app");
        Res own = call(attacker, keyed(post("/api/v0/tasks", Map.of("applicationId", attackerApp.toString(), "prompt", "same")), key));
        keys.add(row("case", "attacker uses the same key on an own app", "status", own.status(), "distinctTask", !own.body().contains(task.toString())));
        if (own.status() != 202 || own.body().contains(task.toString())) violations.add("same key on another owner's app was not independent");
        cancel(attacker, own);
        String raced = "d19a-race-" + SecurityFixtures.hex(6);
        UUID raceApp = UUID.fromString(tree(call(victim, post("/api/v0/applications", Map.of("name", "d19a race", "dataMode", "MOCK")))).path("id").asText());
        List<String> ids = parallel(8, () -> tree(call(victim, keyed(post("/api/v0/tasks", Map.of("applicationId", raceApp.toString(), "prompt", "race")), raced))).path("id").asText());
        long rows = jdbc.queryForObject("SELECT count(*) FROM generation_tasks WHERE application_id = ? AND idempotency_key = ?", Long.class, raceApp, raced);
        keys.add(row("case", "8 concurrent requests with one key", "distinctIds", new TreeSet<>(ids).size(), "rows", rows));
        if (new TreeSet<>(ids).size() != 1 || rows != 1) violations.add("concurrent key use created " + rows + " tasks");
        cancel(UUID.fromString(ids.getFirst()));
        cancel(task);
        for (String bad : List.of("k".repeat(129), "has space", "key*star", "a,b", "../../etc"))
            expect(violations, keys, "task key " + (bad.length() > 20 ? bad.length() + " chars" : bad), 400,
                    keyed(post("/api/v0/tasks", Map.of("applicationId", app.toString(), "prompt", "k")), bad));
        Call republish = new Call("POST", "/api/v0/publications", json(Map.of("applicationId", owned.app().toString(), "versionId", owned.version().toString(),
                "artifactDigest", owned.artifactDigest())), owned.publicationKey(), "application/json");
        Res again = expect(violations, keys, "publication key replay", 202, republish);
        if (!tree(again).path("id").asText().equals(owned.publication().toString())) violations.add("publication replay is a new publication");
        expect(violations, keys, "publication key reused for another application", 409, new Call("POST", "/api/v0/publications",
                json(Map.of("applicationId", app.toString(), "versionId", owned.version().toString(), "artifactDigest", owned.artifactDigest())),
                owned.publicationKey(), "application/json"));
        Res attackerSameKey = call(attacker, new Call("POST", "/api/v0/publications", json(Map.of("applicationId", attackerApp.toString(),
                "versionId", attackerVersion.id().toString(), "artifactDigest", attackerVersion.artifactDigest())), owned.publicationKey(), "application/json"));
        keys.add(row("case", "attacker publishes an own version with the owner's key", "status", attackerSameKey.status(),
                "distinctPublication", !attackerSameKey.body().contains(owned.publication().toString())));
        if (attackerSameKey.status() != 202 || attackerSameKey.body().contains(owned.publication().toString())) violations.add("publication keys are not per caller");
        for (String bad : List.of("short-key-15chr", "k".repeat(129), "dots.not.allowed.here"))
            expect(violations, keys, "publication key " + (bad.length() > 30 ? bad.length() + " chars" : bad), 400, new Call("POST", "/api/v0/publications",
                    republish.body(), bad, "application/json"));
        expect(violations, keys, "publication without key", 400, new Call("POST", "/api/v0/publications", republish.body(), null, "application/json"));
        evidence("D19-A-02-fields-idempotency.json", Map.of("case", "D19-A-02 field lengths and idempotency keys", "fieldLengths", lengths,
                "idempotencyKeys", keys, "violations", violations));
        assertThat(violations).isEmpty();
    }

    @Test @Order(5)
    void d19aT4IllegalInputCreatesNoExecutableFileOrDeployment() throws Exception {
        UUID draft = draftVersion(owned.app());
        var before = fingerprint();
        List<String> violations = new ArrayList<>();
        List<Map<String, Object>> rows = new ArrayList<>();
        Map<String, Object> valid = new LinkedHashMap<>(Map.of("applicationId", owned.app().toString(), "versionId", owned.version().toString(),
                "artifactDigest", owned.artifactDigest()));
        Map<String, Call> publications = new LinkedHashMap<>();
        publications.put("draft version", publish(Map.of("applicationId", owned.app().toString(), "versionId", draft.toString(),
                "artifactDigest", owned.artifactDigest())));
        publications.put("foreign version in own application", publish(Map.of("applicationId", owned.app().toString(),
                "versionId", attackerVersion.id().toString(), "artifactDigest", attackerVersion.artifactDigest())));
        publications.put("unknown artifact digest", publish(with(valid, "artifactDigest", "sha256:" + "0".repeat(64))));
        publications.put("source digest as artifact digest", publish(with(valid, "artifactDigest", owned.sourceDigest())));
        publications.put("upper-case digest", publish(with(valid, "artifactDigest", owned.artifactDigest().toUpperCase(Locale.ROOT))));
        publications.put("client supplied url", publish(with(valid, "url", "https://attacker.example/")));
        publications.put("client supplied files", publish(with(valid, "files", List.of(Map.of("path", "../../hosting/evil.sh", "content", "rm -rf /")))));
        publications.put("client supplied hosting path", publish(with(valid, "path", "../../../../tmp/evil")));
        publications.put("non-canonical application id", publish(with(valid, "applicationId", "1-1-1-1-1")));
        publications.put("path traversal as version id", publish(with(valid, "versionId", "../../" + owned.version())));
        publications.put("array body", new Call("POST", "/api/v0/publications", "[" + json(valid) + "]", fresh(), "application/json"));
        publications.put("null body", new Call("POST", "/api/v0/publications", "null", fresh(), "application/json"));
        for (var attempt : publications.entrySet()) {
            Res res = call(victim, attempt.getValue());
            if (res.status() / 100 != 4) violations.add("publish " + attempt.getKey() + " -> " + res.status());
            rows.add(row("input", "publication: " + attempt.getKey(), "status", res.status(), "code", code(res)));
        }
        Map<String, Call> generation = new LinkedHashMap<>();
        generation.put("task with client files", post("/api/v0/tasks", Map.of("applicationId", owned.app().toString(), "prompt", "x",
                "files", Map.of("../../workspaces/evil.sh", "#!/bin/sh\nrm -rf /"))));
        generation.put("task with workspace path", post("/api/v0/tasks", Map.of("applicationId", owned.app().toString(), "prompt", "x", "workspace", "../../")));
        generation.put("task prompt as object", new Call("POST", "/api/v0/tasks", "{\"applicationId\":\"" + owned.app() + "\",\"prompt\":{\"path\":\"/etc/passwd\"}}", null, "application/json"));
        generation.put("application with React template", post("/api/v0/applications", Map.of("name", "x", "dataMode", "MOCK", "template", "REACT")));
        generation.put("application with template path", post("/api/v0/applications", Map.of("name", "x", "dataMode", "MOCK", "template", "../vue")));
        generation.put("application with server data mode", post("/api/v0/applications", Map.of("name", "x", "dataMode", "SERVER")));
        generation.put("edit with file source", post("/api/v0/applications/" + owned.app() + "/edits", Map.of("baseVersionId", owned.version().toString(),
                "prompt", "x", "source", Map.of("type", "FILE", "path", "src/../../../etc/passwd"))));
        generation.put("edit with extra path", post("/api/v0/applications/" + owned.app() + "/edits", Map.of("baseVersionId", owned.version().toString(),
                "prompt", "x", "source", Map.of("type", "CHAT"), "path", "src/pages/../../evil.sh")));
        generation.put("component edit with traversal component id", post("/api/v0/applications/" + owned.app() + "/component-edits",
                Map.of("baseVersionId", owned.version().toString(), "prompt", "x", "selection", Map.of("versionId", owned.version().toString(),
                        "sourceDigest", owned.sourceDigest(), "componentId", "../../evil"))));
        generation.put("component edit with client source file", post("/api/v0/applications/" + owned.app() + "/component-edits",
                Map.of("baseVersionId", owned.version().toString(), "prompt", "x", "selection", Map.of("versionId", owned.version().toString(),
                        "sourceDigest", owned.sourceDigest(), "componentId", "home-page", "sourceFile", "../../evil.sh"))));
        generation.put("component edit against a draft base", post("/api/v0/applications/" + owned.app() + "/component-edits",
                Map.of("baseVersionId", draft.toString(), "prompt", "x", "selection", selection(draft, owned.sourceDigest()))));
        generation.put("restore a draft", post("/api/v0/applications/" + owned.app() + "/versions/" + draft + "/restore",
                Map.of("expectedCurrentVersionId", owned.version().toString())));
        generation.put("preview credential for a draft", post("/api/v0/applications/" + owned.app() + "/versions/" + draft + "/preview-credentials", null));
        for (var attempt : generation.entrySet()) {
            Res res = call(victim, attempt.getValue());
            if (res.status() / 100 != 4) violations.add(attempt.getKey() + " -> " + res.status());
            rows.add(row("input", attempt.getKey(), "status", res.status(), "code", code(res)));
        }
        // The source reader takes only exact frozen-manifest members; nothing else on disk is reachable.
        List<String> paths = List.of("../source-manifest.json", "src/pages/../../outcome/report.json", "/etc/passwd",
                "C:\\Windows\\win.ini", "C:/Windows/win.ini", "\\\\127.0.0.1\\c$\\boot.ini", "src\\pages\\HomePage.vue",
                "src/pages/HomePage.vue/../../../outcome/report.json", "src/pages/CON.vue", "src/pages/HomePage.vue::$DATA",
                "src/pages/HOMEPAGE.vue", "SRC/pages/HomePage.vue", "src/pages/HomePage.vue ", "src/pages/HomePage.vue\u0000.sh",
                "src/pages/Missing.vue", "src/data/../../../../../../etc/hosts", "%2e%2e/source-manifest.json");
        for (String path : paths) {
            Res res = call(victim, get("/api/v0/versions/" + owned.version() + "/files/content?path=" + encode(path)));
            if (!Set.of(400, 404).contains(res.status()) || res.body().contains("victim-only-marker") || res.body().contains("\"content\""))
                violations.add("source read " + path + " -> " + res.status());
            rows.add(row("input", "source read path " + path.replace("\u0000", "\\u0000"), "status", res.status(), "code", code(res)));
        }
        // Client host and forwarding headers never shape the credential URL; it comes from configuration only.
        Map<String, String> forged = new LinkedHashMap<>();
        forged.put("Host", "evil.example");
        forged.put("Cookie", victim.cookie());
        forged.put("X-CSRF-Token", victim.csrf());
        forged.put("X-Forwarded-Host", "evil.example");
        forged.put("X-Forwarded-Proto", "http");
        forged.put("X-Forwarded-Prefix", "/../../evil");
        forged.put("Forwarded", "host=evil.example;proto=http");
        forged.put("X-Original-URL", "/api/v0/admin/users");
        forged.put("X-Rewrite-URL", "/api/v0/admin/users");
        var credential = SecurityFixtures.raw(port, "POST", "/api/v0/applications/" + owned.app() + "/versions/" + owned.version()
                + "/preview-credentials", forged, null);
        String issued = credential.status() == 200 ? mapper.readTree(credential.body()).path("url").asText() : "";
        if (issued.contains("credential=")) secret("issued preview credential", issued.substring(issued.indexOf("credential=") + "credential=".length()));
        boolean configured = credential.status() == 200 && issued.startsWith("https://v" + owned.version().toString().replace("-", "")
                + ".preview.codeless-preview.test/__preview/start?credential=") && !credential.body().contains("evil");
        if (!configured) violations.add("forged host headers -> " + credential.status() + " url from configuration " + configured);
        rows.add(row("input", "preview credential with forged Host, X-Forwarded-*, Forwarded, X-Original-URL", "status", credential.status(),
                "urlFromConfigurationOnly", configured));
        Res noPath = call(victim, get("/api/v0/versions/" + owned.version() + "/files/content"));
        rows.add(row("input", "source read without path", "status", noPath.status(), "code", code(noPath)));
        if (noPath.status() / 100 != 4) violations.add("source read without path -> " + noPath.status());
        var after = fingerprint();
        boolean unchanged = after.equals(before);
        if (!unchanged) violations.add("illegal input changed state: " + changed(before, after));
        List<String> executables = new ArrayList<>();
        for (String file : SecurityFixtures.tree(ROOT).keySet())
            if (file.matches("(?i).*\\.(sh|bash|bat|cmd|ps1|exe|dll|so|jar|py|pl|rb|php)$") || file.contains("evil")) executables.add(file);
        if (!executables.isEmpty()) violations.add("executable-looking files exist: " + executables);
        evidence("D19-A-T4.json", Map.of("case", "D19-A-T4 illegal input creates no executable file or deployment record", "attempts", rows,
                "publicationsAndLedgerUnchanged", unchanged, "executableFilesUnderRoots", executables, "violations", violations));
        assertThat(violations).isEmpty();
    }

    @Test @Order(9)
    void d19aT3LogsCarryNoSecretOrPassword() throws Exception {
        // Traffic of its own, so the scan is meaningful when this case runs alone.
        String guessed = secret("wrong password", "d19a-wrong-password-" + SecurityFixtures.hex(8));
        tryLogin(victimAccount.email(), guessed);
        Session anonymous = anonymous();
        send(anonymous, "POST", "/api/v0/auth/login", "{\"email\":\"" + victimAccount.email() + "\",\"password\":\"" + guessed,
                anonymous.csrf(), null, null);
        String bearer = secret("bearer token", "d19a-bearer-" + SecurityFixtures.hex(16));
        String apiKey = secret("api key header", "sk-d19a" + SecurityFixtures.hex(16));
        String queryToken = secret("query token", "d19a-query-" + SecurityFixtures.hex(16));
        for (String path : List.of("/api/v0/tasks/" + owned.task() + "?token=" + queryToken, "/api/v0/versions/not-a-uuid/files?token=" + queryToken,
                "/api/v0/versions/" + owned.version() + "/files/content?path=../" + queryToken, "/api/v0/admin/users?token=" + queryToken))
            send(attacker, "GET", path, null, null, null, Map.of("Authorization", "Bearer " + bearer, "X-Api-Key", apiKey), "application/json");
        send(victim, "POST", "/api/v0/tasks", "{\"applicationId\":\"" + owned.app() + "\",\"prompt\":", victim.csrf(), null, null);
        send(victim, "POST", "/api/v0/tasks", "plain " + apiKey, victim.csrf(), null, Map.of("Content-Type", "text/plain"), "application/json");
        send(victim, "GET", "/api/v0/versions/" + owned.version() + "/files", null, null, null, Map.of("Accept", "image/png"), null);
        Res preview = call(victim, post("/api/v0/applications/" + owned.app() + "/versions/" + owned.version() + "/preview-credentials", null));
        if (preview.status() == 200) {
            String url = tree(preview).path("url").asText();
            secret("issued preview credential", url.substring(url.indexOf("credential=") + "credential=".length()));
        }
        // The capture must see both an SLF4J event and raw stderr, otherwise an empty scan would pass vacuously.
        String canary = "d19a-canary-" + SecurityFixtures.hex(8);
        LoggerFactory.getLogger(ApiSecurityMatrixTest.class).warn("log capture canary {}", canary);
        System.err.println("stderr capture canary " + canary);
        String output = OUTPUT.text();
        boolean captured = output.contains("log capture canary " + canary) && output.contains("stderr capture canary " + canary);

        List<String> violations = new ArrayList<>();
        if (!captured) violations.add("log capture did not observe the canary");
        Map<String, String> sources = new TreeMap<>();
        sources.put("process output (stdout+stderr from class load)", output);
        for (Path root : List.of(ROOT.resolve("deployments"), ROOT.resolve("model-calls"), ROOT.resolve("file-audit"), ADMIN_AUDIT_ROOT))
            for (String file : SecurityFixtures.tree(root).keySet()) {
                Path path = root.resolve(file);
                if (Files.isRegularFile(path)) sources.put("ledger " + root.getFileName() + "/" + file, Files.readString(path, UTF_8));
            }
        StringBuilder events = new StringBuilder();
        jdbc.queryForList("SELECT e.message FROM task_events e JOIN generation_tasks t ON t.id = e.task_id JOIN applications a ON a.id = t.application_id "
                + "WHERE a.owner_id IN (?, ?)", String.class, victimAccount.id(), attackerAccount.id()).forEach(m -> events.append(m).append('\n'));
        sources.put("task events", events.toString());
        Map<String, Integer> found = new TreeMap<>();
        for (var source : sources.entrySet())
            for (var secret : secrets.entrySet())
                if (source.getValue().contains(secret.getKey())) found.merge(source.getKey() + ": " + secret.getValue(), 1, Integer::sum);
        List<Pattern> patterns = List.of(Pattern.compile("\"password\"\\s*:\\s*\"[^\"]+"), Pattern.compile("(?i)password=\\S+"),
                Pattern.compile("JSESSIONID=[0-9A-Fa-f]{16,}"), Pattern.compile("(?i)x-csrf-token\\s*[:=]\\s*[0-9a-f]{32,}"),
                Pattern.compile("(?i)bearer\\s+[A-Za-z0-9._~+/-]{12,}"), Pattern.compile("\\bsk-[A-Za-z0-9]{12,}"),
                Pattern.compile("credential=[A-Za-z0-9_-]{20,}"), Pattern.compile("-----BEGIN [A-Z ]*PRIVATE KEY-----"));
        for (var source : sources.entrySet())
            for (Pattern pattern : patterns)
                if (pattern.matcher(source.getValue()).find()) found.merge(source.getKey() + ": pattern " + pattern.pattern(), 1, Integer::sum);
        found.forEach((where, count) -> violations.add(where));
        Map<String, Object> scanned = new TreeMap<>();
        sources.forEach((name, text) -> scanned.put(name, Map.of("bytes", text.getBytes(UTF_8).length, "lines", text.lines().count())));
        evidence("D19-A-T3.json", Map.of("case", "D19-A-T3 logs contain no secret or password", "captureVerifiedByCanary", captured,
                "secretValuesChecked", new TreeSet<>(secrets.values()), "secretValueCount", secrets.size(),
                "secretDigests", secrets.keySet().stream().map(ApiSecurityMatrixTest::digest).sorted().toList(),
                "patterns", patterns.stream().map(Pattern::pattern).toList(), "sourcesScanned", scanned, "violations", violations));
        assertThat(violations).isEmpty();
    }

    // ---------------------------------------------------------------- helpers

    private static List<String> spellings(String path) {
        String clean = path.contains("?") ? path.substring(0, path.indexOf('?')) : path;
        String query = path.substring(clean.length());
        if (!clean.startsWith("/api/v0/")) return List.of();
        String rest = clean.substring("/api/v0/".length());
        return Stream.of("/api;x=1/v0/" + rest, "/%61pi/v0/" + rest, "/api/%76%30/" + rest, "/api/v0;x=1/" + rest,
                "//api/v0/" + rest, "/api//v0/" + rest, "/./api/v0/" + rest, "/x/../api/v0/" + rest, "/API/v0/" + rest,
                "/api/v0/%" + HexFormat.of().formatHex(rest.substring(0, 1).getBytes(UTF_8)) + rest.substring(1),
                "/api/v0/" + rest + ";x=1", "/api/v0/" + rest + ";jsessionid=0", "/api/v0/" + rest + "/").map(p -> p + query).toList();
    }

    private Account account(String role) {
        UUID id = UUID.randomUUID();
        String email = "d19a-" + role + "-" + id.toString().substring(0, 8) + "@d19a.test";
        String password = secret(role + " password", "D19A-" + role + "-pw-" + SecurityFixtures.hex(12));
        repository.createUser(id, email, "D19A " + role);
        sql.sql("INSERT INTO auth_credentials(user_id, password_hash, role) VALUES (?, ?, 'USER')").params(id, encoder.encode(password)).update();
        return new Account(id, email, password);
    }

    private String secret(String label, String value) {
        secrets.put(value, label);
        return value;
    }

    private Session anonymous() throws Exception {
        HttpResponse<String> csrf = client.send(HttpRequest.newBuilder(uri("/api/v0/auth/csrf")).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(csrf.statusCode()).isEqualTo(200);
        String cookie = csrf.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        secret("session id", cookie.substring(cookie.indexOf('=') + 1));
        return new Session(cookie, secret("csrf token", mapper.readTree(csrf.body()).path("token").asText()));
    }

    private Session login(String email, String password) throws Exception {
        Session anonymous = anonymous();
        Res login = send(anonymous, "POST", "/api/v0/auth/login", json(Map.of("email", email, "password", password)), anonymous.csrf(), null, null);
        assertThat(login.status()).as(login.body()).isEqualTo(200);
        String cookie = login.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        secret("session id", cookie.substring(cookie.indexOf('=') + 1));
        return new Session(cookie, anonymous.csrf());
    }

    private Res tryLogin(String email, String password) throws Exception {
        Session anonymous = anonymous();
        return send(anonymous, "POST", "/api/v0/auth/login", json(Map.of("email", email, "password", password)), anonymous.csrf(), null, null);
    }

    /** n logins with wrong passwords, each from its own prepared session, released at the same instant. */
    private List<Integer> race(String email, int n) throws Exception {
        List<Session> sessions = new ArrayList<>();
        for (int i = 0; i < n; i++) sessions.add(anonymous());
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(n);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (Session session : sessions) {
                String body = json(Map.of("email", email, "password", secret("guess", "guess-" + SecurityFixtures.hex(6))));
                futures.add(pool.submit(() -> {
                    start.await();
                    return send(session, "POST", "/api/v0/auth/login", body, session.csrf(), null, null).status();
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> future : futures) statuses.add(future.get(120, TimeUnit.SECONDS));
            return statuses;
        } finally {
            pool.shutdownNow();
        }
    }

    @FunctionalInterface interface Attempt { String run() throws Exception; }

    private static List<String> parallel(int n, Attempt attempt) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(n);
        try {
            List<Future<String>> futures = new ArrayList<>();
            for (int i = 0; i < n; i++) futures.add(pool.submit(() -> { start.await(); return attempt.run(); }));
            start.countDown();
            List<String> results = new ArrayList<>();
            for (Future<String> future : futures) results.add(future.get(120, TimeUnit.SECONDS));
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    private Res call(Session session, Call call) throws Exception {
        return send(session, call.method(), call.path(), call.body(), call.method().equals("GET") ? null : session.csrf(), call.key(), null, call.accept());
    }

    private Res send(Session session, String method, String path, String body, String token, String key, Map<String, String> headers) throws Exception {
        return send(session, method, path, body, token, key, headers, "application/json");
    }

    private Res send(Session session, String method, String path, String body, String token, String key, Map<String, String> headers,
                     String accept) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(60));
        if (session != null) request.header("Cookie", session.cookie());
        if (token != null) request.header("X-CSRF-Token", token);
        if (key != null) request.header("Idempotency-Key", key);
        if (accept != null && (headers == null || !headers.containsKey("Accept"))) request.header("Accept", accept);
        if (body != null && (headers == null || !headers.containsKey("Content-Type"))) request.header("Content-Type", "application/json");
        if (headers != null) headers.forEach(request::header);
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body, UTF_8));
        if ("text/event-stream".equals(accept)) {
            HttpResponse<InputStream> response = client.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream stream = response.body()) {
                String text = response.statusCode() == 200 ? "" : SecurityFixtures.read(stream, 65536);
                return new Res(response.statusCode(), text, response.headers());
            }
        }
        HttpResponse<String> response = client.send(request.build(), HttpResponse.BodyHandlers.ofString(UTF_8));
        return new Res(response.statusCode(), response.body(), response.headers());
    }

    private Res expect(List<String> violations, List<Map<String, Object>> rows, String name, int status, Call call) throws Exception {
        Res res = call(victim, call);
        rows.add(row("case", name, "status", res.status(), "code", code(res)));
        if (res.status() != status) violations.add(name + " expected " + status + " got " + res.status() + " " + code(res));
        return res;
    }

    private void cancel(Res created) throws Exception { cancel(victim, created); }

    private void cancel(Session session, Res created) throws Exception {
        JsonNode body = tree(created);
        String id = body.has("task") ? body.path("task").path("id").asText() : body.path("id").asText();
        if (!id.isEmpty()) assertThat(send(session, "POST", "/api/v0/tasks/" + id + "/cancel", null, session.csrf(), null, null).status()).isEqualTo(200);
    }

    private void cancel(UUID task) throws Exception {
        assertThat(send(victim, "POST", "/api/v0/tasks/" + task + "/cancel", null, victim.csrf(), null, null).status()).isEqualTo(200);
    }

    private UUID draftVersion(UUID app) throws Exception {
        UUID task = UUID.randomUUID(), version = UUID.randomUUID();
        repository.createTask(task, app, "D19A draft source");
        jdbc.update("UPDATE generation_tasks SET status = 'FAILED', failure_code = 'CANCELLED', queue_state = 'FINISHED' WHERE id = ?", task);
        jdbc.update("INSERT INTO application_versions(id, application_id, number, source_digest, status, source_task_id) "
                + "VALUES (?, ?, (SELECT coalesce(max(number), 0) + 1 FROM application_versions WHERE application_id = ?), ?, 'DRAFT', ?)",
                version, app, app, owned.sourceDigest(), task);
        return version;
    }

    /** Victim/attacker scoped database state plus every file under this class's private storage roots. */
    private Map<String, Object> fingerprint() throws Exception {
        Object[] owners = {victimAccount.id(), attackerAccount.id()};
        String apps = "(SELECT id FROM applications WHERE owner_id IN (?, ?))";
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("applications", jdbc.queryForList("SELECT id, name, description, status, latest_ready_version_id, row_version "
                + "FROM applications WHERE owner_id IN (?, ?) ORDER BY id", owners).toString());
        state.put("tasks", jdbc.queryForList("SELECT id, status, queue_state, failure_code, idempotency_key, event_sequence "
                + "FROM generation_tasks WHERE application_id IN " + apps + " ORDER BY id", owners).toString());
        state.put("events", jdbc.queryForObject("SELECT count(*) FROM task_events WHERE task_id IN (SELECT id FROM generation_tasks "
                + "WHERE application_id IN " + apps + ")", Long.class, owners));
        state.put("versions", jdbc.queryForList("SELECT id, status, build_id FROM application_versions WHERE application_id IN " + apps
                + " ORDER BY id", owners).toString());
        state.put("publications", jdbc.queryForList("SELECT id, version_id, requested_by, status, url FROM publications "
                + "WHERE application_id IN " + apps + " ORDER BY id", owners).toString());
        state.put("files", SecurityFixtures.tree(ROOT));
        return state;
    }

    private static List<String> changed(Map<String, Object> before, Map<String, Object> after) {
        return before.keySet().stream().filter(k -> !before.get(k).equals(after.get(k))).toList();
    }

    private static Set<String> difference(Set<String> a, Set<String> b) {
        var result = new TreeSet<>(a);
        result.removeAll(b);
        return result;
    }

    private static Map<String, Object> row(Object... pairs) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) row.put((String) pairs[i], pairs[i + 1]);
        return row;
    }

    private static Call get(String path) { return new Call("GET", path, null, null, "application/json"); }

    private static Call post(String path, Map<String, ?> body) {
        return new Call("POST", path, body == null ? null : json(body), null, "application/json");
    }

    private static Call keyed(Call call, String key) { return new Call(call.method(), call.path(), call.body(), key, call.accept()); }

    private static Call publish(Map<String, ?> body) { return new Call("POST", "/api/v0/publications", json(body), fresh(), "application/json"); }

    private static String fresh() { return "d19a-illegal-" + SecurityFixtures.hex(8); }

    private static Map<String, Object> with(Map<String, Object> base, String key, Object value) {
        Map<String, Object> copy = new LinkedHashMap<>(base);
        copy.put(key, value);
        return copy;
    }

    private static Map<String, Object> selection(UUID version, String digest) {
        return Map.of("versionId", version.toString(), "sourceDigest", digest, "componentId", "home-page");
    }

    private static String json(Object value) { return SecurityFixtures.JSON.writeValueAsString(value); }

    private static String encode(String value) { return java.net.URLEncoder.encode(value, UTF_8); }

    private static String template(String path) {
        return path.replaceAll("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "{id}").replaceAll("\\?.*", "");
    }

    private static String strip(String body, Target target) {
        return body.replace(target.version().toString(), "{version}").replace(target.app().toString(), "{app}")
                .replaceAll("\"(timestamp|traceId|path)\":\"[^\"]*\"", "");
    }

    private static String digest(String value) {
        try {
            return "sha256:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(UTF_8))).substring(0, 16);
        } catch (Exception failure) { throw new IllegalStateException(failure); }
    }

    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }

    private JsonNode tree(Res res) {
        try { return mapper.readTree(res.body()); } catch (RuntimeException notJson) { return mapper.createObjectNode(); }
    }

    private String code(Res res) { return tree(res).path("code").asText(""); }

    private String message(Res res) { return tree(res).path("message").asText(""); }

    private void evidence(String name, Object value) throws Exception {
        Path directory = Path.of(System.getenv().getOrDefault("CODELESS_SECURITY_EVIDENCE_DIR", "target/security-evidence"));
        Files.createDirectories(directory);
        Object tree = mapper.valueToTree(value);
        if (tree instanceof tools.jackson.databind.node.ObjectNode object) object.put("source", "ApiSecurityMatrixTest real HTTP + PostgreSQL");
        Files.writeString(directory.resolve(name), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(tree) + "\n");
    }
}
