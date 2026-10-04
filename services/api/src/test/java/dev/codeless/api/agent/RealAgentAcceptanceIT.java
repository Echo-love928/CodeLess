package dev.codeless.api.agent;

import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Explicit paid-model evaluation command. Never discovered by the default deterministic CI suite. */
@SpringBootTest(properties={"codeless.model.provider=deterministic-mock","codeless.agent.enabled=true","codeless.agent.repository-root=../..",
        "codeless.agent.private-root=target/real-agent-runtime","CODELESS_FILE_WORKSPACE_ROOT=target/real-agent-workspaces",
        "CODELESS_FILE_AUDIT_ROOT=target/real-agent-file-audit","codeless.model.audit-root=target/real-agent-models"})
class RealAgentAcceptanceIT extends PostgresTestBase {
    @Autowired PlatformRepository repository;@Autowired TaskQueueService queue;@Autowired AgentRunStore store;
    @Autowired AgentJournal journal;@Autowired AgentEvidence evidence;@Autowired PlanValidator validator;
    @Autowired FileToolRegistry registry;@Autowired FileToolService files;@Autowired ModelCallRepository calls;
    @Autowired ModelCallAudit audit;@Autowired BuildGateway gateway;@Autowired JdbcClient jdbc;
    @Test void oneRealDemandThroughMultipleFilesBuildAndBrowser() throws Exception {
        var json=JsonMapper.builder().build();
        String configured=System.getenv("CODELESS_REAL_AGENT_EVIDENCE_DIR");
        Path directory=configured==null?Path.of("target/real-agent-evidence"):Path.of(configured);Files.createDirectories(directory);
        ModelProvider provider;
        try {provider=new DeepSeekModelProvider(System.getenv("CODELESS_MODEL_API_KEY"),System.getenv("CODELESS_MODEL_NAME"));}
        catch(ModelFailure failure) {
            Files.writeString(directory.resolve("preflight.json"),json.writeValueAsString(Map.of("status","BLOCKED","reason",failure.code())));throw failure;
        }
        UUID owner=UUID.randomUUID(),app=UUID.randomUUID();repository.createUser(owner,owner+"@real-agent.test","Real test");
        repository.createApplication(app,owner,"Real static showcase",DataMode.STATIC);
        UUID task=queue.create(owner,app,"生成一个 Ada Lovelace 个人展示页。使用静态数据，展示姓名、简短介绍和两件作品。最多两个文件：src/pages/HomePage.vue、src/components/ProfileCard.vue。不要外部图片或外部请求。",null).id();
        jdbc.sql("UPDATE generation_tasks SET created_at='2000-01-01' WHERE id=?").param(task).update();
        var loop=new AgentLoop(store,new AgentModel(provider,calls,audit,store),validator,registry,files,gateway,evidence);
        new TaskScheduler(queue,loop).tick();
        var view=queue.find(owner,task).orElseThrow();var events=journal.read(task);
        var usage=jdbc.sql("SELECT id,stage,provider,model,status,input_tokens,output_tokens,error_code FROM model_calls WHERE task_id=? ORDER BY created_at")
                .param(task).query((rs,n) -> {
                    var value=new LinkedHashMap<String,Object>();value.put("id",rs.getObject(1));value.put("stage",rs.getString(2));value.put("provider",rs.getString(3));
                    value.put("model",rs.getString(4));value.put("status",rs.getString(5));value.put("inputTokens",rs.getObject(6));value.put("outputTokens",rs.getObject(7));value.put("errorCode",rs.getString(8));return value;
                }).list();
        Files.writeString(directory.resolve("real-result.json"),json.writeValueAsString(Map.of("task",view,"events",events,"modelCalls",usage,"fixture",false,"platformPreview","NOT_EXECUTED_BY_THIS_TEST")));
        assertThat(view.status()).as(view.failureCode()).isEqualTo(TaskStatus.READY);
    }
}
