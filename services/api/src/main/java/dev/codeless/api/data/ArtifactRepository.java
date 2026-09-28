package dev.codeless.api.data;

import dev.codeless.api.data.PlatformModels.Build;
import dev.codeless.api.data.PlatformModels.BuildStatus;
import dev.codeless.api.data.PlatformModels.ModelCall;
import dev.codeless.api.data.PlatformModels.ModelCallStatus;
import dev.codeless.api.data.PlatformModels.Publication;
import dev.codeless.api.data.PlatformModels.PublicationStatus;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.data.PlatformModels.Version;
import dev.codeless.api.data.PlatformModels.VersionStatus;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Minimal typed access for artifacts; runner outcomes are supplied by trusted orchestration. */
@Repository
public class ArtifactRepository {
    private final JdbcClient jdbc;

    public ArtifactRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Version createDraftVersion(UUID id, UUID applicationId, int number, String sourceDigest) {
        jdbc.sql("INSERT INTO application_versions(id,application_id,number,source_digest,status) "
                + "VALUES (?,?,?,?,'DRAFT')").params(id, applicationId, number, sourceDigest).update();
        return findVersion(id).orElseThrow();
    }

    public Optional<Version> findVersion(UUID id) {
        return jdbc.sql("SELECT * FROM application_versions WHERE id = ?").param(id)
                .query(ArtifactRepository::version).optional();
    }

    public Build queueBuild(UUID id, UUID taskId, UUID versionId) {
        int inserted = jdbc.sql("""
                INSERT INTO builds(id, task_id, version_id, status)
                SELECT ?, t.id, v.id, 'QUEUED'
                FROM generation_tasks t
                JOIN application_versions v ON v.application_id = t.application_id
                WHERE t.id = ? AND v.id = ?
                """).params(id, taskId, versionId).update();
        if (inserted != 1) {
            throw new IllegalArgumentException("Build task and version must belong to the same application");
        }
        return findBuild(id).orElseThrow();
    }

    public Optional<Build> findBuild(UUID id) {
        return jdbc.sql("SELECT * FROM builds WHERE id = ?").param(id)
                .query(ArtifactRepository::build).optional();
    }

    public Publication requestPublication(UUID id, UUID applicationId, UUID versionId, UUID requestedBy) {
        jdbc.sql("INSERT INTO publications(id,application_id,version_id,requested_by,status) "
                + "VALUES (?,?,?,?,'REQUESTED')")
                .params(id, applicationId, versionId, requestedBy).update();
        return findPublication(id).orElseThrow();
    }

    public Optional<Publication> findPublication(UUID id) {
        return jdbc.sql("SELECT * FROM publications WHERE id = ?").param(id)
                .query(ArtifactRepository::publication).optional();
    }

    public ModelCall requestModelCall(UUID id, UUID taskId, TaskStatus stage, String provider, String model) {
        jdbc.sql("INSERT INTO model_calls(id,task_id,stage,provider,model,status) "
                + "VALUES (?,?,?,?,?,'REQUESTED')")
                .params(id, taskId, stage.name(), provider, model).update();
        return findModelCall(id).orElseThrow();
    }

    public Optional<ModelCall> findModelCall(UUID id) {
        return jdbc.sql("SELECT * FROM model_calls WHERE id = ?").param(id)
                .query(ArtifactRepository::modelCall).optional();
    }

    private static Version version(ResultSet rs, int row) throws SQLException {
        return new Version(uuid(rs, "id"), uuid(rs, "application_id"), rs.getInt("number"),
                rs.getString("source_digest"), VersionStatus.valueOf(rs.getString("status")),
                uuid(rs, "build_id"), rs.getLong("row_version"), time(rs, "created_at"),
                time(rs, "updated_at"));
    }

    private static Build build(ResultSet rs, int row) throws SQLException {
        return new Build(uuid(rs, "id"), uuid(rs, "task_id"), uuid(rs, "version_id"),
                BuildStatus.valueOf(rs.getString("status")), (Integer) rs.getObject("exit_code"),
                rs.getString("artifact_digest"), rs.getString("log_url"), rs.getLong("row_version"),
                time(rs, "created_at"), time(rs, "completed_at"));
    }

    private static Publication publication(ResultSet rs, int row) throws SQLException {
        return new Publication(uuid(rs, "id"), uuid(rs, "application_id"), uuid(rs, "version_id"),
                uuid(rs, "requested_by"), PublicationStatus.valueOf(rs.getString("status")),
                rs.getString("url"), rs.getLong("row_version"), time(rs, "created_at"),
                time(rs, "updated_at"), time(rs, "published_at"));
    }

    private static ModelCall modelCall(ResultSet rs, int row) throws SQLException {
        return new ModelCall(uuid(rs, "id"), uuid(rs, "task_id"),
                TaskStatus.valueOf(rs.getString("stage")), rs.getString("provider"), rs.getString("model"),
                ModelCallStatus.valueOf(rs.getString("status")), (Integer) rs.getObject("input_tokens"),
                (Integer) rs.getObject("output_tokens"), rs.getString("error_code"),
                rs.getLong("row_version"), time(rs, "created_at"), time(rs, "completed_at"));
    }

    private static UUID uuid(ResultSet rs, String column) throws SQLException {
        return (UUID) rs.getObject(column);
    }

    private static OffsetDateTime time(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, OffsetDateTime.class);
    }
}
