package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.model.ModelProvider;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.function.Consumer;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Explicit offline fixture: recorded proposals/usage; optional synthetic patch.
 * D24-A round 2: REPAIR seeds the failed candidate's own bytes, offers reads only while a full-size patch stays fundable,
 * and ends the proposal at the first actual change. "loop" replays every recorded reply verbatim, so a recorded read the
 * request no longer offers reaches the host's refusal. The other modes replay a recorded REPAIR read only while the request
 * offers it; the remaining recorded reads are then skipped (the host no longer solicits them) and the next recorded
 * non-read reply, or the synthetic patch, follows. Skipping reorders recorded bytes, so it is never model-quality evidence.
 */
public final class RecordedRepairFixture implements ModelProvider {
    private static final String PAGE="src/pages/HomePage.vue";
    private final JsonMapper json=JsonMapper.builder().build();
    private final JsonNode recorded;
    private final Consumer<JsonNode> injectFault;
    private final String mode;
    private int cursor;
    private boolean patched;
    public int count;
    /** Recorded index of the latest replayed reply, or -1 after the synthetic patch. */
    public int replayed=-1;
    public final List<Integer> skipped=new ArrayList<>();
    public final List<JsonNode> inputs=new ArrayList<>();
    public RecordedRepairFixture(String mode,Consumer<JsonNode> injectFault) {
        this(mode,injectFault,RepairContextTest.RECORD);
    }
    public RecordedRepairFixture(String mode,Consumer<JsonNode> injectFault,Path directory) {
        this.mode=mode;this.injectFault=injectFault;
        try{recorded=json.readTree(Files.readString(directory.resolve("acceptance.json")));}
        catch(Exception failure){throw new IllegalStateException(failure);}
    }
    public String id(){return "deterministic-mock";}
    public String model(){return "recorded-m1-"+mode+"-offline-fixture";}
    /** Recorded measured usage of a replayed reply; skipped replies are never charged. */
    public JsonNode recordedUsage(int index){return recorded.path("usage").get(index).path("usage");}
    static boolean offers(JsonNode input,String tool) {
        return input.path("tools").valueStream().anyMatch(t -> t.path("name").asText().equals(tool));
    }
    public Reply call(Prompt prompt,int max,Duration timeout) {
        assertThat(max).isEqualTo(4096);var input=json.readTree(prompt.getUserMessage().getText());inputs.add(input);int call=count++;
        JsonNode reply;Usage usage;
        var replies=recorded.path("protocolResponses");
        boolean invalidLast=!Set.of("tool","done").contains(replies.get(replies.size()-1).path("payload").path("type").asText());
        int replayLimit=replies.size()-(invalidLast&&!mode.equals("recorded-invalid")?1:0);
        if(!mode.equals("loop")&&input.path("phase").asText().equals("REPAIR")&&!offers(input,"files.read"))
            while(cursor<replayLimit&&replies.get(cursor).path("payload").path("name").asText().equals("files.read"))skipped.add(cursor++);
        if(cursor<replayLimit) {
            int index=cursor++;replayed=index;
            var record=replies.get(index);reply=record.path("payload");
            if(!record.path("stage").asText().equals("PLAN"))assertThat(input.path("phase").asText()).isEqualTo(record.path("stage").asText());
            var measured=recordedUsage(index);
            for(String field:List.of("inputTokens","outputTokens","totalTokens"))assertThat(measured.path(field).isIntegralNumber()).isTrue();
            usage=new Usage(measured.path("inputTokens").asInt(),measured.path("outputTokens").asInt(),measured.path("totalTokens").asInt(),
                    json.valueToTree(Map.of("fixture",true,"measurement","REPLAY_OF_PRIOR_PAID_USAGE_NOT_NEW_MEASUREMENT","originTask",recorded.path("task").path("id").asText())));
            if(record.path("stage").asText().equals("GENERATE")&&reply.path("type").asText().equals("done"))injectFault.accept(reply);
        } else if(!patched) {
            assertThat(mode).isNotEqualTo("recorded-invalid");patched=true;replayed=-1;
            assertThat(input.path("phase").asText()).isEqualTo("REPAIR");
            assertThat(input.path("budget").path("modelCallsRemaining").asInt()).isEqualTo(12-call);
            assertThat(input.path("repairProgress").path("next").asText()).startsWith("PATCH_");
            if(mode.equals("loop"))reply=json.valueToTree(Map.of("type","tool","name","files.read","arguments",Map.of("path",PAGE)));
            else {
                // The failed page is in context either as a genuine read receipt or as a seeded frozen repair source.
                String content=null,digest=null;
                for(var observed:input.path("observations"))if(observed.path("tool").asText().equals("files.read")&&observed.path("path").asText().equals(PAGE)
                        &&observed.path("content").isString()){content=observed.path("content").asText();digest=observed.path("afterDigest").asText();}
                for(var source:input.path("repairSources").path("files"))if(source.path("path").asText().equals(PAGE))
                    {content=source.path("content").asText();digest=source.path("digest").asText();}
                assertThat(content).contains("M1MissingCard.vue");
                reply=json.valueToTree(Map.of("type","tool","name","files.update","arguments",Map.of("path",PAGE,
                        "content",content.replace("M1MissingCard.vue","ProfileCard.vue"),"expectedDigest",digest)));
            }
            usage=mode.equals("unknown-patch")?Usage.unknown():new Usage(4156,1024,5180,json.valueToTree(Map.of("fixture",true,"measurement","SYNTHETIC_FUTURE_SCENARIO")));
        } else throw new AssertionError("No outer retry, and no model call after an actual patch (D24-A round 2)");
        return new Reply(reply.toString(),new Evidence(model(),"offline-fixture-"+call,"offline-fixture-"+call,usage));
    }
}
