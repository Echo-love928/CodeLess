package dev.codeless.api.agent;

import dev.codeless.api.model.ModelProvider;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.function.Consumer;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Explicit offline setup: prior PR31 first eight replies, exact 17cc final bytes and its recorded usage. */
final class DuplicateTypeRepairFixture implements ModelProvider {
    final RecordedRepairFixture setup;
    final JsonMapper json=JsonMapper.builder().build();
    final JsonNode provenance;
    final String invalidReply;
    int count;
    DuplicateTypeRepairFixture(Consumer<JsonNode> injectFault) throws Exception {
        Path directory=Path.of("../../tests/agent/repair/fixtures");
        provenance=json.readTree(Files.readString(directory.resolve("m1-17cc-duplicate-type.provenance.json")));
        invalidReply=Files.readString(directory.resolve("m1-17cc-duplicate-type.reply.txt"));
        byte[] bytes=invalidReply.getBytes(StandardCharsets.UTF_8);
        assertThat(bytes).hasSize(2575);
        assertThat("sha256:"+HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)))
                .isEqualTo(provenance.path("replyDigest").asText());
        setup=new RecordedRepairFixture("recorded-invalid",injectFault,Path.of("../../docs/evidence/D10/M1/17f440cf-7970-46cc-b598-dd2d91a20ade"));
    }
    public String id(){return "deterministic-mock";}
    public String model(){return "exact-17cc-duplicate-reply-offline-fixture";}
    public Reply call(Prompt prompt,int max,Duration timeout) {
        int index=count++;assertThat(index).isLessThan(9);assertThat(max).isEqualTo(4096);
        String content=index<8?setup.call(prompt,max,timeout).content():invalidReply;
        if(index==8) {
            var input=json.readTree(prompt.getUserMessage().getText());
            assertThat(input.path("phase").asText()).isEqualTo("REPAIR");assertThat(input.path("observations")).hasSize(2);
            assertThat(input.path("budget").path("tokensRemaining").asInt()).isEqualTo(25208);
        }
        var value=provenance.path("usage").get(index);
        var usage=new Usage(value.path("inputTokens").asInt(),value.path("outputTokens").asInt(),value.path("totalTokens").asInt(),
                json.valueToTree(Map.of("fixture",true,"measurement","REPLAY_OF_PRIOR_PAID_USAGE_NOT_NEW_MEASUREMENT","originTask",provenance.path("originTask").asText())));
        return new Reply(content,new Evidence(model(),"offline-17cc-"+index,"offline-17cc-"+index,usage));
    }
}
