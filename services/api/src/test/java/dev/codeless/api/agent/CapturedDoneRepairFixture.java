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

/**
 * Named mock over the latest paid 720f proposals/usage and its exact invalid reply. D24-A round 2 modes: "verbatim" replays
 * every recorded reply in order; "patch" replays a recorded REPAIR read only while the request offers it, then skips the
 * remaining recorded reads (no longer solicited) so the recorded patch follows; "wrapped-first" places the exact wrapped
 * done at the first REPAIR request, before any write. No REPAIR request follows an actual patch, so the fixture fails on
 * one. Skipped or placed bytes are never model-quality evidence.
 */
public final class CapturedDoneRepairFixture implements ModelProvider {
    final JsonMapper json=JsonMapper.builder().build();
    final JsonNode recording;
    final String invalid;
    final String mode;
    final Consumer<JsonNode> inject;
    private int cursor;
    public int count;
    public final List<Integer> replayed=new ArrayList<>();
    public final List<Integer> skipped=new ArrayList<>();
    public CapturedDoneRepairFixture(String mode,Consumer<JsonNode> inject) throws Exception {
        assertThat(mode).isIn("verbatim","patch","wrapped-first");this.mode=mode;this.inject=inject;
        Path directory=Path.of("../../tests/agent/repair/fixtures");
        recording=json.readTree(Files.readString(directory.resolve("m1-720f-proposals.json")));
        invalid=Files.readString(directory.resolve("m1-720f-wrapped-done.reply.txt"));
        assertThat(invalid.getBytes(StandardCharsets.UTF_8)).hasSize(657);
        assertThat("sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(invalid.getBytes(StandardCharsets.UTF_8))))
            .isEqualTo(recording.path("protocolResponses").get(11).path("replyDigest").asText());
    }
    public String id(){return "deterministic-mock";}
    public String model(){return "captured-720f-"+mode+"-fixture";}
    /** Recorded measured usage of a replayed reply; skipped replies are never charged. */
    JsonNode recordedUsage(int index){return recording.path("protocolResponses").get(index).path("usage");}
    public Reply call(Prompt prompt,int max,Duration timeout) {
        count++;assertThat(max).isEqualTo(4096);
        var input=json.readTree(prompt.getUserMessage().getText());var replies=recording.path("protocolResponses");
        boolean repair=input.path("phase").asText().equals("REPAIR");
        if(mode.equals("wrapped-first")&&repair)while(cursor<11)skipped.add(cursor++);
        if(mode.equals("patch")&&repair&&!RecordedRepairFixture.offers(input,"files.read"))
            while(replies.get(cursor).path("payload").path("name").asText().equals("files.read"))skipped.add(cursor++);
        assertThat(replayed.stream().anyMatch(i -> replies.get(i).path("payload").path("name").asText().equals("files.update")
                &&replies.get(i).path("stage").asText().equals("REPAIR"))).as("no REPAIR request follows an actual patch").isFalse();
        assertThat(cursor).as("no outer retry or additional model call").isLessThan(replies.size());
        int index=cursor++;replayed.add(index);
        var entry=replies.get(index);
        if(index>0)assertThat(input.path("phase").asText()).isEqualTo(entry.path("stage").asText());
        String content=index==11?invalid:entry.path("payload").toString();var observed=recordedUsage(index);
        var usage=new Usage(observed.path("inputTokens").asInt(),observed.path("outputTokens").asInt(),observed.path("totalTokens").asInt(),
            json.valueToTree(Map.of("fixture",true,"measurement","REPLAY_OF_PRIOR_PAID_USAGE_NOT_NEW_MEASUREMENT","originTask",recording.path("originTask").asText())));
        if(entry.path("stage").asText().equals("GENERATE")&&entry.path("payload").path("type").asText().equals("done"))inject.accept(entry.path("payload"));
        return new Reply(content,new Evidence(model(),"offline-720f-"+index,"offline-720f-"+index,usage));
    }
}
