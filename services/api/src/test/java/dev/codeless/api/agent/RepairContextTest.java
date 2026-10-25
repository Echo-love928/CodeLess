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
    @Test void compactCompletionFundsARequestWithoutChangingOriginalActionsOrAnySourceEvidence() {
        var actions=json.createArrayNode();
        actions.addObject().put("type","navigate").put("path","/");
        for(int i=0;i<16;i++) actions.addObject().put("type","expectText").put("value","独立完整行为断言".repeat(20));
        var original=actions.deepCopy();
        var input=json.valueToTree(Map.of("completionProposal",Map.of("type","done","actions",actions),
                "failure",Map.of("failedAction",Map.of("index",3,"action",actions.get(3))),
                "observations",List.of(Map.of("content","real dependency content","afterDigest","observed")),
                "sourceFiles",List.of(Map.of("path","src/pages/HomePage.vue","digest","current")),"tools",List.of("files.update")));
        var saved=input.deepCopy();var compact=RepairContext.compactCompletion(input,actions);
        var meter=new RuntimeBudget.Meter(9,11,40050);
        assertThat(RuntimeBudget.outputAllowance(meter,RuntimeBudget.inputReservation("policy",input.toString()))).isNull();
        assertThat(RuntimeBudget.outputAllowance(meter,RuntimeBudget.inputReservation("policy",compact.toString()))).isEqualTo(4096);
        for(String field:List.of("failure","observations","sourceFiles","tools")) assertThat(compact.path(field)).isEqualTo(input.path(field));
        assertThat(compact.path("completionProposal")).isEqualTo(json.valueToTree(Map.of("type","done")));
        assertThat(compact.path("originalAcceptance").path("actionCount").asInt()).isEqualTo(17);
        assertThat(compact.path("originalAcceptance").path("digest").asText()).startsWith("sha256:");
        assertThat(actions).isEqualTo(original);assertThat(input).isEqualTo(saved);
    }
    @Test void compactProjectionNeverInflatesAnAlreadySmallCompletionProposal() {
        var actions=json.createArrayNode();var input=json.valueToTree(Map.of("completionProposal",Map.of("type","done","actions",actions)));
        assertThat(RepairContext.compactCompletion(input,actions)).isEqualTo(input);
    }
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
        boolean completionOnly=context!=null&&Boolean.TRUE.equals(context.progress().get("sourceChanged"))&&12-meter.models()==1;
        in.put("plan",context==null?latest(doc,"plan"):RepairContext.planProjection(latest(doc,"plan")));in.put("tools",completionOnly?List.of():new FileToolRegistry().definitions().path("tools"));in.put("observations",context==null?observed:context.observations());
        in.put("failure",latest(doc,"repair.failure"));
        if(context==null)in.put("originalActions",draft.path("actions")); // Exact historical request reproduction remains unchanged.
        else in.put("completionProposal",Map.of("type","done","actions",draft.path("actions")));
        in.put("sourceFiles",context==null?draft.path("files"):context.sourceFiles());in.put("repairAttempt",1);
        if(context!=null){if(completionOnly)in.put("completionOnly",true);in.put("repairProgress",context.progress());in.put("budget",Map.of("modelCallsRemaining",12-meter.models(),"toolCallsRemaining",20-meter.tools(),"tokensRemaining",50000-meter.chargedTokens()));}return json.valueToTree(in);
    }
    int reservation(JsonNode doc,RepairContext context) throws Exception{return RuntimeBudget.inputReservation(policy(),input(doc,List.of(),context).toString())+RuntimeBudget.OUTPUT_TOKENS;}
    int reservation(JsonNode doc,RepairContext context,RuntimeBudget.Meter meter) throws Exception{return RuntimeBudget.inputReservation(policy(),input(doc,List.of(),context,meter).toString())+RuntimeBudget.OUTPUT_TOKENS;}
    RepairContext replay(JsonNode doc) throws Exception {var context=new RepairContext(latest(doc,"draft"));var ops=proposals();var actual=results(doc);assertThat(ops).hasSize(4);for(int i=0;i<4;i++)context.observe(ops.get(i).path("name").asText(),ops.get(i).path("arguments"),actual.get(i));return context;}
    JsonNode writeResult(JsonNode read) {
        String content=read.path("content").asText().replace("M1MissingCard.vue","ProfileCard.vue");
        var actual=(tools.jackson.databind.node.ObjectNode)read.deepCopy();actual.putNull("content");
        try{actual.put("afterDigest","sha256:"+HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8))));}
        catch(Exception failure){throw new IllegalStateException(failure);}
        var source=(tools.jackson.databind.node.ObjectNode)actual.path("source");source.put("sourceDigest","sha256:"+"b".repeat(64));
        for(var file:source.path("files"))if(file.path("path").asText().equals("src/pages/HomePage.vue"))((tools.jackson.databind.node.ObjectNode)file).put("digest",actual.path("afterDigest").asText());return actual;
    }
    @Test void committedNoOpAndRevisitedPatchAreDetectedButAnUnchangedOriginalIsNotAPatch() throws Exception {
        var doc=doc();var read=results(doc).getFirst();var context=new RepairContext(latest(doc,"draft"));
        var unchanged=(tools.jackson.databind.node.ObjectNode)read.deepCopy();unchanged.putNull("content");
        context.observe("files.update",json.valueToTree(Map.of("path","src/pages/HomePage.vue","content",read.path("content").asText())),unchanged);
        assertThat(context.repeatedPatch()).isFalse();assertThat(context.progress().get("sourceChanged")).isEqualTo(false);
        var first=writeResult(read);String content=read.path("content").asText().replace("M1MissingCard.vue","ProfileCard.vue");
        var args=json.valueToTree(Map.of("path","src/pages/HomePage.vue","content",content));
        context.observe("files.update",args,first);assertThat(context.repeatedPatch()).isFalse();
        context.observe("files.update",args,first);assertThat(context.repeatedPatch()).isTrue();
        var other=(tools.jackson.databind.node.ObjectNode)first.deepCopy();String otherContent=content+"\n<!-- another committed candidate -->";
        String otherHash="sha256:"+HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(otherContent.getBytes(StandardCharsets.UTF_8)));
        other.put("afterDigest",otherHash);((tools.jackson.databind.node.ObjectNode)other.path("source")).put("sourceDigest","sha256:"+"c".repeat(64));
        for(var file:other.path("source").path("files"))if(file.path("path").asText().equals("src/pages/HomePage.vue"))((tools.jackson.databind.node.ObjectNode)file).put("digest",otherHash);
        context.observe("files.update",json.valueToTree(Map.of("path","src/pages/HomePage.vue","content",otherContent)),other);
        assertThat(context.repeatedPatch()).isFalse();
        context.observe("files.update",args,first);assertThat(context.repeatedPatch()).isTrue();
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
        String content=results(doc).getLast().path("content").asText().replace("M1MissingCard.vue","ProfileCard.vue");
        context.observe("files.update",json.valueToTree(Map.of("path","src/pages/HomePage.vue","content",content)),writeResult(results(doc).getLast()));
        var afterPatch=new RuntimeBudget.Meter(11,14,31596+patchCharge.chargedTokens());
        int doneReservation=reservation(doc,context,afterPatch);var doneCharge=RuntimeBudget.charge(Usage.unknown(),doneReservation-4096);
        var lastInput=input(doc,List.of(),context,afterPatch);assertThat(lastInput.path("completionOnly").asBoolean()).isTrue();assertThat(lastInput.path("tools")).isEmpty();
        assertThat(context.observations().getLast().path("committedContent").asText()).isEqualTo(content);
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
    @Test void actual720fPatchKeepsUnchangedDependencyAndDigestCheckedCommittedContent() throws Exception {
        var captured=json.readTree(Files.readString(Path.of("../../tests/agent/repair/fixtures/m1-720f-proposals.json")));
        var context=new RepairContext(captured.path("originalDraft"));var replies=captured.path("protocolResponses");var actual=captured.path("observedRepairResults");
        for(int i=0;i<3;i++)context.observe(replies.get(6+i).path("payload").path("name").asText(),replies.get(6+i).path("payload").path("arguments"),actual.get(i));
        var observed=context.observations();
        assertThat(observed.get(0).path("stale").asBoolean()).isTrue();assertThat(observed.get(0).path("content").isNull()).isTrue();
        assertThat(observed.get(1).path("stale").asBoolean()).isFalse();assertThat(observed.get(1).path("content")).isEqualTo(actual.get(1).path("content"));
        assertThat(observed.get(2).path("content").isNull()).isTrue(); // The authentic write receipt remains a write, not a read.
        assertThat(observed.get(2).path("committedContent")).isEqualTo(replies.get(8).path("payload").path("arguments").path("content"));
        assertThat(context.progress().get("next")).isEqualTo("PROPOSE_COMPLETION_OR_NECESSARY_PATCH");
        context.observe("files.read",replies.get(9).path("payload").path("arguments"),actual.get(3));
        assertThat(context.observations().get(2).has("committedContent")).isFalse();
        context.observe("files.read",replies.get(10).path("payload").path("arguments"),actual.get(4));
        assertThat(context.progress().get("repeatedReads")).isEqualTo(1); // The unchanged dependency's previous read was retained.
    }
    @Test void proposedContentCannotBecomeCommittedEvidenceWithoutMatchingActualDigest() throws Exception {
        var captured=json.readTree(Files.readString(Path.of("../../tests/agent/repair/fixtures/m1-720f-proposals.json")));
        var context=new RepairContext(captured.path("originalDraft"));
        var arguments=(tools.jackson.databind.node.ObjectNode)captured.path("protocolResponses").get(8).path("payload").path("arguments").deepCopy();
        arguments.put("content","uncommitted model claim");
        assertThatThrownBy(()->context.observe("files.update",arguments,captured.path("observedRepairResults").get(2)))
            .isInstanceOf(AgentFailure.class).hasMessage("AGENT_CHECKPOINT_INVALID");
        assertThat(context.observations()).isEmpty();
        var failed=(tools.jackson.databind.node.ObjectNode)captured.path("observedRepairResults").get(2).deepCopy();failed.put("status","FAILED");
        assertThatThrownBy(()->context.observe("files.update",captured.path("protocolResponses").get(8).path("payload").path("arguments"),failed))
            .isInstanceOf(AgentFailure.class).hasMessage("AGENT_CHECKPOINT_INVALID");
        assertThat(context.observations()).isEmpty();
    }
    @Test void repairPlanProjectionPreservesPathsRoutesAndCapabilitiesWithoutChangingFullPlan() throws Exception {
        var original=latest(doc(),"plan");String full=original.toString();var compact=RepairContext.planProjection(original);
        for(String field:List.of("schemaVersion","template","dataMode","capabilities"))assertThat(compact.path(field)).isEqualTo(original.path(field));
        for(int i=0;i<original.path("pages").size();i++) {
            assertThat(compact.path("pages").get(i).path("route")).isEqualTo(original.path("pages").get(i).path("route"));
            assertThat(compact.path("pages").get(i).path("file")).isEqualTo(original.path("pages").get(i).path("file"));
        }
        for(int i=0;i<original.path("files").size();i++)assertThat(compact.path("files").get(i).path("path")).isEqualTo(original.path("files").get(i).path("path"));
        assertThat(compact.toString().getBytes(StandardCharsets.UTF_8).length).isLessThan(full.getBytes(StandardCharsets.UTF_8).length-607);
        assertThat(original.toString()).isEqualTo(full);assertThat(original.path("acceptance")).isNotEmpty();
    }
    @Test void differentPathsWithIdenticalBytesAreNotMergedAndLargeReadsAreNotTruncated() throws Exception {
        var doc=doc();var context=new RepairContext(latest(doc,"draft"));var huge=(tools.jackson.databind.node.ObjectNode)results(doc).getFirst().deepCopy();huge.put("content","x".repeat(131072));
        for(String path:List.of("src/pages/HomePage.vue","src/components/ProfileCard.vue"))context.observe("files.read",json.valueToTree(Map.of("path",path)),huge);
        assertThat(context.observations()).hasSize(2);assertThat(context.observations()).allSatisfy(o->assertThat(o.path("content").asText()).hasSize(131072));assertThat(reservation(doc,context)).isGreaterThan(50000);
    }
}
