package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Explicit private-input acceptance: -Dtest=D25PrivateWireIT -Dd25.wire=... -Dd25.batch=...
 * Exact saved replies, real isolated DB and native agent boundary, synthetic mock metering, no network/model. */
@SpringBootTest(properties={"codeless.model.provider=deterministic-mock","codeless.agent.enabled=true","codeless.agent.repository-root=../..",
 "codeless.agent.private-root=target/d25-private-wire/runtime","CODELESS_FILE_WORKSPACE_ROOT=target/d25-private-wire/workspaces",
 "CODELESS_FILE_AUDIT_ROOT=target/d25-private-wire/file-audit","codeless.model.audit-root=target/d25-private-wire/models"})
class D25PrivateWireIT extends PostgresTestBase {
 @Autowired PlatformRepository repository;@Autowired TaskQueueService queue;@Autowired AgentRunStore store;
 @Autowired AgentJournal journal;@Autowired AgentEvidence evidence;@Autowired PlanValidator validator;
 @Autowired FileToolRegistry registry;@Autowired FileToolService files;@Autowired ModelCallRepository calls;
 @Autowired ModelCallAudit audit;@Autowired BuildGateway gateway;
 final JsonMapper json=JsonMapper.builder().build();
 @Test void task02ExactWireStillTerminatesAtTheUnescapedAttributeQuote() throws Exception {replay("TASK-02",3);}
 @Test void cat01ExactWireStillTerminatesAtTheUnescapedProseQuote() throws Exception {replay("CAT-01",1);}
 void replay(String id,int expectedCalls) throws Exception {
  var wire=Path.of(Objects.requireNonNull(System.getProperty("d25.wire"),"Explicit original private wire root required"));
  var batch=Path.of(Objects.requireNonNull(System.getProperty("d25.batch"),"Explicit unchanged original batch required"));
  var original=json.readTree(Files.readString(batch.resolve("samples/"+id+"/record.json")));
  var spec=json.readTree(Files.readString(batch.resolve("samples/"+id+"/spec.json")));
  var replies=new ArrayList<String>();for(int n=1;n<=expectedCalls;n++)replies.add(json.readTree(Files.readString(wire.resolve(id+"-wire/"+String.format(Locale.ROOT,"%02d-result.json",n)))).path("replyContent").asText());
  var oldInvalid=original.path("journal").valueStream().filter(e->e.path("kind").asText().equals("model.invalid")).findFirst().orElseThrow().path("payload");
  String digest="sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(replies.getLast().getBytes(StandardCharsets.UTF_8)));
  assertThat(digest).isEqualTo(oldInvalid.path("contentDigest").asText());
  UUID owner=UUID.randomUUID(),app=UUID.randomUUID();repository.createUser(owner,owner+"@d25-wire.test","Private native replay");
  repository.createApplication(app,owner,"D25 wire "+id,DataMode.valueOf(spec.path("requirement").path("dataMode").asText()));
  UUID task=queue.create(owner,app,spec.path("requirement").path("prompt").asText(),null).id();
  var provider=new ModelProvider(){int index;
   public String id(){return "deterministic-mock";}public String model(){return "private-recorded-wire-not-model-evaluation";}
   public Reply call(org.springframework.ai.chat.prompt.Prompt prompt,int output,Duration timeout){
    assertThat(index).isLessThan(replies.size());return new Reply(replies.get(index++),new Evidence(model(),"offline","offline",new Usage(100,100,200,json.valueToTree(Map.of("measurement","DECLARED_SYNTHETIC","paidRequests",0)))));
   }};
  var loop=new AgentLoop(store,new AgentModel(provider,calls,audit,store),validator,registry,files,gateway,evidence);
  var claim=queue.claim().orElseThrow();assertThat(claim.taskId()).isEqualTo(task);
  while(true){var state=queue.find(owner,task).orElseThrow().status();var result=loop.execute(claim,state);
   loop.advance(queue,claim,result,result.next()==TaskStatus.FAILED?EventType.TASK_FAILED:EventType.STAGE_STARTED);
   if(Set.of(TaskStatus.READY,TaskStatus.FAILED).contains(result.next()))break;}
  var terminal=queue.find(owner,task).orElseThrow();assertThat(terminal.status()).isEqualTo(TaskStatus.FAILED);
  assertThat(terminal.failureCode()).isEqualTo("MODEL_INVALID_RESPONSE");assertThat(terminal.repairAttempts()).isZero();
  var events=journal.read(task);assertThat(events.stream().filter(e->e.path("kind").asText().equals("model.request")).count()).isEqualTo(expectedCalls);
  var invalid=events.stream().filter(e->e.path("kind").asText().equals("model.invalid")).findFirst().orElseThrow().path("payload");
  for(String key:List.of("contentDigest","contentBytes","line","column","reason"))assertThat(invalid.path(key)).isEqualTo(oldInvalid.path(key));
  assertThat(events).noneMatch(e->e.path("kind").asText().equals("runner.result"));
  var out=Map.of("sample",id,"sourceDigest",digest,"parserShape",invalid,"nativeFailure",terminal.failureCode(),"replayedCalls",expectedCalls,"repairRounds",0,"paidRequests",0,"measurement","EXACT_WIRE_MOCK_TRANSPORT_NOT_REAL_QUALITY");
  Path dir=Path.of("target/d25-entry-json");Files.createDirectories(dir);Files.writeString(dir.resolve(id+"-original-wire.json"),json.writeValueAsString(out));
 }
}
