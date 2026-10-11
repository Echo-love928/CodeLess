package dev.codeless.api.agent;

import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Explicit paid REPAIR evaluation on preserved D09 real-model faulty source. Not full generation. */
@SpringBootTest(properties={"codeless.model.provider=deterministic-mock","codeless.agent.enabled=true","codeless.agent.repository-root=../..",
        "codeless.agent.private-root=target/real-repair/runtime","CODELESS_FILE_WORKSPACE_ROOT=target/real-repair/workspaces",
        "CODELESS_FILE_AUDIT_ROOT=target/real-repair/file-audit","codeless.model.audit-root=target/real-repair/models"})
class RealRepairAcceptanceIT extends PostgresTestBase {
    @Autowired PlatformRepository repository;@Autowired TaskQueueService queue;@Autowired AgentRunStore store;
    @Autowired AgentJournal journal;@Autowired AgentEvidence evidence;@Autowired PlanValidator validator;
    @Autowired FileToolRegistry registry;@Autowired FileToolService files;@Autowired ModelCallRepository calls;
    @Autowired ModelCallAudit audit;@Autowired BuildGateway gateway;@Autowired JdbcClient jdbc;
    @BeforeAll static void prepare() throws Exception {
        var builder=new ProcessBuilder("node","../../tests/agent/prepare-runtime.mjs").inheritIO();
        builder.environment().remove("CODELESS_MODEL_API_KEY");builder.environment().remove("CODELESS_MODEL_NAME");
        var process=builder.start();assertThat(process.waitFor(300,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(process.exitValue()).isZero();
    }
    @Test void realModelRepairsRecordedPropsMismatchAndPassesRealBuildAndBrowser() throws Exception {
        var json=JsonMapper.builder().build();
        var provider=new DeepSeekModelProvider(System.getenv("CODELESS_MODEL_API_KEY"),System.getenv("CODELESS_MODEL_NAME"));
        UUID owner=UUID.randomUUID(),app=UUID.randomUUID();repository.createUser(owner,owner+"@real-repair.test","Real repair evaluation");
        repository.createApplication(app,owner,"Recorded static showcase",DataMode.STATIC);
        UUID task=queue.create(owner,app,"修复 Ada Lovelace 静态个人展示页的组件 props 类型错误，保留姓名、简介和两件作品。只修改现有两个文件，禁止外部请求。",null).id();
        jdbc.sql("UPDATE generation_tasks SET created_at='2000-01-01' WHERE id=?").param(task).update();
        var claim=queue.claim().orElseThrow();assertThat(claim.taskId()).isEqualTo(task);
        var plan=validator.validate(Files.readString(Path.of("../../contracts/plan/fixtures/valid/static.json")),"STATIC");
        store.append(claim,TaskStatus.PLAN,"plan",plan);queue.advance(claim,TaskStatus.GENERATE,EventType.STAGE_STARTED,"Recorded source evaluation seed",null);
        for(String path:List.of("src/components/ProfileCard.vue","src/pages/HomePage.vue")) {
            store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);
            String content=Files.readString(Path.of("../../tests/agent/evidence/2026-10-04/source/real-paid").resolve(path));
            var actual=files.execute(task,claim.token(),"files.create",json.writeValueAsString(Map.of("path",path,"content",content)));
            assertThat(actual.status()).isEqualTo("SUCCEEDED");store.append(claim,TaskStatus.GENERATE,"tool.result",actual);
        }
        var actions=json.readTree("[{\"type\":\"navigate\",\"path\":\"/\"},{\"type\":\"expectText\",\"target\":{\"testId\":\"name\"},\"value\":\"Ada Lovelace\"},{\"type\":\"expectVisible\",\"target\":{\"testId\":\"works-list\"}}]");
        store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);store.draft(claim,files.snapshot(task,claim.token()),actions);
        store.append(claim,TaskStatus.GENERATE,"stage.finished",Map.of("next","VERIFY"));
        queue.advance(claim,TaskStatus.VERIFY,EventType.STAGE_STARTED,"Recorded candidate frozen",null);
        var loop=new AgentLoop(store,new AgentModel(provider,calls,audit,store),validator,registry,files,gateway,evidence);
        TaskStatus stage=TaskStatus.VERIFY;
        for(int i=0;i<11;i++) {
            var result=loop.execute(claim,stage);stage=loop.advance(queue,claim,result,result.next()==TaskStatus.FAILED?EventType.TASK_FAILED:
                    result.next()==TaskStatus.REPAIR?EventType.REPAIR_REQUESTED:EventType.STAGE_STARTED).status();
            if(stage==TaskStatus.FAILED || stage==TaskStatus.READY)break;
        }
        var view=queue.find(owner,task).orElseThrow();var events=journal.read(task);
        var usage=jdbc.sql("SELECT id,stage,provider,model,status,input_tokens,output_tokens,error_code FROM model_calls WHERE task_id=? ORDER BY created_at")
                .param(task).query((rs,n)->{var value=new LinkedHashMap<String,Object>();value.put("id",rs.getObject(1));value.put("stage",rs.getString(2));
                    value.put("provider",rs.getString(3));value.put("model",rs.getString(4));value.put("status",rs.getString(5));value.put("inputTokens",rs.getObject(6));
                    value.put("outputTokens",rs.getObject(7));value.put("errorCode",rs.getString(8));return value;}).list();
        String configured=System.getenv("CODELESS_REAL_REPAIR_EVIDENCE_DIR");Path directory=configured==null?Path.of("target/real-repair/evidence"):Path.of(configured);Files.createDirectories(directory);
        Files.writeString(directory.resolve("D10-A-real-repair.json"),json.writeValueAsString(Map.of("task",view,"events",events,
                "budget",RuntimeBudget.meter(events),"modelProvider","deepseek","modelQualityEvidence",view.status()==TaskStatus.READY,
                "extra",Map.of("initialSource","RECORDED_D09_A_REAL_MODEL_FAILURE","paidStages",List.of("REPAIR"),"modelCalls",usage,"platformPreview","NOT_EXECUTED_BY_THIS_TEST"))));
        assertThat(view.status()).as(view.failureCode()).isEqualTo(TaskStatus.READY);assertThat(view.repairAttempts()).isBetween(1,3);
        assertThat(usage).isNotEmpty().allSatisfy(call->assertThat(call.get("provider")).isEqualTo("deepseek"));
        var results=events.stream().filter(e->e.path("kind").asText().equals("runner.result")).map(e->e.path("payload")).toList();
        assertThat(results.getFirst().path("build").path("log").path("text").asText()).contains("TS2322");
        assertThat(results.getLast().path("verification").path("status").asText()).isEqualTo("PASSED");
    }
}
