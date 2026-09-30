package dev.codeless.api.tasks;

import static org.assertj.core.api.Assertions.assertThat;

import dev.codeless.api.data.PostgresTestBase;
import dev.codeless.api.data.TaskProgressService;
import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Real TCP SSE framing, cookie authentication and PostgreSQL persistence, not MockMvc. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
        "CODELESS_DEMO_PASSWORD=demo-password-for-test-only",
        "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only",
        "CODELESS_COOKIE_SECURE=false",
        "codeless.events.poll-ms=25",
        "codeless.events.heartbeat-ms=50"
})
class TaskSseHttpTest extends PostgresTestBase {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired TaskProgressService progress;

    private final class Browser implements AutoCloseable {
        final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
        String csrf;

        Browser(boolean admin) throws Exception {
            csrf = json(get("/auth/csrf")).get("token").asText();
            assertThat(post("/auth/login", admin
                    ? "{\"email\":\"admin@codeless.local\",\"password\":\"admin-password-for-test-only\"}"
                    : "{\"email\":\"demo@codeless.local\",\"password\":\"demo-password-for-test-only\"}")
                    .statusCode()).isEqualTo(200);
        }

        HttpRequest.Builder request(String path) {
            return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v0" + path))
                    .timeout(Duration.ofSeconds(5));
        }

        HttpResponse<String> get(String path) throws Exception {
            return client.send(request(path).header("Accept", "application/json").GET().build(),
                    HttpResponse.BodyHandlers.ofString());
        }

        HttpResponse<String> post(String path, String body) throws Exception {
            return client.send(request(path).header("X-CSRF-Token", csrf)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
        }

        UUID task() throws Exception {
            var app = post("/applications", "{\"name\":\"SSE fixture\",\"dataMode\":\"MOCK\"}");
            assertThat(app.statusCode()).isEqualTo(201);
            var task = post("/tasks", "{\"applicationId\":\"" + json(app).get("id").asText()
                    + "\",\"prompt\":\"Deterministic SSE task\"}");
            assertThat(task.statusCode()).isEqualTo(202);
            return UUID.fromString(json(task).get("id").asText());
        }

        HttpResponse<InputStream> stream(UUID task, String cursor, String query) throws Exception {
            var builder = request("/tasks/" + task + "/events" + query)
                    .header("Accept", "text/event-stream");
            if (cursor != null) builder.header("Last-Event-ID", cursor);
            return client.send(builder.GET().build(), HttpResponse.BodyHandlers.ofInputStream());
        }

        @Override public void close() { client.shutdownNow(); }
    }

    private JsonNode json(HttpResponse<String> response) { return mapper.readTree(response.body()); }

    private record Frame(String id, String name, String data, String raw) {
        static final Frame EOF = new Frame(null, "eof", null, "");
    }

    private final class Wire implements AutoCloseable {
        final InputStream body;
        final BlockingQueue<Frame> frames = new LinkedBlockingQueue<>(2048);
        final Thread reader;

        Wire(HttpResponse<InputStream> response) {
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("text/event-stream");
            assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
            assertThat(response.headers().firstValue("X-Accel-Buffering")).contains("no");
            body = response.body();
            reader = Thread.ofVirtual().start(() -> {
                try (var input = new BufferedReader(new InputStreamReader(body, StandardCharsets.UTF_8))) {
                    String id = null, name = null, data = null;
                    StringBuilder raw = new StringBuilder();
                    String line;
                    while ((line = input.readLine()) != null) {
                        if (line.isEmpty()) {
                            frames.put(new Frame(id, name, data, raw.toString()));
                            id = null; name = null; data = null; raw.setLength(0);
                        } else {
                            raw.append(line).append('\n');
                            if (line.startsWith("id:")) id = line.substring(3).strip();
                            if (line.startsWith("event:")) name = line.substring(6).strip();
                            if (line.startsWith("data:")) data = line.substring(5).strip();
                        }
                    }
                } catch (Exception ignored) { /* closing a wire aborts its socket reader */ }
                finally { frames.offer(Frame.EOF); }
            });
        }

        Frame next() throws Exception {
            Frame frame = frames.poll(5, TimeUnit.SECONDS);
            assertThat(frame).as("SSE frame must arrive within 5 seconds").isNotNull();
            return frame;
        }

        Frame event() throws Exception {
            for (int i = 0; i < 200; i++) {
                Frame frame = next();
                assertThat(frame).isNotEqualTo(Frame.EOF);
                if ("task-event".equals(frame.name())) return frame;
            }
            throw new AssertionError("No business event");
        }

