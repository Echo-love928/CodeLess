package dev.codeless.api.model;

import static org.assertj.core.api.Assertions.*;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Real production serialization/HTTP/parsing to loopback. Model replies are explicitly offline fixtures. */
public final class RecordedRepairWireFixture implements ModelProvider,AutoCloseable {
    private final JsonMapper json=JsonMapper.builder().build();
    private final HttpServer server;
    private final ExecutorService executor=Executors.newVirtualThreadPerTaskExecutor();
    private final DeepSeekModelProvider transport;
    private final ModelProvider fixture;
    public final List<JsonNode> requests=new CopyOnWriteArrayList<>();
    public final List<String> digests=new CopyOnWriteArrayList<>();
    private final List<Throwable> failures=new CopyOnWriteArrayList<>();
    public RecordedRepairWireFixture(ModelProvider fixture) throws Exception {
        this.fixture=fixture;server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.setExecutor(executor);
        server.createContext("/chat/completions",exchange->{
            try {
                assertThat(exchange.getRequestMethod()).isEqualTo("POST");
                byte[] bytes=exchange.getRequestBody().readAllBytes();var body=json.readTree(bytes);requests.add(body);
                digests.add("sha256:"+HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)));
                assertThat(body.path("max_tokens").asInt()).isEqualTo(4096);assertThat(body.path("stream").asBoolean()).isFalse();
                assertThat(body.path("response_format").path("type").asText()).isEqualTo("json_object");
                assertThat(body.path("thinking").path("type").asText()).isEqualTo("disabled");assertThat(body.has("tools")).isFalse();
                var messages=body.path("messages");assertThat(messages).hasSize(2);
                assertThat(messages.get(0).path("role").asText()).isEqualTo("system");assertThat(messages.get(1).path("role").asText()).isEqualTo("user");
                var prompt=new Prompt(List.of(new SystemMessage(messages.get(0).path("content").asText()),new UserMessage(messages.get(1).path("content").asText())));
                var reply=fixture.call(prompt,4096,Duration.ofSeconds(60));var usage=reply.evidence().usage();var billed=new LinkedHashMap<String,Object>();
                if(usage.inputTokens()!=null)billed.put("prompt_tokens",usage.inputTokens());if(usage.outputTokens()!=null)billed.put("completion_tokens",usage.outputTokens());if(usage.totalTokens()!=null)billed.put("total_tokens",usage.totalTokens());
                billed.put("fixture",true);billed.put("measurement",usage.raw()==null?"UNKNOWN_ESTIMATED":usage.raw().path("measurement").asText());
                var response=Map.of("id","offline-wire-"+requests.size(),"model","recorded-loopback-not-provider-evaluation",
                        "choices",List.of(Map.of("finish_reason","stop","message",Map.of("content",reply.content()))),"usage",billed);
                byte[] output=json.writeValueAsBytes(response);exchange.sendResponseHeaders(200,output.length);exchange.getResponseBody().write(output);
            } catch(Throwable failure) {failures.add(failure);try{exchange.sendResponseHeaders(500,-1);}catch(Exception ignored){}}
            finally{exchange.close();}
        });server.start();
        transport=new DeepSeekModelProvider(URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/chat/completions"),"explicit-loopback-fixture-key","offline-repair-fixture");
    }
    public String id(){return "deterministic-mock";}
    public String model(){return fixture.model()+"-wire";}
    public Map<String,Object> requestMetadata(Prompt prompt,int max){return transport.requestMetadata(prompt,max);}
    public Reply call(Prompt prompt,int max,Duration timeout){return transport.call(prompt,max,timeout);}
    public void assertHealthy(){assertThat(failures).isEmpty();}
    public void close(){server.stop(0);executor.shutdownNow();assertHealthy();}
}
