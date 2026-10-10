package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.model.ModelProvider.Usage;
import dev.codeless.api.tools.FileToolRegistry;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Recorded paid data is read-only. Future patch/done charges below are explicit synthetic scenarios. */
class RepairContextTest {
    static final Path RECORD=Path.of("../../docs/evidence/D10/M1/45d37a80-c152-4672-9c0c-1fcf425fa014");
    final JsonMapper json=JsonMapper.builder().build();
    JsonNode doc() throws Exception{return json.readTree(Files.readString(RECORD.resolve("event-replay.json")));}
    JsonNode latest(JsonNode doc,String kind){JsonNode found=null;for(var event:doc.path("events"))if(event.path("kind").asText().equals(kind))found=event.path("payload");return Objects.requireNonNull(found);}
    List<JsonNode> results(JsonNode doc){var out=new ArrayList<JsonNode>();for(var event:doc.path("events"))if(event.path("stage").asText().equals("REPAIR")&&event.path("kind").asText().equals("tool.result"))out.add(event.path("payload"));return out;}
    List<JsonNode> proposals() throws Exception {var out=new ArrayList<JsonNode>();for(var reply:json.readTree(Files.readString(RECORD.resolve("acceptance.json"))).path("protocolResponses"))if(reply.path("stage").asText().equals("REPAIR"))out.add(reply.path("payload"));return out;}
    String policy() throws Exception{return new ClassPathResource("model/prompts/repair/agent-repair-v1.txt").getContentAsString(StandardCharsets.UTF_8);}
    JsonNode input(JsonNode doc,List<JsonNode> observed,RepairContext context) {
        return input(doc,observed,context,new RuntimeBudget.Meter(10,13,31596));
    }
    JsonNode input(JsonNode doc,List<JsonNode> observed,RepairContext context,RuntimeBudget.Meter meter) {
        var draft=latest(doc,"draft");var in=new LinkedHashMap<String,Object>();in.put("phase","REPAIR");in.put("request",doc.path("task").path("prompt").asText());in.put("dataMode","STATIC");
        in.put("plan",latest(doc,"plan"));in.put("tools",new FileToolRegistry().definitions().path("tools"));in.put("observations",context==null?observed:context.observations());
        in.put("failure",latest(doc,"repair.failure"));in.put("originalActions",draft.path("actions"));in.put("sourceFiles",context==null?draft.path("files"):context.sourceFiles());in.put("repairAttempt",1);
        if(context!=null){in.put("repairProgress",context.progress());in.put("budget",Map.of("modelCallsRemaining",12-meter.models(),"toolCallsRemaining",20-meter.tools(),"tokensRemaining",50000-meter.chargedTokens()));}return json.valueToTree(in);
    }
    int reservation(JsonNode doc,RepairContext context) throws Exception{return RuntimeBudget.inputReservation(policy(),input(doc,List.of(),context).toString())+RuntimeBudget.OUTPUT_TOKENS;}
    int reservation(JsonNode doc,RepairContext context,RuntimeBudget.Meter meter) throws Exception{return RuntimeBudget.inputReservation(policy(),input(doc,List.of(),context,meter).toString())+RuntimeBudget.OUTPUT_TOKENS;}
    RepairContext replay(JsonNode doc) throws Exception {var context=new RepairContext(latest(doc,"draft"));var ops=proposals();var actual=results(doc);assertThat(ops).hasSize(4);for(int i=0;i<4;i++)context.observe(ops.get(i).path("name").asText(),ops.get(i).path("arguments"),actual.get(i));return context;}
    JsonNode writeResult(JsonNode read) {
        var actual=(tools.jackson.databind.node.ObjectNode)read.deepCopy();actual.putNull("content");actual.put("afterDigest","sha256:"+"a".repeat(64));
        var source=(tools.jackson.databind.node.ObjectNode)actual.path("source");source.put("sourceDigest","sha256:"+"b".repeat(64));
        for(var file:source.path("files"))if(file.path("path").asText().equals("src/pages/HomePage.vue"))((tools.jackson.databind.node.ObjectNode)file).put("digest",actual.path("afterDigest").asText());return actual;
    }
    @Test void oldRecordingExactlyReproducesAllReservationsAndTheCorrectStop() throws Exception {
        var doc=doc();String old=Files.readString(Path.of("../../tests/agent/repair/fixtures/m1-repair-policy-before.txt"));var observations=new ArrayList<JsonNode>();var reservations=new ArrayList<Integer>();
        for(var event:doc.path("events"))if(event.path("stage").asText().equals("REPAIR")){
            if(event.path("kind").asText().equals("model.request")){int reserve=RuntimeBudget.inputReservation(old,input(doc,observations,null).toString())+4096;assertThat(reserve).isEqualTo(event.path("payload").path("reservedTokens").asInt());reservations.add(reserve);}
            if(event.path("kind").asText().equals("tool.result"))observations.add(event.path("payload"));
        }
        var events=new ArrayList<JsonNode>();doc.path("events").forEach(events::add);var meter=RuntimeBudget.meter(events);
        assertThat(reservations).containsExactly(12332,13962,15458,17089);assertThat(meter).isEqualTo(new RuntimeBudget.Meter(10,13,31596));
        assertThat(RuntimeBudget.inputReservation(old,input(doc,observations,null).toString())+4096).isEqualTo(18720);assertThat(31596+18720).isGreaterThan(50000);
    }
    @Test void recordedRepeatedReadsLeaveRoomForPatchAndConservativelyChargedDone() throws Exception {
        var doc=doc();var context=replay(doc);int patchReservation=reservation(doc,context);
        assertThat(context.observations()).hasSize(2);assertThat(context.progress().get("repeatedReads")).isEqualTo(2);assertThat(context.progress().get("next")).isEqualTo("PATCH_USING_OBSERVED_DIGEST");
        assertThat(context.observations()).allSatisfy(o->{assertThat(o.has("source")).isFalse();assertThat(o.path("path").asText()).isNotBlank();assertThat(o.path("content").isTextual()).isTrue();});
        assertThat(patchReservation).isLessThanOrEqualTo(18404);
        // B's original last read input count plus a declared synthetic 1024-token patch output, NOT a new paid observation.
        var patchUsage=new Usage(4156,1024,5180,json.valueToTree(Map.of("fixture",true,"measurement","SYNTHETIC_FUTURE_SCENARIO")));
        var patchCharge=RuntimeBudget.charge(patchUsage,patchReservation-4096);assertThat(patchCharge.estimated()).isFalse();
        context.observe("files.update",json.valueToTree(Map.of("path","src/pages/HomePage.vue")),writeResult(results(doc).getLast()));
        var afterPatch=new RuntimeBudget.Meter(11,14,31596+patchCharge.chargedTokens());
        int doneReservation=reservation(doc,context,afterPatch);var doneCharge=RuntimeBudget.charge(Usage.unknown(),doneReservation-4096);
        assertThat(doneCharge.estimated()).isTrue();assertThat(doneCharge.chargedTokens()).isEqualTo(doneReservation);
        var report=Map.of("originTask",doc.path("task").path("id").asText(),"offlineOnly",true,"paidCalls",0,"originalPaidMeter",new RuntimeBudget.Meter(10,13,31596),
                "patchReservation",patchReservation,"patchChargeSynthetic",patchCharge,"doneReservation",doneReservation,"doneChargeEstimated",doneCharge,"projectedTotal",31596+patchCharge.chargedTokens()+doneCharge.chargedTokens(),"newInput",input(doc,List.of(),context,afterPatch));
        Files.createDirectories(Path.of("target/repair-context"));Files.writeString(Path.of("target/repair-context/recorded-budget.json"),json.writeValueAsString(report));
        assertThat(31596+patchCharge.chargedTokens()+doneReservation).isLessThanOrEqualTo(50000);
    }
    @Test void unknownPatchUsageKeepsItsFullReservationAndMayCorrectlyPreventDone() throws Exception {
        var doc=doc();var context=replay(doc);int reserve=reservation(doc,context);var charge=RuntimeBudget.charge(Usage.unknown(),reserve-4096);
        assertThat(charge.estimated()).isTrue();assertThat(charge.chargedTokens()).isEqualTo(reserve);
        context.observe("files.update",json.valueToTree(Map.of("path","src/pages/HomePage.vue")),writeResult(results(doc).getLast()));
        assertThat(31596+charge.chargedTokens()+reservation(doc,context,new RuntimeBudget.Meter(11,14,31596+charge.chargedTokens()))).isGreaterThan(50000);
    }
    @Test void unchangedReadLoopStopsAndActualSourceProgressAllowsAFreshRead() throws Exception {
        var doc=doc();var context=new RepairContext(latest(doc,"draft"));var result=results(doc).getFirst();var args=proposals().getFirst().path("arguments");
        assertThat(context.progress().get("next")).isEqualTo("READ_REQUIRED_DEPENDENCIES_ONCE");
        context.observe("files.read",args,result);assertThat(context.progress().get("next")).isEqualTo("PATCH_OR_READ_MISSING_DEPENDENCY");
        context.observe("files.read",args,result);context.observe("files.read",args,result);
        assertThatThrownBy(()->context.observe("files.read",args,result)).isInstanceOf(AgentFailure.class).hasMessage("AGENT_REPAIR_NO_PROGRESS");
        var changed=writeResult(result);context.observe("files.update",args,changed);assertThat(context.observations().getFirst().path("stale").asBoolean()).isTrue();assertThat(context.observations().getFirst().path("content").isNull()).isTrue();
        var fresh=(tools.jackson.databind.node.ObjectNode)changed.deepCopy();fresh.put("content","fresh actual text");fresh.put("beforeDigest",fresh.path("afterDigest").asText());context.observe("files.read",args,fresh);
        assertThat(context.observations().getFirst().path("content").asText()).isEqualTo("fresh actual text");assertThat(context.progress().get("repeatedReads")).isEqualTo(0);
    }
    @Test void differentPathsWithIdenticalBytesAreNotMergedAndLargeReadsAreNotTruncated() throws Exception {
        var doc=doc();var context=new RepairContext(latest(doc,"draft"));var huge=(tools.jackson.databind.node.ObjectNode)results(doc).getFirst().deepCopy();huge.put("content","x".repeat(131072));
        for(String path:List.of("src/pages/HomePage.vue","src/components/ProfileCard.vue"))context.observe("files.read",json.valueToTree(Map.of("path",path)),huge);
        assertThat(context.observations()).hasSize(2);assertThat(context.observations()).allSatisfy(o->assertThat(o.path("content").asText()).hasSize(131072));assertThat(reservation(doc,context)).isGreaterThan(50000);
    }
}
