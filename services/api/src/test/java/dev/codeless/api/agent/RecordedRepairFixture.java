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

/** Explicit offline fixture: recorded proposals/usage; optional synthetic patch and unknown-usage done. */
public final class RecordedRepairFixture implements ModelProvider {
    private final JsonMapper json=JsonMapper.builder().build();
    private final JsonNode recorded;
    private final Consumer<JsonNode> injectFault;
    private final String mode;
    public int count;
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
    public Reply call(Prompt prompt,int max,Duration timeout) {
        assertThat(max).isEqualTo(4096);var input=json.readTree(prompt.getUserMessage().getText());inputs.add(input);int index=count++;
        JsonNode reply;Usage usage;
        var replies=recorded.path("protocolResponses");
        boolean invalidLast=!Set.of("tool","done").contains(replies.get(replies.size()-1).path("payload").path("type").asText());
        int replayLimit=replies.size()-(invalidLast&&!mode.equals("recorded-invalid")?1:0);
        if(index<replayLimit) {
            var record=recorded.path("protocolResponses").get(index);reply=record.path("payload");
            if(!record.path("stage").asText().equals("PLAN"))assertThat(input.path("phase").asText()).isEqualTo(record.path("stage").asText());
            var measured=recorded.path("usage").get(index).path("usage");
            for(String field:List.of("inputTokens","outputTokens","totalTokens"))assertThat(measured.path(field).isIntegralNumber()).isTrue();
            usage=new Usage(measured.path("inputTokens").asInt(),measured.path("outputTokens").asInt(),measured.path("totalTokens").asInt(),
                    json.valueToTree(Map.of("fixture",true,"measurement","REPLAY_OF_PRIOR_PAID_USAGE_NOT_NEW_MEASUREMENT","originTask",recorded.path("task").path("id").asText())));
            if(record.path("stage").asText().equals("GENERATE")&&reply.path("type").asText().equals("done"))injectFault.accept(reply);
        } else if(index==replayLimit) {
            assertThat(mode).isNotEqualTo("recorded-invalid");
            assertThat(input.path("phase").asText()).isEqualTo("REPAIR");
            assertThat(input.path("budget").path("modelCallsRemaining").asInt()).isEqualTo(12-index);
            assertThat(input.path("observations")).hasSize(2);assertThat(input.path("repairProgress").path("next").asText()).startsWith("PATCH_");
            if(mode.equals("loop"))reply=json.valueToTree(Map.of("type","tool","name","files.read","arguments",Map.of("path","src/pages/HomePage.vue")));
            else {
                JsonNode read=null;for(var observed:input.path("observations"))if(observed.path("tool").asText().equals("files.read")&&observed.path("path").asText().equals("src/pages/HomePage.vue"))read=observed;
                assertThat(read).isNotNull();assertThat(read.path("content").asText()).contains("M1MissingCard.vue");
                reply=json.valueToTree(Map.of("type","tool","name","files.update","arguments",Map.of("path","src/pages/HomePage.vue",
                        "content",read.path("content").asText().replace("M1MissingCard.vue","ProfileCard.vue"),"expectedDigest",read.path("afterDigest").asText())));
            }
            usage=mode.equals("unknown-patch")?Usage.unknown():new Usage(4156,1024,5180,json.valueToTree(Map.of("fixture",true,"measurement","SYNTHETIC_FUTURE_SCENARIO")));
        } else if(index==replayLimit+1) {
            assertThat(input.path("budget").path("modelCallsRemaining").asInt()).isEqualTo(12-index);
            assertThat(input.path("repairProgress").path("sourceChanged").asBoolean()).isTrue();
            reply=json.valueToTree(Map.of("type","done","actions",input.path("originalActions")));usage=Usage.unknown();
        } else throw new AssertionError("No outer retry or additional model calls permitted");
        return new Reply(reply.toString(),new Evidence(model(),"offline-fixture-"+index,"offline-fixture-"+index,usage));
    }
}
