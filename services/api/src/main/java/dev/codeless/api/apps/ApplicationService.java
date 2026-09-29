package dev.codeless.api.apps;

import dev.codeless.api.auth.AuthFailure;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ApplicationService {
    // SHA-256 of the empty byte sequence. A DRAFT shell has no generated source artifact yet.
    private static final String EMPTY_SOURCE_DIGEST =
            "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    private static final String SELECT = """
            SELECT a.*, v.id AS base_version_id FROM applications a
            LEFT JOIN application_versions v ON v.application_id = a.id AND v.number = 1
            """;
    private final JdbcClient jdbc;

    public ApplicationService(JdbcClient jdbc) { this.jdbc = jdbc; }

    public record ApplicationView(UUID id, String name, String description, String template,
                                  String dataMode, String status, UUID baseVersionId,
                                  UUID latestReadyVersionId, OffsetDateTime createdAt,
                                  OffsetDateTime updatedAt) {}

    public record PageView(List<ApplicationView> items, int page, int size, long total) {}

    public record VersionView(UUID id, UUID applicationId, int number, String sourceDigest,
                              String status, UUID buildId, OffsetDateTime createdAt) {}

    @Transactional
    public ApplicationView create(UUID ownerId, String name, String description, String dataMode) {
        UUID applicationId = UUID.randomUUID();
        UUID versionId = UUID.randomUUID();
        jdbc.sql("INSERT INTO applications(id,owner_id,name,description,template,data_mode) "
                + "VALUES (?,?,?,?,'VUE',?)")
                .params(applicationId, ownerId, name, description, dataMode).update();
        jdbc.sql("INSERT INTO application_versions(id,application_id,number,source_digest,status) "
                + "VALUES (?,?,1,?,'DRAFT')")
                .params(versionId, applicationId, EMPTY_SOURCE_DIGEST).update();
        return find(ownerId, applicationId).orElseThrow();
    }

    public Optional<ApplicationView> find(UUID ownerId, UUID applicationId) {
        return jdbc.sql(SELECT + " WHERE a.id = ? AND a.owner_id = ?")
                .params(applicationId, ownerId).query(ApplicationService::application).optional();
    }

    public PageView list(UUID ownerId, int page, int size) {
        long total = jdbc.sql("SELECT count(*) FROM applications WHERE owner_id = ?")
                .param(ownerId).query(Long.class).single();
        List<ApplicationView> items = jdbc.sql(SELECT + " WHERE a.owner_id = ? "
                + "ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?")
                .params(ownerId, size, (long) page * size)
                .query(ApplicationService::application).list();
        return new PageView(items, page, size, total);
    }

    @Transactional
    public ApplicationView rename(UUID ownerId, UUID applicationId, String name) {
        int changed = jdbc.sql("UPDATE applications SET name = ?, row_version = row_version + 1, "
                + "updated_at = now() WHERE id = ? AND owner_id = ?")
                .params(name, applicationId, ownerId).update();
        if (changed != 1) throw new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND");
        return find(ownerId, applicationId).orElseThrow();
    }

    public Optional<VersionView> version(UUID ownerId, UUID versionId) {
        return jdbc.sql("""
                SELECT v.* FROM application_versions v
                JOIN applications a ON a.id = v.application_id
                WHERE v.id = ? AND a.owner_id = ?
                """).params(versionId, ownerId).query((rs, row) -> new VersionView(
                uuid(rs, "id"), uuid(rs, "application_id"), rs.getInt("number"),
                rs.getString("source_digest"), rs.getString("status"), uuid(rs, "build_id"),
                rs.getObject("created_at", OffsetDateTime.class))).optional();
    }

    private static ApplicationView application(ResultSet rs, int row) throws SQLException {
        return new ApplicationView(uuid(rs, "id"), rs.getString("name"), rs.getString("description"),
                rs.getString("template"), rs.getString("data_mode"), rs.getString("status"),
                uuid(rs, "base_version_id"), uuid(rs, "latest_ready_version_id"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    private static UUID uuid(ResultSet rs, String column) throws SQLException {
        return (UUID) rs.getObject(column);
    }
}
