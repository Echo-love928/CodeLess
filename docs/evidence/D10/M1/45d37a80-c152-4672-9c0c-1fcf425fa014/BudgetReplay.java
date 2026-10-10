import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import dev.codeless.api.agent.RuntimeBudget;
import dev.codeless.api.tools.FileToolRegistry;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
public class BudgetReplay {
 public static void main(String[] args) throws Exception {
  var mapper=JsonMapper.builder().build();Path report=Path.of(args[0]),out=Path.of(args[1]);
  var doc=mapper.readTree(Files.readString(report));var events=new ArrayList<JsonNode>();doc.path("events").forEach(events::add);
  var plan=events.stream().filter(e->e.path("kind").asText().equals("plan")).findFirst().orElseThrow().path("payload");
  var draft=events.stream().filter(e->e.path("kind").asText().equals("draft")).findFirst().orElseThrow().path("payload");
  var failure=events.stream().filter(e->e.path("kind").asText().equals("repair.failure")).findFirst().orElseThrow().path("payload");
  Path classes=Path.of("services/api/target/classes/model/prompts");
  String policy=Files.readString(classes.resolve("agent-proposal-protocol-v1.txt"))+"\n"+Files.readString(classes.resolve("repair/agent-repair-v1.txt"));
  var observations=new ArrayList<JsonNode>();var requests=new ArrayList<Map<String,Object>>();
  for(var event:events) {
   if(!event.path("stage").asText().equals("REPAIR"))continue;
   if(event.path("kind").asText().equals("model.request")) {
    String user=input(mapper,doc,plan,draft,failure,observations).toString();
    int reserved=RuntimeBudget.inputReservation(policy,user)+RuntimeBudget.OUTPUT_TOKENS;
    int actual=event.path("payload").path("reservedTokens").asInt();
    if(reserved!=actual)throw new IllegalStateException("Exact reservation replay mismatch");
    requests.add(Map.of("sequence",event.path("sequence").asInt(),"observations",observations.size(),"inputUtf8Bytes",user.getBytes(StandardCharsets.UTF_8).length,"reservedTokens",reserved,"journalReservedTokens",actual,"exactMatch",true));
   }
   if(event.path("kind").asText().equals("tool.result"))observations.add(event.path("payload"));
  }
  String rejected=input(mapper,doc,plan,draft,failure,observations).toString();
  int reserved=RuntimeBudget.inputReservation(policy,rejected)+RuntimeBudget.OUTPUT_TOKENS;
  var meter=RuntimeBudget.meter(events);
  if(meter.models()!=10||meter.tools()!=13||meter.chargedTokens()!=31596||meter.chargedTokens()+reserved<=RuntimeBudget.TOKENS)throw new IllegalStateException("Budget conclusion mismatch");
  var result=new LinkedHashMap<String,Object>();result.put("offlineOnly",true);result.put("additionalModelRequests",0);result.put("exactAcceptedReservationReplays",requests);
  result.put("meter",meter);result.put("nextInputUtf8Bytes",rejected.getBytes(StandardCharsets.UTF_8).length);result.put("policyUtf8Bytes",policy.getBytes(StandardCharsets.UTF_8).length);
  result.put("nextInputReservation",reserved-RuntimeBudget.OUTPUT_TOKENS);result.put("nextOutputReservation",RuntimeBudget.OUTPUT_TOKENS);result.put("nextTotalReservation",reserved);result.put("remainingChargedTokenBudget",RuntimeBudget.TOKENS-meter.chargedTokens());result.put("wouldTotal",meter.chargedTokens()+reserved);result.put("rejectedBeforeProvider",true);
  Files.writeString(out,mapper.writeValueAsString(result)+"\n");System.out.println(mapper.writeValueAsString(result));
 }
 static JsonNode input(JsonMapper mapper,JsonNode doc,JsonNode plan,JsonNode draft,JsonNode failure,List<JsonNode> observations) {
  var input=new LinkedHashMap<String,Object>();input.put("phase","REPAIR");input.put("request",doc.path("task").path("prompt").asText());input.put("dataMode","STATIC");input.put("plan",plan);input.put("tools",new FileToolRegistry().definitions().path("tools"));input.put("observations",observations);input.put("failure",failure);input.put("originalActions",draft.path("actions"));input.put("sourceFiles",draft.path("files"));input.put("repairAttempt",1);return mapper.valueToTree(input);
 }
}