        List<Frame> drain() throws Exception {
            List<Frame> events = new ArrayList<>();
            for (int i = 0; i < 2048; i++) {
                Frame frame = next();
                if (frame.equals(Frame.EOF)) return events;
                if ("task-event".equals(frame.name())) events.add(frame);
            }
            throw new AssertionError("Stream did not terminate");
        }

        @Override public void close() throws Exception { body.close(); reader.interrupt(); }
    }

    @Test void D06_A_T1_disconnectCancelAndReconnectReplaysEveryMissedDurableEvent() throws Exception {
        try (Browser owner = new Browser(false)) {
            UUID task = owner.task();
            try (Wire wire = new Wire(owner.stream(task, null, ""))) {
                assertThat(wire.event().id()).isEqualTo("1");
            }
            progress.transition(task, TaskStatus.GENERATE, EventType.STAGE_STARTED, "fixture generate", null);
            progress.transition(task, TaskStatus.VERIFY, EventType.STAGE_STARTED, "fixture verify", null);
            assertThat(owner.post("/tasks/" + task + "/cancel", "{}").statusCode()).isEqualTo(200);
            try (Wire resumed = new Wire(owner.stream(task, "1", ""))) {
                var events = resumed.drain();
                assertThat(events).extracting(Frame::id).containsExactly("2", "3", "4");
                assertThat(mapper.readTree(events.getLast().data()).get("stage").asText()).isEqualTo("FAILED");
            }
            var state = json(owner.get("/tasks/" + task));
            assertThat(state.get("status").asText()).isEqualTo("FAILED");
            assertThat(state.get("failureCode").asText()).isEqualTo("CANCELLED");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM task_events WHERE task_id=?", Integer.class, task))
                    .isEqualTo(4);
        }
    }

    @Test void D06_A_T2_stableRepeatedIdsAndExclusiveCursorCannotMutateOrRegressState() throws Exception {
        try (Browser owner = new Browser(false)) {
            UUID task = owner.task();
            progress.transition(task, TaskStatus.GENERATE, EventType.STAGE_STARTED, "generated", null);
            owner.post("/tasks/" + task + "/cancel", "{}");
            List<Frame> first, repeated;
            try (Wire wire = new Wire(owner.stream(task, "0", ""))) { first = wire.drain(); }
            try (Wire wire = new Wire(owner.stream(task, "0", ""))) { repeated = wire.drain(); }
            assertThat(repeated).isEqualTo(first);
            // Reference consumer only: B must validate this rule in its actual reducer/browser.
            int lastApplied = 0;
            String state = "PLAN";
            List<String> progressItems = new ArrayList<>();
            List<Frame> deliveries = new ArrayList<>(first);
            deliveries.addAll(repeated);
            for (Frame frame : deliveries) {
                var event = mapper.readTree(frame.data());
                int sequence = event.get("sequence").asInt();
                assertThat(frame.id()).isEqualTo(Integer.toString(sequence));
                if (sequence <= lastApplied) continue;
                state = event.get("stage").asText();
                progressItems.add(frame.id());
                lastApplied = sequence;
            }
            assertThat(progressItems).containsExactly("1", "2", "3");
            assertThat(state).isEqualTo("FAILED");
            try (Wire wire = new Wire(owner.stream(task, "3", ""))) { assertThat(wire.drain()).isEmpty(); }
            assertThat(json(owner.get("/tasks/" + task)).get("status").asText()).isEqualTo("FAILED");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM task_events WHERE task_id=?", Integer.class, task))
                    .isEqualTo(3);
        }
    }

    @Test void D06_A_T3_foreignAndAnonymousCannotSubscribeAndLogoutInvalidatesReconnect() throws Exception {
        try (Browser owner = new Browser(false); Browser stranger = new Browser(true)) {
            UUID task = owner.task();
            try (var responseBody = stranger.stream(task, null, "").body()) {
                assertThat(mapper.readTree(responseBody).get("code").asText()).isEqualTo("NOT_FOUND");
            }
            var foreign = stranger.stream(task, "1", "");
            assertThat(foreign.statusCode()).isEqualTo(404);
            foreign.body().close();
            var anonymous = HttpClient.newHttpClient().send(owner.request("/tasks/" + task + "/events")
                    .header("Accept", "text/event-stream").GET().build(), HttpResponse.BodyHandlers.ofString());
            assertThat(anonymous.statusCode()).isEqualTo(401);
            assertThat(mapper.readTree(anonymous.body()).get("code").asText()).isEqualTo("UNAUTHENTICATED");
            try (Wire wire = new Wire(owner.stream(task, null, ""))) {
                wire.event();
                assertThat(owner.post("/auth/logout", "{}").statusCode()).isEqualTo(204);
                assertThat(wire.drain()).isEmpty();
            }
            var reconnect = owner.stream(task, "1", "");
            assertThat(reconnect.statusCode()).isEqualTo(401);
            reconnect.body().close();
        }
    }

