package dev.codeless.api.versions;

import dev.codeless.api.auth.AuthFailure;
import java.util.Objects;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Explicit owner action. Reuses the usable preview/edit-base pointer; never rewrites a version or publication. */
@Service
public class VersionRestoreService {
    private final JdbcClient jdbc;
    private final SnapshotStore snapshots;
    public VersionRestoreService(JdbcClient jdbc, SnapshotStore snapshots) {this.jdbc=jdbc;this.snapshots=snapshots;}
    public record View(UUID applicationId, UUID previousVersionId, UUID latestReadyVersionId) {}
    private record Current(UUID version, String status) {}
    private record Target(String status, String source, UUID build) {}
    private record Build(String artifact) {}

    @Transactional
    public View restore(UUID owner, UUID app, UUID target, UUID expected) {
        var current=jdbc.sql("SELECT latest_ready_version_id,status FROM applications WHERE id=? AND owner_id=? FOR UPDATE")
                .params(app,owner).query((rs,n)->new Current(rs.getObject(1,UUID.class),rs.getString(2))).optional()
                .orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND"));
        var version=jdbc.sql("SELECT status,source_digest,build_id FROM application_versions WHERE id=? AND application_id=?")
                .params(target,app).query((rs,n)->new Target(rs.getString(1),rs.getString(2),rs.getObject(3,UUID.class))).optional()
                .orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND"));
        if(!"ACTIVE".equals(current.status())) conflict("RESTORE_APPLICATION_UNAVAILABLE");
        if(!"VERIFIED".equals(version.status())) conflict("RESTORE_VERSION_UNAVAILABLE");
        if(!Objects.equals(expected,current.version())) conflict("RESTORE_VERSION_CONFLICT");
        // Same lock as edit creation and READY commit. Queued tasks count too; no implicit cancellation/rebase.
        if(jdbc.sql("SELECT EXISTS(SELECT 1 FROM generation_tasks WHERE application_id=? AND queue_state IN ('QUEUED','RUNNING'))")
                .param(app).query(Boolean.class).single()) conflict("RESTORE_TASK_ACTIVE");
        var build=jdbc.sql("""
                SELECT artifact_digest FROM builds WHERE id=? AND version_id=? AND status='SUCCEEDED'
                  AND exit_code=0 AND completed_at IS NOT NULL AND artifact_digest IS NOT NULL
                """).params(version.build(),target).query((rs,n)->new Build(rs.getString(1))).optional()
                .orElseThrow(() -> new AuthFailure(HttpStatus.CONFLICT,"RESTORE_VERSION_UNAVAILABLE"));
        // Hash-check the immutable source, report and actual artifacts before moving visibility.
        var outcome=snapshots.outcome(target,version.source(),"VERIFIED");
        var report=outcome.report();
        if(!build.artifact().equals(outcome.artifactDigest()) || !version.build().toString().equals(report.path("buildId").asText())
                || !"SUCCEEDED".equals(report.path("buildStatus").asText()) || !report.path("exitCode").isIntegralNumber()
                || report.path("exitCode").asInt()!=0 || !"PASSED".equals(report.path("verificationStatus").asText()))
            throw new SnapshotFailure("SNAPSHOT_REPORT_INVALID");
        if(!target.equals(current.version()))
            jdbc.sql("UPDATE applications SET latest_ready_version_id=?,row_version=row_version+1,updated_at=clock_timestamp() WHERE id=?")
                    .params(target,app).update();
        return new View(app,current.version(),target);
    }
    private static void conflict(String code) {throw new AuthFailure(HttpStatus.CONFLICT,code);}
}
