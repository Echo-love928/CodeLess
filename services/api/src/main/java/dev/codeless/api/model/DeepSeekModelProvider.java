package dev.codeless.api.model;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Single DeepSeek chat completion endpoint; Spring AI messages, raw usage, no retries or tools. */
public final class DeepSeekModelProvider implements ModelProvider {
    private final URI endpoint;
    private final String key;
    private final String model;
    private final HttpClient client;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public DeepSeekModelProvider(String key, String model) {
        this(URI.create("https://api.deepseek.com/chat/completions"), key, model);
    }
    /** Package-private endpoint injection is restricted to local transport tests. */
    DeepSeekModelProvider(URI endpoint, String key, String model) {
        // Validate before building Authorization: JDK header exceptions can contain the full value.
        if (key == null || key.length() > 4096 || !key.matches("[A-Za-z0-9._~+/-]+=*")
                || model == null || !model.matches("[A-Za-z0-9._-]{1,120}"))
            throw new ModelFailure("MODEL_CONFIGURATION");
        this.endpoint = endpoint; this.key = key; this.model = model;
        client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Duration.ofSeconds(10)).build();
    }
    public String id() { return "deepseek"; }
    public String model() { return model; }

    private String requestBody(Prompt prompt,int maxOutputTokens) {
        var messages = prompt.getInstructions().stream().map(message -> Map.of(
                "role", message.getMessageType().name().toLowerCase(java.util.Locale.ROOT),
                "content", message.getText())).toList();
        return mapper.writeValueAsString(Map.of("model", model, "messages", messages,
                "max_tokens", maxOutputTokens, "stream", false, "response_format", Map.of("type", "json_object"),
                "thinking", Map.of("type", "disabled")));
    }
    @Override public Map<String,Object> requestMetadata(Prompt prompt,int maxOutputTokens) {
        byte[] bytes=requestBody(prompt,maxOutputTokens).getBytes(StandardCharsets.UTF_8);
        try {
            return Map.of("kind","DEEPSEEK_CHAT_JSON_V1","bodyDigest","sha256:"+java.util.HexFormat.of().formatHex(
                    java.security.MessageDigest.getInstance("SHA-256").digest(bytes)),"bodyBytes",bytes.length,
                    "responseFormat","json_object","maxOutputTokens",maxOutputTokens,"stream",false,"thinking","disabled");
        } catch(java.security.NoSuchAlgorithmException impossible){throw new ModelFailure("MODEL_CONFIGURATION");}
    }

    public Reply call(Prompt prompt, int maxOutputTokens, Duration timeout) {
        if (maxOutputTokens < 256 || maxOutputTokens > 4096 || timeout.isNegative()
                || timeout.toMillis() < 1 || timeout.compareTo(Duration.ofSeconds(120)) > 0)
            throw new ModelFailure("MODEL_INVALID_INPUT");
        String body=requestBody(prompt,maxOutputTokens);
        var received = new AtomicReference<>(new ResponseHead(null, Evidence.unknown()));
        CompletableFuture<HttpResponse<byte[]>> pending;
        try {
            HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(timeout)
                    .header("Content-Type", "application/json").header("Authorization", "Bearer " + key)
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
            pending = client.sendAsync(request, info -> {
                String requestId = info.headers().firstValue("x-request-id").filter(DeepSeekModelProvider::safeId).orElse(null);
                var head = new ResponseHead(httpError(info.statusCode()), new Evidence(null, requestId, null, Usage.unknown()));
                received.set(head);
                return new BoundedBody(head.errorCode() == null ? null : head.failure(head.errorCode()));
            });
        } catch (IllegalArgumentException exception) {
            // Never attach the JDK exception, which may echo request headers.
            throw new ModelFailure("MODEL_CONFIGURATION");
        }
        HttpResponse<byte[]> response;
        try {
            response = pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException exception) {
            pending.cancel(true); throw received.get().failure("MODEL_TIMEOUT");
        } catch (InterruptedException exception) {
            pending.cancel(true); Thread.currentThread().interrupt(); throw received.get().failure("MODEL_INTERRUPTED");
        } catch (ExecutionException exception) {
            if (exception.getCause() instanceof HttpTimeoutException) throw received.get().failure("MODEL_TIMEOUT");
            if (exception.getCause() instanceof ModelFailure failure) throw received.get().failure(failure.code());
            throw received.get().failure("MODEL_NETWORK");
        }
        Evidence evidence = received.get().evidence();
        String requestId = evidence.requestId();
        try {
            JsonNode root = mapper.readTree(response.body());
            String actualModel = text(root.get("model"));
            String responseId = text(root.get("id"));
            evidence = new Evidence(actualModel, requestId == null ? responseId : requestId, responseId, Usage.unknown());
            evidence = new Evidence(actualModel, evidence.requestId(), responseId, Usage.from(root.get("usage")));
            JsonNode choices = root.get("choices");
            if (choices == null || !choices.isArray() || choices.size() != 1
                    || !"stop".equals(choices.get(0).path("finish_reason").asText())
                    || choices.get(0).path("message").has("tool_calls"))
                throw new ModelFailure("MODEL_INVALID_RESPONSE", evidence);
            JsonNode content = choices.get(0).path("message").get("content");
            if (content == null || !content.isString() || content.asText().isBlank())
                throw new ModelFailure("MODEL_INVALID_RESPONSE", evidence);
            return new Reply(content.asText(), evidence);
        } catch (ModelFailure failure) { throw new ModelFailure(failure.code(), evidence); }
        catch (RuntimeException exception) { throw new ModelFailure("MODEL_INVALID_RESPONSE", evidence); }
    }

    private static String httpError(int status) {
        return switch (status) {
            case 200 -> null;
            case 429 -> "MODEL_RATE_LIMITED";
            case 401, 403 -> "MODEL_AUTHENTICATION";
            default -> status >= 500 ? "MODEL_UNAVAILABLE" : "MODEL_HTTP_ERROR";
        };
    }
    private record ResponseHead(String errorCode, Evidence evidence) {
        ModelFailure failure(String transportCode) {
            return new ModelFailure(errorCode == null ? transportCode : errorCode, evidence);
        }
    }

    private static boolean safeId(String value) { return value.matches("[A-Za-z0-9._:/-]{1,200}"); }
    private static String text(JsonNode value) {
        return value != null && value.isString() && safeId(value.asText()) ? value.asText() : null;
    }

    private static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        private final ModelFailure rejection;
        BoundedBody(ModelFailure rejection) { this.rejection = rejection; }
        public CompletionStage<byte[]> getBody() { return result; }
        public void onSubscribe(Flow.Subscription subscription) {
            this.subscription = subscription;
            if (rejection != null) { subscription.cancel(); result.completeExceptionally(rejection); }
            else subscription.request(1);
        }
        public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) {
                if (bytes.size() + buffer.remaining() > 256 * 1024) {
                    subscription.cancel(); result.completeExceptionally(new ModelFailure("MODEL_RESPONSE_LIMIT")); return;
                }
                byte[] chunk = new byte[buffer.remaining()]; buffer.get(chunk); bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }
        public void onError(Throwable throwable) { result.completeExceptionally(throwable); }
        public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