    @Test void D06_A_T4_heartbeatHasNoBusinessIdAndTerminalStatusRemainsQueryable() throws Exception {
        try (Browser owner = new Browser(false)) {
            UUID task = owner.task();
            try (Wire wire = new Wire(owner.stream(task, null, ""))) {
                assertThat(wire.event().id()).isEqualTo("1");
                for (int i = 0; i < 3; i++) {
                    Frame heartbeat = wire.next();
                    assertThat(heartbeat.raw()).contains(":heartbeat", "retry:1000");
                    assertThat(heartbeat.id()).isNull();
                    assertThat(heartbeat.data()).isNull();
                    assertThat(heartbeat.name()).isNull();
                }
                assertThat(jdbc.queryForObject("SELECT count(*) FROM task_events WHERE task_id=?", Integer.class, task))
                        .isEqualTo(1);
                owner.post("/tasks/" + task + "/cancel", "{}");
                assertThat(wire.drain()).extracting(Frame::id).containsExactly("2");
            }
            assertThat(json(owner.get("/tasks/" + task)).get("failureCode").asText()).isEqualTo("CANCELLED");
            try (Wire wire = new Wire(owner.stream(task, "1", ""))) {
                assertThat(wire.drain()).extracting(Frame::id).containsExactly("2");
            }
            assertThat(jdbc.queryForObject("SELECT count(*) FROM task_events WHERE task_id=?", Integer.class, task))
                    .isEqualTo(2);
        }
    }

    @Test void historicalMessagesAreSanitizedInJsonAndSseWithoutChangingDurableRecords() throws Exception {
        try (Browser owner = new Browser(false)) {
            UUID task = owner.task();
            String secret = "Authorization: Bearer sk-test-secret password=p@ss C:/private/key "
                    + "postgresql://user:secret@internal.host/db\nevent: forged";
            progress.transition(task, TaskStatus.GENERATE, EventType.STAGE_STARTED, secret, null);
            owner.post("/tasks/" + task + "/cancel", "{}");
            String history = owner.get("/tasks/" + task + "/events").body();
            assertThat(history).contains("Stage started: GENERATE")
                    .doesNotContain("sk-test", "p@ss", "private", "internal.host", "forged");
            try (Wire wire = new Wire(owner.stream(task, "1", ""))) {
                assertThat(wire.drain().getFirst().data()).contains("Stage started: GENERATE")
                        .doesNotContain("sk-test", "p@ss", "private", "internal.host", "forged");
            }
            assertThat(jdbc.queryForObject("SELECT message FROM task_events WHERE task_id=? AND sequence=2",
                    String.class, task)).isEqualTo(secret);
        }
    }

    private void error(Browser browser, UUID task, String cursor, int status, String code) throws Exception {
        var response = browser.stream(task, cursor, "");
        try (InputStream body = response.body()) {
            assertThat(response.statusCode()).isEqualTo(status);
            assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("application/json");
            assertThat(mapper.readTree(body).get("code").asText()).isEqualTo(code);
        }
    }

    @Test void malformedAheadAndQueryCursorsHaveExplicitErrorsAndHeaderTakesPrecedence() throws Exception {
        try (Browser owner = new Browser(false)) {
            UUID task = owner.task();
            for (String cursor : List.of("", "-1", "+1", "01", "1.0", "2147483648", "1,2", UUID.randomUUID().toString()))
                error(owner, task, cursor, 400, "INVALID_EVENT_ID");
            error(owner, task, "2", 409, "EVENT_CURSOR_AHEAD");
            owner.post("/tasks/" + task + "/cancel", "{}");
            try (Wire wire = new Wire(owner.stream(task, null, "?afterEventId=1"))) {
                assertThat(wire.drain()).extracting(Frame::id).containsExactly("2");
            }
            try (Wire wire = new Wire(owner.stream(task, "1", "?afterEventId=0"))) {
                assertThat(wire.drain()).extracting(Frame::id).containsExactly("2");
            }
            assertThat(owner.get("/tasks/" + task + "/events?limit=0").statusCode()).isEqualTo(400);
            assertThat(owner.get("/tasks/" + task + "/events?limit=1001").statusCode()).isEqualTo(400);
            var malformedLimit = owner.get("/tasks/" + task + "/events?limit=unknown");
            assertThat(malformedLimit.statusCode()).isEqualTo(400);
            assertThat(json(malformedLimit).get("code").asText()).isEqualTo("INVALID_REQUEST");
        }
    }

