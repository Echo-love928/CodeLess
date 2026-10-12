package dev.codeless.api.edit;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.tasks.TaskQueueService;
import dev.codeless.api.versions.SnapshotStore;
import java.util.Objects;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EditTaskService {
    private final JdbcClient jdbc;
    private final PlatformRepository repository;
    private final TaskQueueService queue;
    private final SnapshotStore snapshots;
    public EditTaskService(JdbcClient jdbc, PlatformRepository repository, TaskQueueService queue, SnapshotStore snapshots) {
        this.jdbc=jdbc; this.repository=repository; this.queue=queue; this.snapshots=snapshots;
    }
    public record View(TaskQueueService.TaskView task, UUID baseVersionId, EditMetadata.Source source) {}
    @Transactional
    public View create(UUID owner, UUID app, UUID base, String prompt, EditMetadata.Source source, String key) {
        jdbc.sql("SELECT id FROM applications WHERE id=? AND owner_id=? FOR UPDATE").params(app,owner)
                .query(UUID.class).optional().orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND"));
        var link=new EditMetadata.Link(base,source);
        if(key!=null) {
            var prior=jdbc.sql("SELECT id FROM generation_tasks WHERE application_id=? AND idempotency_key=?")
                    .params(app,key).query(UUID.class).optional();
            if(prior.isPresent()) {
                var task=queue.find(owner,prior.get()).orElseThrow();
                if(!task.prompt().equals(prompt) || !EditMetadata.find(jdbc,prior.get()).equals(java.util.Optional.of(link)))
                    throw new AuthFailure(HttpStatus.CONFLICT,"IDEMPOTENCY_CONFLICT");
                return new View(task,base,source);
            }
        }
        // Ownership before conflict: a forged/foreign base cannot reveal another application's state.
        String digest=jdbc.sql("SELECT source_digest FROM application_versions WHERE id=? AND application_id=? AND status='VERIFIED'")
                .params(base,app).query(String.class).optional()
                .orElseThrow(() -> new AuthFailure(HttpStatus.CONFLICT,"EDIT_BASE_UNAVAILABLE"));
        UUID current=jdbc.sql("SELECT latest_ready_version_id FROM applications WHERE id=?").param(app).query(UUID.class).single();
        if(!Objects.equals(base,current)) throw new EditConflict(app,base,current,prompt,source);
        if(jdbc.sql("SELECT EXISTS(SELECT 1 FROM generation_tasks WHERE application_id=? AND queue_state IN ('QUEUED','RUNNING'))")
                .param(app).query(Boolean.class).single()) throw new AuthFailure(HttpStatus.CONFLICT,"EDIT_TASK_ACTIVE");
        snapshots.source(base,digest); // Real immutable source required; initial shell/absent/corrupt snapshots fail closed.
        UUID task=UUID.randomUUID();
        repository.createQueuedTask(task,app,prompt,key,EditMetadata.encode(link));
        return new View(queue.find(owner,task).orElseThrow(),base,source);
    }
    public View get(UUID owner, UUID task) {
        var view=queue.find(owner,task).orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND"));
        var link=EditMetadata.find(jdbc,task).orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND"));
        return new View(view,link.baseVersionId(),link.source());
    }
}
