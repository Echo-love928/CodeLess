package dev.codeless.api.agent;

import dev.codeless.api.tasks.TaskQueueService;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.tools.FileToolService;
import dev.codeless.api.versions.SnapshotStore;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;

/** Database row lock fences every private checkpoint and version commit with the original lease. */
public final class AgentRunStore {
    public record Context(String prompt, String dataMode, OffsetDateTime deadline, int repairAttempts) {}
    private final JdbcClient jdbc;
    private final TransactionTemplate tx;
    private final AgentJournal journal;
    private final SnapshotStore snapshots;
    public AgentRunStore(JdbcClient jdbc, PlatformTransactionManager manager, AgentJournal journal, SnapshotStore snapshots) {
        this.jdbc=jdbc; this.tx=new TransactionTemplate(manager); this.journal=journal; this.snapshots=snapshots;
    }
    private Context lock(TaskQueueService.Claim claim, TaskStatus stage) {
        jdbc.sql("SELECT id FROM generation_tasks WHERE id=? FOR UPDATE").param(claim.taskId())
                .query(UUID.class).optional().orElseThrow(() -> new AgentFailure("AGENT_TASK_UNAVAILABLE"));
        return jdbc.sql("""
                SELECT t.prompt,a.data_mode,t.deadline_at,t.repair_attempts FROM generation_tasks t
                JOIN applications a ON a.id=t.application_id WHERE t.id=? AND t.lease_token=?
                AND t.status=? AND t.queue_state='RUNNING' AND t.deadline_at>clock_timestamp()
                AND t.lease_expires_at>clock_timestamp()
                """).params(claim.taskId(),claim.token(),stage.name()).query((rs,n) -> new Context(
                rs.getString(1),rs.getString(2),rs.getObject(3,OffsetDateTime.class),rs.getInt(4))).optional()
                .orElseThrow(() -> new AgentFailure("AGENT_LEASE_INVALID"));
    }
    public Context context(TaskQueueService.Claim claim, TaskStatus stage) { return tx.execute(s -> lock(claim,stage)); }
    public Optional<JsonNode> editContext(TaskQueueService.Claim claim, TaskStatus stage) {
        return tx.execute(s -> {
            lock(claim,stage);
            return dev.codeless.api.edit.EditMetadata.find(jdbc,claim.taskId()).map(link -> {
                String digest=baseDigest(claim,link.baseVersionId());
                var source=snapshots.source(link.baseVersionId(),digest);
                if("COMPONENT".equals(link.source().type())) {
                    dev.codeless.api.edit.LocalEditScope.verify(link,source,snapshots.componentMapping(link.baseVersionId(),digest));
                    return dev.codeless.api.edit.LocalEditScope.context(link,source,snapshots.readSource(link.baseVersionId(),digest,link.source().sourceFile()));
                }
                var contents=source.manifest().files().stream().map(f -> Map.of("path",f.path(),"digest",f.digest(),
                        "content",snapshots.readSource(link.baseVersionId(),digest,f.path()))).toList();
                return (JsonNode) tools.jackson.databind.json.JsonMapper.builder().build().valueToTree(Map.of(
                        "baseVersionId",link.baseVersionId(),"source",link.source(),"sourceFiles",contents));
            });
        });
    }
    /** Preserve the validated baseline structure locally; no unrelated plan/source goes to the model. */
    public JsonNode componentPlan(TaskQueueService.Claim claim) {
        return tx.execute(s -> {
            lock(claim,TaskStatus.PLAN);
            var link=dev.codeless.api.edit.EditMetadata.find(jdbc,claim.taskId()).orElseThrow();
            UUID task=jdbc.sql("SELECT source_task_id FROM application_versions WHERE id=?").param(link.baseVersionId()).query(UUID.class).single();
            var plan=AgentJournal.latest(journal.read(task),"plan").deepCopy();
            var source=snapshots.source(link.baseVersionId(),baseDigest(claim,link.baseVersionId()));
            var planned=new TreeSet<String>();plan.path("files").forEach(f -> planned.add(f.path("path").asText()));
            if(!planned.equals(new TreeSet<>(source.manifest().files().stream().map(SnapshotStore.Entry::path).toList())))
                throw new AgentFailure("COMPONENT_BASE_PLAN_MISMATCH");
            return plan;
        });
    }
    public void checkComponentSnapshot(TaskQueueService.Claim claim,JsonNode files) {
        tx.executeWithoutResult(s -> {
            lock(claim,TaskStatus.GENERATE);
            dev.codeless.api.edit.EditMetadata.find(jdbc,claim.taskId()).filter(link -> "COMPONENT".equals(link.source().type())).ifPresent(link ->
                    dev.codeless.api.edit.LocalEditScope.unchanged(snapshots.source(link.baseVersionId(),baseDigest(claim,link.baseVersionId())).manifest(),files,link.source().sourceFile()));
        });
    }
    public Optional<SnapshotStore.Source> editSource(TaskQueueService.Claim claim) {
        return tx.execute(s -> {
            lock(claim,TaskStatus.GENERATE);
            return dev.codeless.api.edit.EditMetadata.find(jdbc,claim.taskId())
                    .map(link -> snapshots.source(link.baseVersionId(),baseDigest(claim,link.baseVersionId())));
        });
    }
    private String baseDigest(TaskQueueService.Claim claim, UUID base) {
        return jdbc.sql("""
                SELECT v.source_digest FROM application_versions v JOIN generation_tasks t ON t.application_id=v.application_id
                WHERE t.id=? AND v.id=? AND v.status='VERIFIED'
                """).params(claim.taskId(),base).query(String.class).optional().orElseThrow(() -> new AgentFailure("EDIT_BASE_UNAVAILABLE"));
    }
    public List<JsonNode> read(TaskQueueService.Claim claim, TaskStatus stage) {
        return tx.execute(s -> { lock(claim,stage); return journal.read(claim.taskId()); });
    }
    public void append(TaskQueueService.Claim claim, TaskStatus stage, String kind, Object payload) {
        tx.executeWithoutResult(s -> { lock(claim,stage); journal.append(claim.taskId(),stage.name(),kind,payload); lock(claim,stage); });
    }
    public void reserve(TaskQueueService.Claim claim, TaskStatus stage, String kind, int tokens) {
        reserve(claim,stage,kind,tokens,1);
    }
    /**
     * Reserve one model request: the conservative input bound plus the largest output allowance the remaining
     * token cap permits. A request that cannot fund the provider minimum is refused here, before invocation.
     */
    public int reserveModel(TaskQueueService.Claim claim, TaskStatus stage, int inputReservation) {
        return tx.execute(s -> {
            lock(claim,stage);
            Integer output=RuntimeBudget.outputAllowance(RuntimeBudget.meter(journal.read(claim.taskId())),inputReservation);
            if(output==null) throw new AgentFailure("AGENT_MODEL_BUDGET_EXCEEDED");
            journal.append(claim.taskId(),stage.name(),"model.request",Map.of("reservedTokens",Math.addExact(inputReservation,output),
                    "slots",1,"outputTokens",output));
            return output;
        });
    }
    public void reserveVerification(TaskQueueService.Claim claim) {
        // Reserve both fixed operations before launch, even if the build later prevents the browser.
        reserve(claim,TaskStatus.VERIFY,"tool.request",0,2);
    }
    private void reserve(TaskQueueService.Claim claim, TaskStatus stage, String kind, int tokens, int slots) {
        tx.executeWithoutResult(s -> {
            lock(claim,stage);
            var events=journal.read(claim.taskId());
            var meter=RuntimeBudget.meter(events);
            if (kind.equals("model.request") && (meter.models()>=RuntimeBudget.MODEL_CALLS || tokens<1 || meter.chargedTokens()+tokens>RuntimeBudget.TOKENS))
                throw new AgentFailure("AGENT_MODEL_BUDGET_EXCEEDED");
            if (kind.equals("tool.request") && meter.tools()+slots>RuntimeBudget.TOOL_CALLS) throw new AgentFailure("AGENT_TOOL_BUDGET_EXCEEDED");
            if(!Set.of("model.request","tool.request").contains(kind)) throw new AgentFailure("AGENT_RESERVATION_INVALID");
            journal.append(claim.taskId(),stage.name(),kind,Map.of("reservedTokens",tokens,"slots",slots));
        });
    }
    /**
     * The source is frozen before the task row lock: the heartbeat renews the lease with an UPDATE of that row, so a
     * slow freeze inside the lock let the lease run out and the next check refuse a live worker (D20-B review). Until
     * the fenced INSERT commits, nothing references the new directory; a lost lease leaves an orphan for the sweeper.
     */
    public JsonNode draft(TaskQueueService.Claim claim, FileToolService.Snapshot snapshot, JsonNode actions) {
        tx.executeWithoutResult(s -> lock(claim,TaskStatus.GENERATE)); // A cancelled or expired worker freezes nothing.
        UUID version=UUID.randomUUID();
        var frozen=snapshots.freezeSource(version,snapshot.directory(),snapshot.source().sourceDigest(),
                tools.jackson.databind.json.JsonMapper.builder().build().valueToTree(snapshot.source().files()));
        return tx.execute(s -> {
            lock(claim,TaskStatus.GENERATE);
            UUID app=jdbc.sql("SELECT application_id FROM generation_tasks WHERE id=?").param(claim.taskId()).query(UUID.class).single();
            jdbc.sql("SELECT id FROM applications WHERE id=? FOR UPDATE").param(app).query(UUID.class).single();
            int number=jdbc.sql("SELECT coalesce(max(number),0)+1 FROM application_versions WHERE application_id=?")
                    .param(app).query(Integer.class).single();
            jdbc.sql("INSERT INTO application_versions(id,application_id,number,source_digest,status,source_task_id) VALUES (?,?,?,?,'DRAFT',?)")
                    .params(version,app,number,snapshot.source().sourceDigest(),claim.taskId()).update();
            journal.append(claim.taskId(),"GENERATE","draft",Map.of("versionId",version,"sourceDigest",snapshot.source().sourceDigest(),
                    "sourceDirectory",snapshot.directory().toString(),"frozenSourceDirectory",frozen.directory().toString(),
                    "files",frozen.manifest().files(),"actions",actions));
            lock(claim,TaskStatus.GENERATE);
            return AgentJournal.latest(journal.read(claim.taskId()),"draft");
        });
    }
    /**
     * The VERIFIED outcome is the one step a rollback cannot undo, so it is frozen last, after every check that can
     * still refuse this commit (edit base, DRAFT state, lease). Frozen first, a lease that ran out during the slow
     * freeze (the heartbeat waits on this row lock) rolled the commit back behind a VERIFIED outcome of a version
     * convergence then failed (D20-B review). The lock still excludes cancel and expiry recovery until commit.
     */
    public TaskQueueService.TaskView complete(TaskQueueService queue, TaskQueueService.Claim claim, JsonNode draft, JsonNode result) {
        return tx.execute(s -> {
            lock(claim,TaskStatus.VERIFY);
            UUID app=jdbc.sql("SELECT application_id FROM generation_tasks WHERE id=?").param(claim.taskId()).query(UUID.class).single();
            jdbc.sql("SELECT id FROM applications WHERE id=? FOR UPDATE").param(app).query(UUID.class).single();
            dev.codeless.api.edit.EditMetadata.find(jdbc,claim.taskId()).ifPresent(link -> {
                UUID latest=jdbc.sql("SELECT latest_ready_version_id FROM applications WHERE id=?").param(app).query(UUID.class).single();
                if(!link.baseVersionId().equals(latest)) throw new AgentFailure("EDIT_VERSION_CONFLICT");
            });
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
            snapshots.freezeOutcome(version,draft.path("sourceDigest").asText(),"VERIFIED",result,null);
            return view;
        });
    }
    /** Preserve real nonzero failures in SQL; exit 0/null failures remain in the private internal report. */
    public void failedBuild(TaskQueueService.Claim claim, JsonNode draft, JsonNode result) {
        tx.executeWithoutResult(s -> {
            lock(claim,TaskStatus.VERIFY);
            JsonNode build=result.path("build");
            snapshots.freezeOutcome(UUID.fromString(draft.path("versionId").asText()),draft.path("sourceDigest").asText(),"FAILED",result,null);
            if (build.path("exitCode").isIntegralNumber() && build.path("exitCode").asInt()>0 && build.path("completedAt").isString()) {
                jdbc.sql("INSERT INTO builds(id,task_id,version_id,status,exit_code,created_at,completed_at) VALUES (?,?,?,'FAILED',?,CAST(? AS timestamptz),CAST(? AS timestamptz))")
                    .params(UUID.fromString(build.path("id").asText()),claim.taskId(),UUID.fromString(draft.path("versionId").asText()),
                        build.path("exitCode").asInt(),build.path("createdAt").asText(),build.path("completedAt").asText()).update();
            }
            jdbc.sql("UPDATE application_versions SET status='FAILED',row_version=row_version+1,updated_at=clock_timestamp() WHERE id=? AND status='DRAFT'")
                    .param(UUID.fromString(draft.path("versionId").asText())).update();
        });
    }
    /** A rejected/unavailable VERIFY result cannot leave its candidate looking pending forever. */
    public void abandonDraft(TaskQueueService.Claim claim, String code) {
        tx.executeWithoutResult(s -> {
            lock(claim,TaskStatus.VERIFY);
            var draft=AgentJournal.latest(journal.read(claim.taskId()),"draft");
            UUID version=UUID.fromString(draft.path("versionId").asText());
            boolean pending=jdbc.sql("SELECT EXISTS(SELECT 1 FROM application_versions WHERE id=? AND status='DRAFT')")
                    .param(version).query(Boolean.class).single();
            if (!pending) return;
            snapshots.freezeOutcome(version,draft.path("sourceDigest").asText(),"FAILED",
                    tools.jackson.databind.json.JsonMapper.builder().build().createObjectNode(),code);
            jdbc.sql("UPDATE application_versions SET status='FAILED',row_version=row_version+1,updated_at=clock_timestamp() WHERE id=? AND status='DRAFT'")
                    .param(version).update();
        });
    }
}
