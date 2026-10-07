package dev.codeless.api.agent;

import dev.codeless.api.tasks.TaskQueueService;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.tools.FileToolService;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;

/** Database row lock fences every private checkpoint and version commit with the original lease. */
public final class AgentRunStore {
    public record Context(String prompt, String dataMode, OffsetDateTime deadline) {}
    private final JdbcClient jdbc;
    private final TransactionTemplate tx;
    private final AgentJournal journal;
    public AgentRunStore(JdbcClient jdbc, PlatformTransactionManager manager, AgentJournal journal) {
        this.jdbc=jdbc; this.tx=new TransactionTemplate(manager); this.journal=journal;
    }
    private Context lock(TaskQueueService.Claim claim, TaskStatus stage) {
        jdbc.sql("SELECT id FROM generation_tasks WHERE id=? FOR UPDATE").param(claim.taskId())
                .query(UUID.class).optional().orElseThrow(() -> new AgentFailure("AGENT_TASK_UNAVAILABLE"));
        return jdbc.sql("""
                SELECT t.prompt,a.data_mode,t.deadline_at FROM generation_tasks t
                JOIN applications a ON a.id=t.application_id WHERE t.id=? AND t.lease_token=?
                AND t.status=? AND t.queue_state='RUNNING' AND t.deadline_at>clock_timestamp()
                AND t.lease_expires_at>clock_timestamp()
                """).params(claim.taskId(),claim.token(),stage.name()).query((rs,n) -> new Context(
                rs.getString(1),rs.getString(2),rs.getObject(3,OffsetDateTime.class))).optional()
                .orElseThrow(() -> new AgentFailure("AGENT_LEASE_INVALID"));
    }
    public Context context(TaskQueueService.Claim claim, TaskStatus stage) { return tx.execute(s -> lock(claim,stage)); }
    public List<JsonNode> read(TaskQueueService.Claim claim, TaskStatus stage) {
        return tx.execute(s -> { lock(claim,stage); return journal.read(claim.taskId()); });
    }
    public void append(TaskQueueService.Claim claim, TaskStatus stage, String kind, Object payload) {
        tx.executeWithoutResult(s -> { lock(claim,stage); journal.append(claim.taskId(),stage.name(),kind,payload); lock(claim,stage); });
    }
    public void reserve(TaskQueueService.Claim claim, TaskStatus stage, String kind, int tokens) {
        tx.executeWithoutResult(s -> {
            lock(claim,stage);
            var events=journal.read(claim.taskId());
            long models=events.stream().filter(e -> e.path("kind").asText().equals("model.request")).count();
            long tools=events.stream().filter(e -> e.path("kind").asText().equals("tool.request")).count();
            long reserved=events.stream().filter(e -> e.path("kind").asText().equals("model.request"))
                    .mapToLong(e -> e.path("payload").path("reservedTokens").asLong()).sum();
            reserved-=events.stream().filter(e -> e.path("kind").asText().equals("model.usage"))
                    .mapToLong(e -> e.path("payload").path("releasedTokens").asLong()).sum();
            if (kind.equals("model.request") && (models>=12 || tokens<1 || reserved+tokens>50000))
                throw new AgentFailure("AGENT_MODEL_BUDGET_EXCEEDED");
            if (kind.equals("tool.request") && tools>=20) throw new AgentFailure("AGENT_TOOL_BUDGET_EXCEEDED");
            journal.append(claim.taskId(),stage.name(),kind,Map.of("reservedTokens",tokens));
        });
    }
    public JsonNode draft(TaskQueueService.Claim claim, FileToolService.Snapshot snapshot, JsonNode actions) {
        return tx.execute(s -> {
            lock(claim,TaskStatus.GENERATE);
            UUID app=jdbc.sql("SELECT application_id FROM generation_tasks WHERE id=?").param(claim.taskId()).query(UUID.class).single();
            jdbc.sql("SELECT id FROM applications WHERE id=? FOR UPDATE").param(app).query(UUID.class).single();
            int number=jdbc.sql("SELECT coalesce(max(number),0)+1 FROM application_versions WHERE application_id=?")
                    .param(app).query(Integer.class).single();
            UUID version=UUID.randomUUID();
            jdbc.sql("INSERT INTO application_versions(id,application_id,number,source_digest,status) VALUES (?,?,?,?,'DRAFT')")
                    .params(version,app,number,snapshot.source().sourceDigest()).update();
            journal.append(claim.taskId(),"GENERATE","draft",Map.of("versionId",version,"sourceDigest",snapshot.source().sourceDigest(),
                    "sourceDirectory",snapshot.directory().toString(),"files",snapshot.source().files(),"actions",actions));
            lock(claim,TaskStatus.GENERATE);
            return AgentJournal.latest(journal.read(claim.taskId()),"draft");
        });
    }
    public TaskQueueService.TaskView complete(TaskQueueService queue, TaskQueueService.Claim claim, JsonNode draft, JsonNode result) {
        return tx.execute(s -> {
            lock(claim,TaskStatus.VERIFY);
            UUID version=UUID.fromString(draft.path("versionId").asText());
            JsonNode build=result.path("build"), verification=result.path("verification");
            UUID buildId=UUID.fromString(build.path("id").asText());
            String artifact=build.path("artifact").path("digest").asText();
            int changed=jdbc.sql("""
                    INSERT INTO builds(id,task_id,version_id,status,exit_code,artifact_digest,created_at,completed_at)
                    SELECT ?,t.id,v.id,'SUCCEEDED',0,?,CAST(? AS timestamptz),CAST(? AS timestamptz)
                    FROM generation_tasks t JOIN application_versions v ON v.application_id=t.application_id
                    WHERE t.id=? AND v.id=? AND v.status='DRAFT' AND v.source_digest=?
                    """).params(buildId,artifact,build.path("createdAt").asText(),build.path("completedAt").asText(),
                    claim.taskId(),version,draft.path("sourceDigest").asText()).update();
            if (changed!=1) throw new AgentFailure("AGENT_VERSION_CONFLICT");
            jdbc.sql("UPDATE application_versions SET status='VERIFIED',build_id=?,row_version=row_version+1,updated_at=clock_timestamp() WHERE id=?")
                    .params(buildId,version).update();
            String message="PREVIEW_READY versionId="+version+" buildId="+buildId+" verificationId="+verification.path("id").asText();
            var view=queue.advance(claim,TaskStatus.READY,EventType.STAGE_COMPLETED,message,null);
            jdbc.sql("UPDATE applications SET latest_ready_version_id=?,row_version=row_version+1,updated_at=clock_timestamp() WHERE id=?")
                    .params(version,view.applicationId()).update();
            journal.append(claim.taskId(),"VERIFY","completion",Map.of("versionId",version,"buildId",buildId,
                    "verificationId",verification.path("id").asText(),"sourceDigest",draft.path("sourceDigest").asText(),"artifactDigest",artifact));
            return view;
        });
    }
    /** Preserve real nonzero failures in SQL; exit 0/null failures remain in the private internal report. */
    public void failedBuild(TaskQueueService.Claim claim, JsonNode draft, JsonNode result) {
        tx.executeWithoutResult(s -> {
            lock(claim,TaskStatus.VERIFY);
            JsonNode build=result.path("build");
            if (build.path("exitCode").isIntegralNumber() && build.path("exitCode").asInt()>0 && build.path("completedAt").isString()) {
                jdbc.sql("INSERT INTO builds(id,task_id,version_id,status,exit_code,created_at,completed_at) VALUES (?,?,?,'FAILED',?,CAST(? AS timestamptz),CAST(? AS timestamptz))")
                    .params(UUID.fromString(build.path("id").asText()),claim.taskId(),UUID.fromString(draft.path("versionId").asText()),
                        build.path("exitCode").asInt(),build.path("createdAt").asText(),build.path("completedAt").asText()).update();
            }
            jdbc.sql("UPDATE application_versions SET status='FAILED',row_version=row_version+1,updated_at=clock_timestamp() WHERE id=? AND status='DRAFT'")
                    .param(UUID.fromString(draft.path("versionId").asText())).update();
        });
    }
}
