package dev.codeless.api.model;

import static org.assertj.core.api.Assertions.*;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.json.JsonMapper;

class PrivateModelCaptureTest {
    @TempDir Path root;
    final JsonMapper json=JsonMapper.builder().build();final AtomicInteger calls=new AtomicInteger();
    HttpServer server;byte[] body;int status=200;boolean measured;
    final String invalid="{\"type\":\"json_object\",\"error\":\"Invalid protocol reply.\"}";
    @BeforeEach void start() throws Exception {
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/chat/completions",exchange->{calls.incrementAndGet();body=exchange.getRequestBody().readAllBytes();
            var payload=new LinkedHashMap<String,Object>();payload.put("id","explicit-offline-capture-fixture");payload.put("model","offline-capture-fixture");
            payload.put("choices",List.of(Map.of("finish_reason","stop","message",Map.of("content",invalid))));
            if(measured)payload.put("usage",Map.of("prompt_tokens",12,"completion_tokens",7,"total_tokens",19));
            byte[] response=json.writeValueAsBytes(payload);
            exchange.sendResponseHeaders(status,response.length);exchange.getResponseBody().write(response);exchange.close();});server.start();
    }
    @AfterEach void stop(){server.stop(0);}
    PrivateModelCapture capture(){return new PrivateModelCapture(new DeepSeekModelProvider(URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/chat/completions"),"explicit-fake-key-not-to-be-captured","offline-capture-fixture"),root.resolve("wire"));}
    Prompt prompt(){return new Prompt(List.of(new SystemMessage("json application operation"),new UserMessage("untrusted source and repair input")));}
    @Test void exactRequestBytesAndCompleteInvalidReplyAreCapturedWithoutHeadersKeyOrRetry() throws Exception {
        var provider=capture();var metadata=provider.requestMetadata(prompt(),4096);assertThat(calls).hasValue(0);
        var reply=provider.call(prompt(),4096,Duration.ofSeconds(5));assertThat(calls).hasValue(1);assertThat(reply.content()).isEqualTo(invalid);
        byte[] captured=Files.readAllBytes(root.resolve("wire/01-request.json"));assertThat(captured).isEqualTo(body);
        assertThat(metadata.get("bodyDigest")).isEqualTo("sha256:"+HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(captured)));
        assertThat(new String(captured,StandardCharsets.UTF_8)).doesNotContain("explicit-fake-key-not-to-be-captured","Authorization");
        var result=json.readTree(Files.readString(root.resolve("wire/01-result.json")));assertThat(result.path("replyContent").asText()).isEqualTo(invalid);
        assertThat(result.path("qualityAccepted").asBoolean()).isFalse();assertThat(result.path("evidence").path("usage").path("totalTokens").isNull()).isTrue();
    }
    @Test void failedTransportRetainsOriginalFailureAndUnknownReplyWithoutRetry() throws Exception {
        status=503;var provider=capture();assertThatThrownBy(()->provider.call(prompt(),4096,Duration.ofSeconds(5))).isInstanceOf(ModelFailure.class).hasMessage("MODEL_UNAVAILABLE");
        assertThat(calls).hasValue(1);var result=json.readTree(Files.readString(root.resolve("wire/01-result.json")));
        assertThat(result.path("status").asText()).isEqualTo("FAILED");assertThat(result.path("code").asText()).isEqualTo("MODEL_UNAVAILABLE");assertThat(result.path("replyCaptured").asBoolean()).isFalse();
    }
    @Test void captureWriteFailureStopsBeforeDispatchAndCannotOverwriteEvidence() throws Exception {
        var provider=capture();Files.createDirectory(root.resolve("wire/01-request.json"));
        assertThatThrownBy(()->provider.call(prompt(),4096,Duration.ofSeconds(5))).isInstanceOf(IllegalStateException.class).hasMessage("MODEL_CAPTURE_UNAVAILABLE");
        assertThat(calls).hasValue(0);assertThat(Files.isDirectory(root.resolve("wire/01-request.json"))).isTrue();
    }
    @Test void replyCaptureFailureRetainsMeasuredUsageAndDoesNotDispatchAgain() throws Exception {
        measured=true;var provider=capture();Files.createDirectory(root.resolve("wire/01-result.json"));
        var failure=catchThrowableOfType(ModelFailure.class,()->provider.call(prompt(),4096,Duration.ofSeconds(5)));
        assertThat(failure.code()).isEqualTo("MODEL_CAPTURE_UNAVAILABLE");assertThat(failure.evidence().usage().totalTokens()).isEqualTo(19);
        assertThat(calls).hasValue(1);assertThat(Files.isRegularFile(root.resolve("wire/01-request.json"))).isTrue();
    }
}