    @Test void backlogIsBoundedAndJsonPagesRecoverAllEventsBeforeSseResume() throws Exception {
        try (Browser owner = new Browser(false)) {
            UUID task = owner.task();
            // Explicit large-history fixture, atomically keep head consistent with inserted records.
            // Single SQL statement ensures this setup is atomic even with a pooled JdbcTemplate.
            jdbc.update("""
                    WITH inserted AS (
                        INSERT INTO task_events(id,task_id,sequence,type,stage,message)
                        SELECT gen_random_uuid(), ?, s, 'TOOL_RESULT', 'PLAN', 'fixture'
                        FROM generate_series(2,1002) s RETURNING sequence
                    ) UPDATE generation_tasks SET event_sequence=(SELECT max(sequence) FROM inserted) WHERE id=?
                    """, task, task);
            error(owner, task, "0", 409, "EVENT_BACKLOG_EXCEEDED");
            var first = json(owner.get("/tasks/" + task + "/events"));
            assertThat(first.size()).isEqualTo(1000);
            assertThat(first.get(999).get("sequence").asInt()).isEqualTo(1000);
            var second = json(owner.get("/tasks/" + task + "/events?afterEventId=1000"));
            assertThat(second.size()).isEqualTo(2);
            assertThat(second.get(0).get("sequence").asInt()).isEqualTo(1001);
            assertThat(second.get(1).get("sequence").asInt()).isEqualTo(1002);
            owner.post("/tasks/" + task + "/cancel", "{}");
            try (Wire wire = new Wire(owner.stream(task, "1002", ""))) {
                assertThat(wire.drain()).extracting(Frame::id).containsExactly("1003");
            }
        }
    }

    @Test void missingDurableEventFailsInsteadOfPretendingTerminalReplaySucceeded() throws Exception {
        try (Browser owner = new Browser(false)) {
            UUID task = owner.task();
            owner.post("/tasks/" + task + "/cancel", "{}");
            jdbc.update("DELETE FROM task_events WHERE task_id=? AND sequence=1", task);
            error(owner, task, "0", 500, "INTERNAL_ERROR");
            assertThat(json(owner.get("/tasks/" + task)).get("status").asText()).isEqualTo("FAILED");
        }
    }

    @Test void backlogThatAppearsAfterConnectSendsControlErrorWithoutAdvancingEventId() throws Exception {
        try (Browser owner = new Browser(false)) {
            UUID task = owner.task();
            try (Wire wire = new Wire(owner.stream(task, null, ""))) {
                assertThat(wire.event().id()).isEqualTo("1");
                jdbc.update("""
                        WITH inserted AS (
                            INSERT INTO task_events(id,task_id,sequence,type,stage,message)
                            SELECT gen_random_uuid(), ?, s, 'TOOL_RESULT', 'PLAN', 'fixture'
                            FROM generate_series(2,1002) s RETURNING sequence
                        ) UPDATE generation_tasks SET event_sequence=(SELECT max(sequence) FROM inserted) WHERE id=?
                        """, task, task);
                Frame error = null;
                for (int i = 0; i < 200; i++) {
                    Frame frame = wire.next();
                    if ("stream-error".equals(frame.name())) { error = frame; break; }
                    assertThat(frame.name()).isNull();
                }
                assertThat(error).isNotNull();
                assertThat(error.id()).isNull();
                assertThat(mapper.readTree(error.data()).get("code").asText()).isEqualTo("EVENT_BACKLOG_EXCEEDED");
                assertThat(wire.next()).isEqualTo(Frame.EOF);
                assertThat(json(owner.get("/tasks/" + task)).get("status").asText()).isEqualTo("PLAN");
            }
        }
    }

    @Test void disablingAccountClosesExistingStreamAndRejectsEveryNewConnection() throws Exception {
        try (Browser owner = new Browser(false)) {
            UUID task = owner.task();
            UUID user = UUID.fromString(json(owner.get("/auth/me")).get("id").asText());
            try (Wire wire = new Wire(owner.stream(task, null, ""))) {
                wire.event();
                jdbc.update("UPDATE platform_users SET status='DISABLED' WHERE id=?", user);
                Frame error = null;
                for (int i = 0; i < 200; i++) {
                    Frame frame = wire.next();
                    if ("stream-error".equals(frame.name())) { error = frame; break; }
                    assertThat(frame.name()).isNull();
                }
                assertThat(error).isNotNull();
                assertThat(error.id()).isNull();
                assertThat(mapper.readTree(error.data()).get("code").asText()).isEqualTo("NOT_FOUND");
                assertThat(wire.next()).isEqualTo(Frame.EOF);
                error(owner, task, "1", 401, "UNAUTHENTICATED");
            } finally {
                jdbc.update("UPDATE platform_users SET status='ACTIVE' WHERE id=?", user);
            }
        }
    }
}
