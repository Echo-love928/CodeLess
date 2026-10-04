package dev.codeless.api.agent;

import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties={"codeless.model.provider=deterministic-mock","codeless.agent.enabled=true","codeless.agent.repository-root=../..",
        "codeless.agent.private-root=target/agent-integration/runtime","CODELESS_FILE_WORKSPACE_ROOT=target/agent-integration/workspaces",
        "CODELESS_FILE_AUDIT_ROOT=target/agent-integration/file-audit","codeless.model.audit-root=target/agent-integration/models"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AgentLoopIntegrationTest extends PostgresTestBase {
    @Autowired PlatformRepository repository;
    @Autowired TaskQueueService queue;
    @Autowired TaskStageRunner production;
    @Autowired AgentRunStore store;
    @Autowired AgentJournal journal;
    @Autowired AgentEvidence evidence;
    @Autowired PlanValidator validator;
    @Autowired FileToolRegistry registry;
    @Autowired FileToolService files;
    @Autowired ModelCallRepository calls;
    @Autowired ModelCallAudit audit;
    @Autowired BuildGateway gateway;
    @Autowired JdbcClient jdbc;
    @Autowired TaskEventReplay replay;
    private final JsonMapper json=JsonMapper.builder().build();
    private static JsonNode verified;
    private static UUID happyTask,happyOwner;
    private static Path runtime=Path.of("target/agent-integration/runtime").toAbsolutePath().normalize();
    @BeforeAll static void prepareRealRuntime() throws Exception {
        Process process=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO().start();
        assertThat(process.waitFor(300,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        assertThat(process.exitValue()).isZero();
    }
    record Seed(UUID owner,UUID app,UUID task) {}
    private Seed seed() {
        UUID owner=UUID.randomUUID(),app=UUID.randomUUID();
        repository.createUser(owner,owner+"@example.test","D09 test");repository.createApplication(app,owner,"Showcase",DataMode.STATIC);
        UUID task=queue.create(owner,app,"生成静态个人展示页，展示 Ada Lovelace 与作品",null).id();
        jdbc.sql("UPDATE generation_tasks SET created_at='2000-01-01' WHERE id=?").param(task).update();
        return new Seed(owner,app,task);
    }
    private TaskQueueService.Claim claim(Seed seed) {
        var claim=queue.claim().orElseThrow();assertThat(claim.taskId()).isEqualTo(seed.task());return claim;
    }
    private AgentLoop loop(ModelProvider provider,BuildGateway build) {
        return new AgentLoop(store,new AgentModel(provider,calls,audit,store),validator,registry,files,build,evidence);
    }
    private void stage(TaskStageRunner loop,TaskQueueService.Claim claim,TaskStatus current,TaskStatus expected) {
        var result=loop.execute(claim,current);assertThat(result.next()).as(result.failureCode()).isEqualTo(expected);
        loop.advance(queue,claim,result,result.next()==TaskStatus.FAILED?EventType.TASK_FAILED:
                result.next()==TaskStatus.READY?EventType.STAGE_COMPLETED:EventType.STAGE_STARTED);
    }
    private void report(String name,Object value) throws Exception {
        String configured=System.getenv("CODELESS_AGENT_EVIDENCE_DIR");
        Path directory=configured==null?Path.of("target/agent-integration/evidence"):Path.of(configured);
        Files.createDirectories(directory);Files.writeString(directory.resolve(name+".json"),json.writeValueAsString(value));
    }
    @Test @Order(1) void D09AT1_mockProviderGeneratesMultipleFilesThroughRealDatabaseDockerAndBrowser() throws Exception {
        var seed=seed();happyTask=seed.task();happyOwner=seed.owner();
        assertThat(production).isInstanceOf(AgentLoop.class);
        new TaskScheduler(queue,production).tick();
        var task=queue.find(seed.owner(),seed.task()).orElseThrow();assertThat(task.status()).as(task.failureCode()).isEqualTo(TaskStatus.READY);
        var events=journal.read(seed.task());var draft=AgentJournal.latest(events,"draft");
        verified=AgentJournal.latest(events,"runner.result");
        assertThat(draft.path("files").size()).isEqualTo(2);
        assertThat(verified.path("build").path("status").asText()).isEqualTo("SUCCEEDED");
        assertThat(verified.path("verification").path("status").asText()).isEqualTo("PASSED");
        assertThat(jdbc.sql("SELECT count(*) FROM model_calls WHERE task_id=? AND input_tokens IS NULL AND output_tokens IS NULL")
                .param(seed.task()).query(Integer.class).single()).isEqualTo(4);
        assertThat(events.stream().filter(e -> e.path("kind").asText().equals("tool.request")).count()).isEqualTo(4);
        report("D09-A-T1",Map.of("task",task,"draft",draft,"runner",verified,"modelProvider","deterministic-mock",
                "modelRequests",4,"inputTokens","UNKNOWN","outputTokens","UNKNOWN","toolCalls",4,"fixture",false));
    }
    @Test @Order(9) void ambiguousBrowserTargetsCannotPromoteEvenAfterARealSuccessfulBuild() throws Exception {
        var seed=seed();var mock=new MockModelProvider();
        var provider=new ModelProvider() {
            public String id(){return "deterministic-mock";}public String model(){return "ambiguous-target-fixture";}
            public Reply call(Prompt prompt,int max,Duration timeout) {
                var reply=mock.call(prompt,max,timeout);var proposed=json.readTree(reply.content());
                if(proposed.path("arguments").path("path").asText().equals("src/components/ProfileCard.vue"))
                    ((tools.jackson.databind.node.ObjectNode)proposed.path("arguments")).put("content",
                            "<script setup lang=\"ts\"></script><template><section><h1 data-testid=\"profile-name\">Ada Lovelace</h1><h2 data-testid=\"profile-name\">Note G</h2></section></template>");
                return new Reply(proposed.toString(),reply.evidence());
            }
        };
        new TaskScheduler(queue,loop(provider,gateway)).tick();
        var task=queue.find(seed.owner(),seed.task()).orElseThrow();var events=journal.read(seed.task());
        var actual=AgentJournal.latest(events,"runner.result");
        assertThat(task.status()).isEqualTo(TaskStatus.FAILED);assertThat(task.failureCode()).isEqualTo("AGENT_ACTION_FAILED");
        assertThat(actual.path("build").path("status").asText()).isEqualTo("SUCCEEDED");
        assertThat(actual.path("build").path("exitCode").asInt(-1)).isZero();
        assertThat(actual.path("verification").path("status").asText()).isEqualTo("FAILED");
        assertThat(actual.path("verification").path("failure").asText()).isEqualTo("ACTION_FAILED");
        assertThat(actual.path("verification").path("error").asText()).contains("strict mode violation");
        assertThat(jdbc.sql("SELECT count(*) FROM application_versions WHERE application_id=? AND status='VERIFIED'")
                .param(seed.app()).query(Integer.class).single()).isZero();
        assertThat(jdbc.sql("SELECT latest_ready_version_id IS NULL FROM applications WHERE id=?")
                .param(seed.app()).query(Boolean.class).single()).isTrue();
        report("D09-A-ambiguous-browser",Map.of("task",task,"runner",actual,"modelProvider","deterministic-mock",
                "realBuild",true,"realBrowser",true,"modelQualityEvidence",false));
    }
    @Test @Order(2) void D09AT2_modelCannotForgeSuccessOrInvokeVerifyToolsInGenerate() throws Exception {
        var outcomes=new ArrayList<Object>();
        for(String response:List.of("{\"type\":\"done\",\"status\":\"VERIFIED\",\"actions\":[]}",
                "{\"type\":\"json_object\",\"value\":{\"type\":\"tool\",\"name\":\"files.create\",\"arguments\":{\"path\":\"src/pages/HomePage.vue\",\"content\":\"wrapped proposal\"}}}",
                "{\"type\":\"tool\",\"name\":\"build.verify\",\"arguments\":{}}",
                "{\"type\":\"tool\",\"name\":\"files.create\",\"arguments\":{\"path\":\"src/pages/HomePage.vue\",\"content\":\"a\"},\"status\":\"SUCCEEDED\"}")) {
            var seed=seed();var claim=claim(seed);var mock=new MockModelProvider();
            var provider=new ModelProvider() {
                public String id(){return "deterministic-mock";}public String model(){return "forgery-fixture";}
                public Reply call(Prompt prompt,int max,Duration timeout) {
                    var request=json.readTree(prompt.getUserMessage().getText());
                    return request.path("phase").asText().equals("GENERATE")?new Reply(response,Evidence.unknown()):mock.call(prompt,max,timeout);
                }
            };
            var loop=loop(provider,(d,t) -> {throw new AssertionError("forged model must never invoke runner");});
            stage(loop,claim,TaskStatus.PLAN,TaskStatus.GENERATE);stage(loop,claim,TaskStatus.GENERATE,TaskStatus.FAILED);
            var task=queue.find(seed.owner(),seed.task()).orElseThrow();assertThat(task.failureCode()).isIn("AGENT_MODEL_PROTOCOL_INVALID","AGENT_TOOL_NOT_ALLOWED");
            outcomes.add(task);
        }
        report("D09-A-T2-model-forgery",outcomes);
    }
    @Test @Order(3) void D09AT2_wrongSourceArtifactAndScreenshotDigestsCannotPromote() throws Exception {
        assertThat(verified).isNotNull();var outcomes=new ArrayList<Object>();
        for(String kind:List.of("source","artifact","screenshot","receipt","browser","unknown")) {
            var seed=seed();var claim=claim(seed);
            BuildGateway forged=(draft,deadline) -> {
                var result=(tools.jackson.databind.node.ObjectNode)verified.deepCopy();
                String wrong="sha256:"+"0".repeat(64);
                if(kind.equals("screenshot")) {
                    var v=(tools.jackson.databind.node.ObjectNode)result.path("verification");
                    UUID verificationId=UUID.randomUUID();Path directory=runtime.resolve("evidence").resolve(verificationId.toString());
                    try {
                        Files.createDirectory(directory);Files.copy(Path.of(v.path("screenshot").path("path").asText()),directory.resolve("page.png"));
                    } catch(Exception error) {throw new RuntimeException(error);}
                    v.put("id",verificationId.toString());v.put("reportPath",directory.resolve("result.json").toString());
                    ((tools.jackson.databind.node.ObjectNode)v.path("screenshot")).put("path",directory.resolve("page.png").toString());
                }
                switch(kind) {
                    case "source" -> result.put("sourceDigest",wrong);
                    case "artifact" -> ((tools.jackson.databind.node.ObjectNode)result.path("build").path("artifact")).put("digest",wrong);
                    case "screenshot" -> ((tools.jackson.databind.node.ObjectNode)result.path("verification").path("screenshot")).put("digest",wrong);
                    case "browser" -> ((tools.jackson.databind.node.ObjectNode)result.path("verification")).put("buildId",UUID.randomUUID().toString());
                    case "unknown" -> ((tools.jackson.databind.node.ObjectNode)result.path("build")).putNull("exitCode");
                    default -> {}
                }
                UUID execution=UUID.randomUUID();result.put("executionId",execution.toString());
                if(!kind.equals("receipt")) try {
                    if(kind.equals("screenshot")) Files.writeString(Path.of(result.path("verification").path("reportPath").asText()),result.path("verification").toString());
                    Files.writeString(runtime.resolve("receipts").resolve(execution+".json"),result.toString());}
                    catch(Exception error) {throw new RuntimeException(error);}
                return result;
            };
            var loop=loop(new MockModelProvider(),forged);
            stage(loop,claim,TaskStatus.PLAN,TaskStatus.GENERATE);stage(loop,claim,TaskStatus.GENERATE,TaskStatus.VERIFY);
            stage(loop,claim,TaskStatus.VERIFY,TaskStatus.FAILED);
            assertThat(jdbc.sql("SELECT count(*) FROM application_versions WHERE application_id=? AND status='VERIFIED'").param(seed.app()).query(Integer.class).single()).isZero();
            assertThat(repository.findApplicationForOwner(seed.app(),seed.owner()).orElseThrow().latestReadyVersionId()).isNull();
            var failed=queue.find(seed.owner(),seed.task()).orElseThrow();
            if(kind.equals("screenshot")) assertThat(failed.failureCode()).isEqualTo("AGENT_SCREENSHOT_DIGEST_MISMATCH");
            outcomes.add(Map.of("mutation",kind,"task",failed,"fixture",true));
        }
        report("D09-A-T2-hashes",outcomes);
    }
    @Test @Order(4) void D09AT3_realBuildFailureIsExplainedAndRetainsRecoveryWithoutReplacingReady() throws Exception {
        UUID app=queue.find(happyOwner,happyTask).orElseThrow().applicationId();
        UUID priorReady=repository.findApplicationForOwner(app,happyOwner).orElseThrow().latestReadyVersionId();
        UUID taskId=queue.create(happyOwner,app,"生成静态个人展示页",null).id();
        jdbc.sql("UPDATE generation_tasks SET created_at='2000-01-01' WHERE id=?").param(taskId).update();
        var seed=new Seed(happyOwner,app,taskId);var claim=claim(seed);var mock=new MockModelProvider();
        var provider=new ModelProvider() {
            public String id(){return "deterministic-mock";}public String model(){return "invalid-vue-fixture";}
            public Reply call(Prompt prompt,int max,Duration timeout) {
                var reply=mock.call(prompt,max,timeout);var root=(tools.jackson.databind.node.ObjectNode)json.readTree(reply.content());
                if(root.path("arguments").path("path").asText().equals("src/pages/HomePage.vue"))
                    ((tools.jackson.databind.node.ObjectNode)root.path("arguments")).put("content","<template><main><h1>broken</template>");
                return new Reply(root.toString(),reply.evidence());
            }
        };
        var loop=loop(provider,gateway);
        stage(loop,claim,TaskStatus.PLAN,TaskStatus.GENERATE);stage(loop,claim,TaskStatus.GENERATE,TaskStatus.VERIFY);
        stage(loop,claim,TaskStatus.VERIFY,TaskStatus.FAILED);
        var task=queue.find(seed.owner(),seed.task()).orElseThrow();assertThat(task.failureCode()).isEqualTo("AGENT_BUILD_EXIT");
        var actual=AgentJournal.latest(journal.read(seed.task()),"runner.result");
        assertThat(actual.path("build").path("exitCode").asInt()).isPositive();assertThat(actual.path("verification").isNull()).isTrue();
        assertThat(jdbc.sql("SELECT status FROM builds WHERE task_id=?").param(seed.task()).query(String.class).single()).isEqualTo("FAILED");
        assertThat(AgentJournal.latest(journal.read(seed.task()),"failure").path("recovery").asText()).isEqualTo("MANUAL_REVIEW_NO_AUTOMATIC_RETRY");
        assertThat(queue.find(happyOwner,happyTask).orElseThrow().status()).isEqualTo(TaskStatus.READY);
        assertThat(repository.findApplicationForOwner(app,happyOwner).orElseThrow().latestReadyVersionId()).isEqualTo(priorReady);
        report("D09-A-T3",Map.of("task",task,"runner",actual,"draft",AgentJournal.latest(journal.read(seed.task()),"draft")));
    }
    @Test @Order(5) void D09AT4_completionAndPublicReplayBindExactImmutableVersionAndBuild() throws Exception {
        var completion=AgentJournal.latest(journal.read(happyTask),"completion");
        String version=completion.path("versionId").asText(),build=completion.path("buildId").asText();
        var events=repository.listEvents(happyTask);var last=events.getLast();
        assertThat(last.stage()).isEqualTo(TaskStatus.READY);assertThat(last.message()).contains("versionId="+version,"buildId="+build,
                "verificationId="+verified.path("verification").path("id").asText());
        assertThat(replay.page(happyOwner,happyTask,0,1000).getLast().message()).isEqualTo("PREVIEW_READY versionId="+version+" buildId="+build);
        UUID linked=jdbc.sql("SELECT v.build_id FROM application_versions v JOIN builds b ON b.version_id=v.id JOIN applications a ON a.latest_ready_version_id=v.id WHERE v.id=? AND v.status='VERIFIED' AND b.task_id=?")
                .params(UUID.fromString(version),happyTask).query(UUID.class).single();assertThat(linked.toString()).isEqualTo(build);
        assertThatThrownBy(() -> jdbc.sql("UPDATE application_versions SET source_digest=? WHERE id=?").params("sha256:"+"1".repeat(64),UUID.fromString(version)).update())
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        report("D09-A-T4",Map.of("completion",completion,"durableEvent",last,"publicEvent",replay.page(happyOwner,happyTask,0,1000).getLast(),"immutable",true));
    }
    @Test @Order(6) void cancellationLateLeaseReentryAndGlobalBudgetsFailClosed() throws Exception {
        var seed=seed();var claim=claim(seed);var loop=loop(new MockModelProvider(),gateway);
        stage(loop,claim,TaskStatus.PLAN,TaskStatus.GENERATE);
        var wrong=new TaskQueueService.Claim(claim.taskId(),UUID.randomUUID(),claim.stage());
        assertThat(loop.execute(wrong,TaskStatus.GENERATE).failureCode()).isEqualTo("AGENT_LEASE_INVALID");
        for(int i=0;i<20;i++) store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);
        assertThatThrownBy(() -> store.reserve(claim,TaskStatus.GENERATE,"tool.request",0)).hasMessage("AGENT_TOOL_BUDGET_EXCEEDED");
        assertThatThrownBy(() -> store.reserve(claim,TaskStatus.GENERATE,"model.request",50000)).hasMessage("AGENT_MODEL_BUDGET_EXCEEDED");
        assertThat(loop.execute(claim,TaskStatus.GENERATE).failureCode()).isEqualTo("AGENT_RECOVERY_REQUIRED");
        queue.cancel(seed.owner(),seed.task());
        assertThat(loop.execute(claim,TaskStatus.GENERATE).failureCode()).isEqualTo("AGENT_LEASE_INVALID");
        report("D09-A-boundaries",Map.of("wrongLease","REJECTED","toolLimit",20,"tokenLimit",50000,"cancelled",true,"reentry","MANUAL_RECOVERY_REQUIRED"));
    }
    @Test @Order(7) void actualFileResultsAreFedBackAndCancellationRetainsReceivedUsage() throws Exception {
        var seed=seed();var claim=claim(seed);var mock=new MockModelProvider();var received=new ArrayList<JsonNode>();
        var provider=new ModelProvider() {
            public String id(){return "deterministic-mock";}public String model(){return "feedback-fixture";}
            public Reply call(Prompt prompt,int max,Duration timeout) {
                var input=json.readTree(prompt.getUserMessage().getText());received.add(input);
                return mock.call(prompt,max,timeout);
            }
        };
        var loop=loop(provider,gateway);stage(loop,claim,TaskStatus.PLAN,TaskStatus.GENERATE);stage(loop,claim,TaskStatus.GENERATE,TaskStatus.VERIFY);
        assertThat(received.get(0).path("tools").size()).isZero();
        assertThat(received.get(1).path("tools").size()).isEqualTo(5);
        assertThat(received.get(2).path("observations").size()).isEqualTo(1);
        JsonNode actual=journal.read(seed.task()).stream().filter(e -> e.path("kind").asText().equals("tool.result")).findFirst().orElseThrow().path("payload");
        assertThat(received.get(2).path("observations").get(0)).isEqualTo(actual);
        assertThat(received.get(3).path("observations").size()).isEqualTo(2);queue.cancel(seed.owner(),seed.task());

        var cancelSeed=seed();var cancelClaim=claim(cancelSeed);
        var measured=new ModelProvider() {
            public String id(){return "transport-fixture";}public String model(){return "measured-cancellation-fixture";}
            public Reply call(Prompt prompt,int max,Duration timeout) {
                var reply=mock.call(prompt,max,timeout);
                if(json.readTree(prompt.getUserMessage().getText()).path("phase").asText().equals("GENERATE")) queue.cancel(cancelSeed.owner(),cancelSeed.task());
                return new Reply(reply.content(),new Evidence(model(),"fixture-request","fixture-response",new Usage(31,17,48,null)));
            }
        };
        var cancelLoop=loop(measured,gateway);stage(cancelLoop,cancelClaim,TaskStatus.PLAN,TaskStatus.GENERATE);
        assertThat(cancelLoop.execute(cancelClaim,TaskStatus.GENERATE).failureCode()).isEqualTo("AGENT_LEASE_INVALID");
        assertThat(queue.find(cancelSeed.owner(),cancelSeed.task()).orElseThrow().failureCode()).isEqualTo("CANCELLED");
        assertThat(jdbc.sql("SELECT input_tokens FROM model_calls WHERE task_id=? AND stage='GENERATE'").param(cancelSeed.task()).query(Integer.class).single()).isEqualTo(31);
        assertThat(jdbc.sql("SELECT output_tokens FROM model_calls WHERE task_id=? AND stage='GENERATE'").param(cancelSeed.task()).query(Integer.class).single()).isEqualTo(17);
        report("D09-A-feedback-and-cancellation",Map.of("actualResultFeedback",true,"receivedInputTokens",31,"receivedOutputTokens",17,"fixture",true));
    }
    @Test @Order(8) void unknownRealUsageBlocksTheNextModelCallAndNeverTurnsIntoZero() throws Exception {
        var seed=seed();var claim=claim(seed);var mock=new MockModelProvider();var count=new java.util.concurrent.atomic.AtomicInteger();
        var provider=new ModelProvider() {
            public String id(){return "transport-fixture";}public String model(){return "unknown-usage-fixture";}
            public Reply call(Prompt prompt,int max,Duration timeout) {count.incrementAndGet();return mock.call(prompt,max,timeout);}
        };
        var loop=loop(provider,gateway);stage(loop,claim,TaskStatus.PLAN,TaskStatus.GENERATE);stage(loop,claim,TaskStatus.GENERATE,TaskStatus.FAILED);
        assertThat(queue.find(seed.owner(),seed.task()).orElseThrow().failureCode()).isEqualTo("MODEL_BUDGET_UNKNOWN");
        assertThat(count.get()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT input_tokens IS NULL AND output_tokens IS NULL FROM model_calls WHERE task_id=?")
                .param(seed.task()).query(Boolean.class).single()).isTrue();
        report("D09-A-unknown-usage",Map.of("providerCalls",1,"nextCall","MODEL_BUDGET_UNKNOWN","inputTokens","UNKNOWN","fixture",true));
    }
}
