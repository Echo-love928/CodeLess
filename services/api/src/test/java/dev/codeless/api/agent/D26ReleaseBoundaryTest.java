package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.edit.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import dev.codeless.api.versions.SnapshotStore;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Deterministic proposals; real PostgreSQL, source tools, Docker build and Chromium. No paid provider. */
@SpringBootTest(properties={"codeless.model.provider=deterministic-mock","codeless.agent.enabled=true",
        "codeless.agent.repository-root=../..","codeless.agent.private-root=target/d26-release/runtime",
        "codeless.versions.root=target/d26-release/versions","CODELESS_FILE_WORKSPACE_ROOT=target/d26-release/workspaces",
        "CODELESS_FILE_AUDIT_ROOT=target/d26-release/files","codeless.model.audit-root=target/d26-release/models"})
class D26ReleaseBoundaryTest extends PostgresTestBase {
    @Autowired PlatformRepository repository;
    @Autowired TaskQueueService queue;
    @Autowired AgentRunStore store;
    @Autowired AgentJournal journal;
    @Autowired AgentEvidence evidence;
    @Autowired PlanValidator plans;
    @Autowired FileToolRegistry registry;
    @Autowired FileToolService files;
    @Autowired ModelCallRepository calls;
    @Autowired ModelCallAudit audit;
    @Autowired BuildGateway gateway;
    @Autowired SnapshotStore snapshots;
    @Autowired EditTaskService edits;
    @Autowired JdbcClient jdbc;
    final JsonMapper json=JsonMapper.builder().build();
    record Seed(UUID owner,UUID app,UUID task,TaskQueueService.Claim claim) {}

