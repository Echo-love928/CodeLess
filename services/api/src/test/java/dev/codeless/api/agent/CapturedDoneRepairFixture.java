package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.model.ModelProvider;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import java.util.function.Consumer;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Named mock: latest paid proposals/usage, exact invalid reply, or an explicitly synthetic legal completion. */
public final class CapturedDoneRepairFixture implements ModelProvider {
    final JsonMapper json=JsonMapper.builder().build();
    final JsonNode recording;
    final String invalid;
    final boolean legalCompletion;
    final Consumer<JsonNode> inject;
    public int count;
    public CapturedDoneRepairFixture(boolean legalCompletion,Consumer<JsonNode> inject) throws Exception {
        this.legalCompletion=legalCompletion;this.inject=inject;
        Path directory=Path.of("../../tests/agent/repair/fixtures");
        recording=json.readTree(Files.readString(directory.resolve("m1-720f-proposals.json")));
        invalid=Files.readString(directory.resolve("m1-720f-wrapped-done.reply.txt"));
        assertThat(invalid.getBytes(StandardCharsets.UTF_8)).hasSize(657);
        assertThat("sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(invalid.getBytes(StandardCharsets.UTF_8))))
            .isEqualTo(recording.path("protocolResponses").get(11).path("replyDigest").asText());
    }
    public String id(){return "deterministic-mock";}
    public String model(){return "captured-720f-"+(legalCompletion?"synthetic-done":"wrapped-done-replay")+"-fixture";}
    public Reply call(Prompt prompt,int max,Duration timeout) {
        int index=count++;assertThat(index).isLessThan(legalCompletion?10:12);assertThat(max).isEqualTo(4096);
        var input=json.readTree(prompt.getUserMessage().getText());String content;Usage usage;
        if(legalCompletion&&index==9) {
            assertThat(input.path("repairProgress").path("sourceChanged").asBoolean()).isTrue();
            assertThat(input.path("repairProgress").path("next").asText()).isEqualTo("PROPOSE_COMPLETION_OR_NECESSARY_PATCH");
            assertThat(input.path("completionProposal").path("actions")).isEqualTo(recording.path("protocolResponses").get(5).path("payload").path("actions"));
            assertThat(input.path("observations").valueStream().filter(o->o.path("tool").asText().equals("files.update")).findFirst().orElseThrow()
                .path("committedContent").asText()).contains("../components/ProfileCard.vue");
            assertThat(input.path("observations").valueStream().filter(o->o.path("path").asText().equals("src/components/ProfileCard.vue")).findFirst().orElseThrow()
                .path("content").asText()).contains("defineProps");
            content=input.path("completionProposal").toString();usage=Usage.unknown();
        } else {
            var entry=recording.path("protocolResponses").get(index);
            if(index>0)assertThat(input.path("phase").asText()).isEqualTo(entry.path("stage").asText());
            content=index==11?invalid:entry.path("payload").toString();var observed=entry.path("usage");
            usage=new Usage(observed.path("inputTokens").asInt(),observed.path("outputTokens").asInt(),observed.path("totalTokens").asInt(),
                json.valueToTree(Map.of("fixture",true,"measurement","REPLAY_OF_PRIOR_PAID_USAGE_NOT_NEW_MEASUREMENT","originTask",recording.path("originTask").asText())));
            if(entry.path("stage").asText().equals("GENERATE")&&entry.path("payload").path("type").asText().equals("done"))inject.accept(entry.path("payload"));
        }
        return new Reply(content,new Evidence(model(),"offline-720f-"+index,"offline-720f-"+index,usage));
    }
}
