package dev.codeless.api.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.json.JsonMapper;

class DeepSeekModelProviderTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final AtomicInteger calls = new AtomicInteger();
    private HttpServer server;
    private ExecutorService executor;
    private volatile int status = 200;
    private volatile String response;
    private volatile long delay;
    private volatile boolean drip;
    private volatile boolean requestHeader = true;
    private final String fakeKey = "local-transport-test-only-secret";
    private DeepSeekModelProvider provider;

    @BeforeEach
    void start() throws Exception {
        response = completion("stop", "{\"hello\":true}", "{\"prompt_tokens\":12,\"completion_tokens\":7,\"total_tokens\":19}");
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newVirtualThreadPerTaskExecutor();
        server.setExecutor(executor);
        server.createContext("/chat/completions", exchange -> {
            calls.incrementAndGet();
            assertThat(exchange.getRequestMethod()).isEqualTo("POST");
            assertThat(exchange.getRequestHeaders().getFirst("Authorization")).isEqualTo("Bearer " + fakeKey);
            var body = mapper.readTree(exchange.getRequestBody().readAllBytes());
            assertThat(body.get("max_tokens").intValue()).isEqualTo(1024);
            assertThat(body.get("stream").booleanValue()).isFalse();
            assertThat(body.path("response_format").path("type").asText()).isEqualTo("json_object");
            assertThat(body.path("thinking").path("type").asText()).isEqualTo("disabled");
            assertThat(body.get("messages").size()).isEqualTo(2);
            assertThat(body.at("/messages/0/role").asText()).isEqualTo("system");
            assertThat(body.at("/messages/1/role").asText()).isEqualTo("user");
            assertThat(body.has("tools")).isFalse();
            try {
                if (!drip && delay > 0) Thread.sleep(delay);
                if (requestHeader) exchange.getResponseHeaders().set("x-request-id", "transport-req-1");
                if (status == 302) exchange.getResponseHeaders().set("Location", "/must-not-follow");
                byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(status, bytes.length);
                if (drip) {
                    exchange.getResponseBody().write(bytes, 0, 1);
                    exchange.getResponseBody().flush();
                    Thread.sleep(delay);
                    exchange.getResponseBody().write(bytes, 1, bytes.length - 1);
                } else exchange.getResponseBody().write(bytes);
            } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            finally { exchange.close(); }
        });
        server.createContext("/must-not-follow", exchange -> { calls.incrementAndGet(); exchange.close(); });
        server.start();
        provider = new DeepSeekModelProvider(URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/chat/completions"), fakeKey, "test-model");
    }
    @AfterEach void stop() { server.stop(0); executor.shutdownNow(); }
    private ModelProvider.Reply call(Duration timeout) {
        return provider.call(new Prompt(java.util.List.of(new SystemMessage("json policy"), new UserMessage("untrusted request"))), 1024, timeout);
    }
    private String completion(String finish, String content, String usage) {
        return "{\"id\":\"response-1\",\"model\":\"actual-model-revision\",\"choices\":[{\"finish_reason\":\"" + finish
                + "\",\"message\":{\"content\":" + mapper.writeValueAsString(content) + "}}]"
                + (usage == null ? "" : ",\"usage\":" + usage) + "}";
    }

    @Test
    void capturesActualModelRequestIdDurationInputsAndRawUsageWithoutRetry() {
        var reply = call(Duration.ofSeconds(5));
        assertThat(reply.evidence().actualModel()).isEqualTo("actual-model-revision");
        assertThat(reply.evidence().requestId()).isEqualTo("transport-req-1");
        assertThat(reply.evidence().responseId()).isEqualTo("response-1");
        assertThat(reply.evidence().usage().inputTokens()).isEqualTo(12);
        assertThat(reply.evidence().usage().outputTokens()).isEqualTo(7);
        assertThat(reply.evidence().usage().totalTokens()).isEqualTo(19);
        assertThat(calls).hasValue(1);
    }
    @Test
    void missingUsageNullUsageAndPartialUsageStayUnknownAndResponseIdIsFallback() {
        requestHeader = false;
        for (String usage : java.util.Arrays.asList(null, "null", "{\"prompt_tokens\":12}")) {
            response = completion("stop", "{}", usage);
            var reply = call(Duration.ofSeconds(5));
            assertThat(reply.evidence().requestId()).isEqualTo("response-1");
            assertThat(reply.evidence().usage().outputTokens()).isNull();
            assertThat(reply.evidence().usage().totalTokens()).isNull();
            if (usage == null || usage.equals("null")) assertThat(reply.evidence().usage().inputTokens()).isNull();
        }
        assertThat(calls).hasValue(3);
    }
    @Test
    void classifies429WithoutRetryAndDoesNotExposeBodyOrSecrets() {
        status = 429; response = "{\"error\":\"" + fakeKey + "\"}";
        try { call(Duration.ofSeconds(5)); throw new AssertionError("expected rate limit"); }
        catch (ModelFailure failure) {
            assertThat(failure.code()).isEqualTo("MODEL_RATE_LIMITED");
            assertThat(failure.evidence().requestId()).isEqualTo("transport-req-1");
            assertThat(failure.evidence().usage().inputTokens()).isNull();
            assertThat(failure.getMessage()).doesNotContain(fakeKey);
        }
        assertThat(calls).hasValue(1);
    }
    @Test
    void classifiesHeaderTimeoutAndWholeResponseBodyTimeout() {
        delay = 1500;
        assertThatThrownBy(() -> call(Duration.ofMillis(500))).hasMessage("MODEL_TIMEOUT");
        delay = 1500; drip = true;
        assertThatThrownBy(() -> call(Duration.ofMillis(500))).hasMessage("MODEL_TIMEOUT");
        assertThat(calls).hasValue(2);
    }
    @Test
    void classifiesAuthenticationServiceFailuresAndDoesNotFollowRedirects() {
        for (var entry : Map.of(401, "MODEL_AUTHENTICATION", 503, "MODEL_UNAVAILABLE", 302, "MODEL_HTTP_ERROR").entrySet()) {
            status = entry.getKey();
            assertThatThrownBy(() -> call(Duration.ofSeconds(5))).hasMessage(entry.getValue());
        }
        assertThat(calls).hasValue(3);
    }
    @Test
    void rejectsTruncatedMalformedEmptyAndOversizedResponsesPreservingKnownUsage() {
        response = completion("length", "{}", "{\"prompt_tokens\":12,\"completion_tokens\":7}");
        try { call(Duration.ofSeconds(5)); throw new AssertionError("expected truncated failure"); }
        catch (ModelFailure failure) {
            assertThat(failure.code()).isEqualTo("MODEL_INVALID_RESPONSE");
            assertThat(failure.evidence().usage().outputTokens()).isEqualTo(7);
        }
        response = "{invalid";
        assertThatThrownBy(() -> call(Duration.ofSeconds(5))).hasMessage("MODEL_INVALID_RESPONSE");
        response = completion("stop", "", null);
        assertThatThrownBy(() -> call(Duration.ofSeconds(5))).hasMessage("MODEL_INVALID_RESPONSE");
        response = "x".repeat(256 * 1024 + 1);
        assertThatThrownBy(() -> call(Duration.ofSeconds(5))).hasMessage("MODEL_RESPONSE_LIMIT");
        assertThat(calls).hasValue(4);
    }
}
