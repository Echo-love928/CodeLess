package dev.codeless.api.model;

import static org.assertj.core.api.Assertions.*;
import com.sun.net.httpserver.HttpServer;
import dev.codeless.api.agent.RuntimeBudget;
import java.net.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.json.JsonMapper;

/**
 * Real production serialization/HTTP/parsing to loopback with a provider-like output limit (D24-A round 2): a scripted
 * reply whose declared output exceeds the request's max_tokens comes back cut at max_tokens with finish_reason "length",
 * as the paid CAT-03 request did. Replies and token counts are explicit synthetic fixtures, never provider measurements.
 */
public final class MaxTokensWireFixture implements ModelProvider,AutoCloseable {
    /** Content-free record of each request's limit and of the synthetic answer. */
    public record Exchange(String phase,int maxTokens,int promptTokens,int completionTokens,String finishReason,String bodyDigest) {}
    private final JsonMapper json=JsonMapper.builder().build();
    private final HttpServer server;
    private final ExecutorService executor=Executors.newVirtualThreadPerTaskExecutor();
    private final DeepSeekModelProvider transport;
    private final ModelProvider script;
    public final List<Exchange> exchanges=new CopyOnWriteArrayList<>();
    private final List<Throwable> failures=new CopyOnWriteArrayList<>();
    public MaxTokensWireFixture(ModelProvider script) throws Exception {
        this.script=script;server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.setExecutor(executor);
        server.createContext("/chat/completions",exchange->{
            try {
                assertThat(exchange.getRequestMethod()).isEqualTo("POST");
                byte[] bytes=exchange.getRequestBody().readAllBytes();var body=json.readTree(bytes);
                int max=body.path("max_tokens").asInt();
                assertThat(max).isBetween(RuntimeBudget.MIN_OUTPUT_TOKENS,RuntimeBudget.OUTPUT_TOKENS);assertThat(body.path("stream").asBoolean()).isFalse();
                assertThat(body.path("response_format").path("type").asText()).isEqualTo("json_object");
                assertThat(body.path("thinking").path("type").asText()).isEqualTo("disabled");assertThat(body.has("tools")).isFalse();
                var messages=body.path("messages");assertThat(messages).hasSize(2);
                assertThat(messages.get(0).path("role").asText()).isEqualTo("system");assertThat(messages.get(1).path("role").asText()).isEqualTo("user");
                String system=messages.get(0).path("content").asText(),user=messages.get(1).path("content").asText();
                var phase=json.readTree(user).path("phase");
                var reply=script.call(new Prompt(List.of(new SystemMessage(system),new UserMessage(user))),max,Duration.ofSeconds(60));
                var usage=reply.evidence().usage();assertThat(usage.inputTokens()).isNotNull();assertThat(usage.outputTokens()).isNotNull();
                // The provider stops at max_tokens: the text is cut there and only max_tokens are billed.
                boolean cut=usage.outputTokens()>max;int completion=cut?max:usage.outputTokens();
                String content=cut?reply.content().substring(0,(int)((long)reply.content().length()*max/usage.outputTokens())):reply.content();
                var billed=new LinkedHashMap<String,Object>();billed.put("prompt_tokens",usage.inputTokens());billed.put("completion_tokens",completion);
                billed.put("total_tokens",usage.inputTokens()+completion);billed.put("fixture",true);billed.put("measurement","SYNTHETIC_DECLARED_NOT_MEASURED");
                String finish=cut?"length":"stop";
                exchanges.add(new Exchange(phase.isMissingNode()?"PLAN":phase.asText(),max,usage.inputTokens(),completion,finish,
                        "sha256:"+HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes))));
                var response=Map.of("id","offline-wire-"+exchanges.size(),"model","synthetic-loopback-not-provider-evaluation",
                        "choices",List.of(Map.of("finish_reason",finish,"message",Map.of("content",content))),"usage",billed);
                byte[] output=json.writeValueAsBytes(response);exchange.sendResponseHeaders(200,output.length);exchange.getResponseBody().write(output);
            } catch(Throwable failure) {failures.add(failure);try{exchange.sendResponseHeaders(500,-1);}catch(Exception ignored){}}
            finally{exchange.close();}
        });server.start();
        transport=new DeepSeekModelProvider(URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/chat/completions"),"explicit-loopback-fixture-key","offline-budget-fixture");
    }
    public String id(){return "deterministic-mock";}
    public String model(){return script.model()+"-wire";}
    public Map<String,Object> requestMetadata(Prompt prompt,int max){return transport.requestMetadata(prompt,max);}
    public Reply call(Prompt prompt,int max,Duration timeout){return transport.call(prompt,max,timeout);}
    public void assertHealthy(){assertThat(failures).isEmpty();}
    public void close(){server.stop(0);executor.shutdownNow();assertHealthy();}
}