    @BeforeAll static void runtime() throws Exception {
        var p=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO().start();
        assertThat(p.waitFor(300,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        assertThat(p.exitValue()).isZero();
    }
    Seed seed() {
        UUID owner=UUID.randomUUID(),app=UUID.randomUUID();
        repository.createUser(owner,owner+"@d26.test","D26 release boundary");
        repository.createApplication(app,owner,"D26 release boundary",DataMode.STATIC);
        UUID task=queue.create(owner,app,"生成静态个人展示页",null).id();
        return new Seed(owner,app,task,claim(task));
    }
    TaskQueueService.Claim claim(UUID task) {
        jdbc.sql("UPDATE generation_tasks SET created_at=(SELECT min(created_at)-interval '1 second' FROM generation_tasks) WHERE id=?").param(task).update();
        var c=queue.claim().orElseThrow();assertThat(c.taskId()).isEqualTo(task);return c;
    }
    AgentLoop loop(ModelProvider provider) {
        return new AgentLoop(store,new AgentModel(provider,calls,audit,store),plans,registry,files,gateway,evidence,true);
    }
    void stage(AgentLoop loop,TaskQueueService.Claim claim,TaskStatus current,TaskStatus next) {
        var r=loop.execute(claim,current);assertThat(r.next()).as(r.failureCode()).isEqualTo(next);
        loop.advance(queue,claim,r,next==TaskStatus.FAILED?EventType.TASK_FAILED:EventType.STAGE_COMPLETED);
    }
    JsonNode draft(UUID task) {return AgentJournal.latest(journal.read(task),"draft");}
    UUID version(JsonNode draft) {return UUID.fromString(draft.path("versionId").asText());}
    void report(String name,Object data) throws Exception {
        Path root=Path.of("target/d26-release/evidence");Files.createDirectories(root);
        Files.writeString(root.resolve(name+".json"),json.writeValueAsString(data));
    }
    void unchanged(Seed s,UUID base,Map<String,byte[]> before) {
        assertThat(repository.findApplicationForOwner(s.app(),s.owner()).orElseThrow().latestReadyVersionId()).isEqualTo(base);
        String digest=jdbc.sql("SELECT source_digest FROM application_versions WHERE id=?").param(base).query(String.class).single();
        var after=snapshots.sourceBytes(base,digest);assertThat(after.keySet()).isEqualTo(before.keySet());
        before.forEach((p,b)->assertThat(after.get(p)).as(p).isEqualTo(b));
    }
    @Test void failedEditFromRealBuildKeepsTheLastReadySourceAndCannotBePromoted() throws Exception {
        var s=seed();var normal=loop(new MockModelProvider());
        stage(normal,s.claim(),TaskStatus.PLAN,TaskStatus.GENERATE);
        stage(normal,s.claim(),TaskStatus.GENERATE,TaskStatus.VERIFY);
        stage(normal,s.claim(),TaskStatus.VERIFY,TaskStatus.READY);
        var baseline=draft(s.task());UUID base=version(baseline);
        var before=snapshots.sourceBytes(base,baseline.path("sourceDigest").asText());
        UUID edit=edits.create(s.owner(),s.app(),base,"修改个人介绍",new EditMetadata.Source("CHAT",null,null,null,null,null),null).task().id();
        var c=claim(edit);var mock=new MockModelProvider();
        ModelProvider broken=new ModelProvider() {
            public String id(){return "deterministic-mock";} public String model(){return "d26-controlled-build-failure";}
            public Reply call(org.springframework.ai.chat.prompt.Prompt prompt,int max,Duration timeout) {
                var input=json.readTree(prompt.getUserMessage().getText());
                if("REPAIR".equals(input.path("phase").asText()))
                    return new Reply(input.path("completionProposal").toString(),Evidence.unknown());
                var reply=mock.call(prompt,max,timeout);var output=json.readTree(reply.content());
                if("files.update".equals(output.path("name").asText())) {
                    var arguments=(tools.jackson.databind.node.ObjectNode)output.path("arguments");
                    arguments.put("content",arguments.path("content").asText()+"<script setup lang=\"ts\">const broken = ;</script>");
                }
                return new Reply(output.toString(),reply.evidence());
            }
        };
        var failing=loop(broken);
        stage(failing,c,TaskStatus.PLAN,TaskStatus.GENERATE);stage(failing,c,TaskStatus.GENERATE,TaskStatus.VERIFY);
        stage(failing,c,TaskStatus.VERIFY,TaskStatus.REPAIR);stage(failing,c,TaskStatus.REPAIR,TaskStatus.GENERATE);
        stage(failing,c,TaskStatus.GENERATE,TaskStatus.VERIFY);stage(failing,c,TaskStatus.VERIFY,TaskStatus.FAILED);
        var stopped=queue.find(s.owner(),edit).orElseThrow();assertThat(stopped.failureCode()).isEqualTo("AGENT_REPAIR_NO_PROGRESS");
        var actual=AgentJournal.latest(journal.read(edit),"runner.result");
        assertThat(actual.path("build").path("exitCode").isIntegralNumber()).isTrue();
        assertThat(actual.path("build").path("exitCode").asInt()).isPositive();
        var failed=draft(edit);assertThat(jdbc.sql("SELECT status FROM application_versions WHERE id=?").param(version(failed)).query(String.class).single()).isEqualTo("FAILED");
        assertThatThrownBy(()->snapshots.outcome(version(failed),failed.path("sourceDigest").asText(),"VERIFIED")).isInstanceOf(RuntimeException.class);
        unchanged(s,base,before);
        assertThatThrownBy(()->edits.create(s.owner(),s.app(),version(failed),"继续编辑",new EditMetadata.Source("CHAT",null,null,null,null,null),null)).hasMessage("EDIT_BASE_UNAVAILABLE");
        report("failed-edit",Map.of("task",stopped,"baseline",baseline,"failedDraft",failed,"runner",actual,"baselineBytesUnchanged",true,"paidModelCalls",0,"modelQualityEvidence",false));
    }
    @Test void cancellationAfterRealVerificationRejectsLateReadyCommit() throws Exception {
        var s=seed();var loop=loop(new MockModelProvider());
        stage(loop,s.claim(),TaskStatus.PLAN,TaskStatus.GENERATE);stage(loop,s.claim(),TaskStatus.GENERATE,TaskStatus.VERIFY);
        var result=loop.execute(s.claim(),TaskStatus.VERIFY);assertThat(result.next()).isEqualTo(TaskStatus.READY);
        var d=draft(s.task());var actual=AgentJournal.latest(journal.read(s.task()),"runner.result");
        assertThat(actual.path("status").asText()).isEqualTo("VERIFIED");
        queue.cancel(s.owner(),s.task());
        assertThatThrownBy(()->loop.advance(queue,s.claim(),result,EventType.STAGE_COMPLETED)).hasMessage("AGENT_LEASE_INVALID");
        assertThat(queue.find(s.owner(),s.task()).orElseThrow().failureCode()).isEqualTo("CANCELLED");
        assertThat(repository.findApplicationForOwner(s.app(),s.owner()).orElseThrow().latestReadyVersionId()).isNull();
        assertThat(jdbc.sql("SELECT status FROM application_versions WHERE id=?").param(version(d)).query(String.class).single()).isEqualTo("FAILED");
        assertThat(jdbc.sql("SELECT count(*) FROM builds WHERE task_id=?").param(s.task()).query(Integer.class).single()).isZero();
        assertThat(snapshots.outcome(version(d),d.path("sourceDigest").asText(),"FAILED").report().path("failureCode").asText()).isEqualTo("CANCELLED");
        report("cancel-after-verify",Map.of("task",queue.find(s.owner(),s.task()).orElseThrow(),"draft",d,"realRunner",actual,"lateCommitRejected",true));
    }
    @Test void exactMinimumOutputReservationIsAcceptedAndOneTokenLessIsRejectedWithoutProviderCall() throws Exception {
        var s=seed();
        try {
            int before=journal.read(s.task()).size();
            assertThatThrownBy(()->store.reserveModel(s.claim(),TaskStatus.PLAN,RuntimeBudget.TOKENS-255)).hasMessage("AGENT_MODEL_BUDGET_EXCEEDED");
            assertThat(journal.read(s.task())).hasSize(before);
            assertThat(store.reserveModel(s.claim(),TaskStatus.PLAN,RuntimeBudget.TOKENS-256)).isEqualTo(256);
            assertThat(RuntimeBudget.meter(journal.read(s.task())).chargedTokens()).isEqualTo(50000);
            assertThatThrownBy(()->store.reserveModel(s.claim(),TaskStatus.PLAN,1)).hasMessage("AGENT_MODEL_BUDGET_EXCEEDED");
            assertThat(jdbc.sql("SELECT count(*) FROM model_calls WHERE task_id=?").param(s.task()).query(Integer.class).single()).isZero();
            report("token-boundary",Map.of("taskId",s.task(),"meter",RuntimeBudget.meter(journal.read(s.task())),"reservationOnly",true,"providerCalls",0));
        } finally {queue.cancel(s.owner(),s.task());}
    }
    @Test void modelRequestThirteenAndTwentyFirstToolAreRejectedAtomically() throws Exception {
        var s=seed();
        try {
            for(int i=0;i<12;i++)assertThat(store.reserveModel(s.claim(),TaskStatus.PLAN,1)).isEqualTo(4096);
            int count=journal.read(s.task()).size();
            assertThatThrownBy(()->store.reserveModel(s.claim(),TaskStatus.PLAN,1)).hasMessage("AGENT_MODEL_BUDGET_EXCEEDED");
            assertThat(journal.read(s.task())).hasSize(count);
            for(int i=0;i<20;i++)store.reserve(s.claim(),TaskStatus.PLAN,"tool.request",0);
            assertThatThrownBy(()->store.reserve(s.claim(),TaskStatus.PLAN,"tool.request",0)).hasMessage("AGENT_TOOL_BUDGET_EXCEEDED");
            var meter=RuntimeBudget.meter(journal.read(s.task()));assertThat(meter.models()).isEqualTo(12);assertThat(meter.tools()).isEqualTo(20);
            report("request-tool-boundary",Map.of("taskId",s.task(),"meter",meter,"reservationOnly",true));
        } finally {queue.cancel(s.owner(),s.task());}
    }
    @Test void verificationCannotConsumeOnlyOneOfItsTwoRequiredToolSlots() throws Exception {
        var s=seed();
        try {
            queue.advance(s.claim(),TaskStatus.GENERATE,EventType.STAGE_COMPLETED,"validated fixture",null);
            queue.advance(s.claim(),TaskStatus.VERIFY,EventType.STAGE_COMPLETED,"reservation fixture, no build",null);
            for(int i=0;i<19;i++)store.reserve(s.claim(),TaskStatus.VERIFY,"tool.request",0);
            assertThatThrownBy(()->store.reserveVerification(s.claim())).hasMessage("AGENT_TOOL_BUDGET_EXCEEDED");
            assertThat(RuntimeBudget.meter(journal.read(s.task())).tools()).isEqualTo(19);
            report("verification-slot-boundary",Map.of("taskId",s.task(),"meter",RuntimeBudget.meter(journal.read(s.task())),"reservationOnly",true));
        } finally {queue.cancel(s.owner(),s.task());}
    }
    @Test void expiredLeaseCannotReserveOrRecordAResponseAndConvergesInterrupted() throws Exception {
        var s=seed();int count=journal.read(s.task()).size();
        jdbc.sql("UPDATE generation_tasks SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=?").param(s.task()).update();
        assertThatThrownBy(()->store.reserveModel(s.claim(),TaskStatus.PLAN,1)).hasMessage("AGENT_LEASE_INVALID");
        assertThatThrownBy(()->store.append(s.claim(),TaskStatus.PLAN,"model.response",Map.of("type","done"))).hasMessage("AGENT_LEASE_INVALID");
        assertThat(journal.read(s.task())).hasSize(count);
        assertThat(queue.recoverExpired()).contains(s.task());
        assertThat(queue.find(s.owner(),s.task()).orElseThrow().failureCode()).isEqualTo("INTERRUPTED");
        report("expired-lease",Map.of("task",queue.find(s.owner(),s.task()).orElseThrow(),"lateWritesRejected",true));
    }
}
