package dev.codeless.api.data;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.codeless.api.data.PlatformModels.DataMode;
import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import java.sql.Connection;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

class DataIntegrationTest extends PostgresTestBase {
    @Autowired Flyway flyway;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired Environment environment;
    @Autowired PlatformRepository repository;
    @Autowired ArtifactRepository artifacts;
    @Autowired TaskProgressService progress;

    @Test
    void freshDatabaseMigratesOnceAndSecondRunDoesNotRecreateTables() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success", Integer.class))
                .isEqualTo(1);
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success", Integer.class))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM information_schema.tables "
                + "WHERE table_schema = 'public' AND table_name IN "
                + "('platform_users','applications','generation_tasks','task_events',"
                + "'application_versions','builds','publications','model_calls')", Integer.class)).isEqualTo(8);
    }

    @Test
    void uniqueAndForeignKeysRejectInvalidRows() {
        UUID user = UUID.randomUUID();
        repository.createUser(user, "Owner-" + user + "@example.test", "Owner");
        assertThatThrownBy(() -> repository.createUser(UUID.randomUUID(),
                "owner-" + user + "@EXAMPLE.TEST", "Duplicate"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> repository.createApplication(UUID.randomUUID(), UUID.randomUUID(),
                "orphan", DataMode.MOCK)).isInstanceOf(DataIntegrityViolationException.class);

        UUID app = UUID.randomUUID();
        repository.createApplication(app, user, "Test app", DataMode.MOCK);
        UUID version = UUID.randomUUID();
        String digest = "sha256:" + "a".repeat(64);
        jdbc.update("INSERT INTO application_versions(id,application_id,number,source_digest,status) "
                + "VALUES (?,?,1,?,'DRAFT')", version, app, digest);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO application_versions"
                + "(id,application_id,number,source_digest,status) VALUES (?,?,1,?,'DRAFT')",
                UUID.randomUUID(), app, digest)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE application_versions SET source_digest=? WHERE id=?",
                "sha256:" + "b".repeat(64), version)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO publications"
                + "(id,application_id,version_id,requested_by,status) VALUES (?,?,?,?,'REQUESTED')",
                UUID.randomUUID(), app, version, user)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void failedEventInsertRollsBackStateAndSequence() {
        UUID task = TestData.task(repository, DataMode.STATIC).taskId();

        assertThatThrownBy(() -> progress.transition(task, TaskStatus.GENERATE,
                EventType.STAGE_STARTED, "", null)).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(repository.findTask(task).orElseThrow().status()).isEqualTo(TaskStatus.PLAN);
        assertThat(repository.findTask(task).orElseThrow().eventSequence()).isEqualTo(1);
        assertThat(repository.findTask(task).orElseThrow().rowVersion()).isZero();
        assertThat(repository.listEvents(task)).singleElement().satisfies(event -> {
            assertThat(event.sequence()).isEqualTo(1);
            assertThat(event.stage()).isEqualTo(TaskStatus.PLAN);
        });

        progress.transition(task, TaskStatus.GENERATE, EventType.STAGE_STARTED, "Generating", null);
        assertThat(repository.findTask(task).orElseThrow().status()).isEqualTo(TaskStatus.GENERATE);
        assertThat(repository.findTask(task).orElseThrow().rowVersion()).isEqualTo(1);
        assertThat(repository.listEvents(task)).hasSize(2);
        assertThat(repository.listEvents(task).get(1)).satisfies(event -> {
            assertThat(event.sequence()).isEqualTo(2);
            assertThat(event.stage()).isEqualTo(TaskStatus.GENERATE);
        });
        assertThatThrownBy(() -> progress.transition(task, TaskStatus.READY,
                EventType.STAGE_COMPLETED, "Ready", null)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void failedInitialEventInsertRollsBackTaskCreation() {
        TestData.Seed seed = TestData.task(repository, DataMode.STATIC);
        UUID task = UUID.randomUUID();
        String constraint = "task_events_reject_initial_event_test";
        jdbc.execute("ALTER TABLE task_events ADD CONSTRAINT " + constraint
                + " CHECK (task_id <> '" + task + "'::uuid)");
        try {
            assertThatThrownBy(() -> repository.createTask(task, seed.applicationId(), "Create a page"))
                    .isInstanceOf(DataIntegrityViolationException.class)
                    .hasMessageContaining(constraint);
        } finally {
            jdbc.execute("ALTER TABLE task_events DROP CONSTRAINT " + constraint);
        }
        assertThat(repository.findTask(task)).isEmpty();
        assertThat(repository.listEvents(task)).isEmpty();
    }

    @Test
    void buildQueueRejectsTaskAndVersionFromDifferentApplications() {
        TestData.Seed first = TestData.task(repository, DataMode.MOCK);
        TestData.Seed second = TestData.task(repository, DataMode.STATIC);
        UUID version = UUID.randomUUID();
        artifacts.createDraftVersion(version, second.applicationId(), 1, "sha256:" + "a".repeat(64));
        UUID rejectedBuild = UUID.randomUUID();

        assertThatThrownBy(() -> artifacts.queueBuild(rejectedBuild, first.taskId(), version))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("same application");
        assertThat(artifacts.findBuild(rejectedBuild)).isEmpty();

        UUID validBuild = UUID.randomUUID();
        assertThat(artifacts.queueBuild(validBuild, second.taskId(), version).id()).isEqualTo(validBuild);
    }

    @Test
    void testProfileUsesContainerInsteadOfProductionVariable() throws Exception {
        assertThat(environment.getActiveProfiles()).contains("test");
        assertThat(environment.getProperty("CODELESS_DATABASE_URL"))
                .isEqualTo("jdbc:postgresql://127.0.0.1:1/must_not_connect");
        try (Connection connection = dataSource.getConnection()) {
            assertThat(connection.getMetaData().getURL()).isEqualTo(POSTGRES.getJdbcUrl());
            assertThat(connection.getCatalog()).isEqualTo("codeless_test");
        }
    }

    @Test
    void verifiedBuildPermitsOnlyOwnerPublicationAndKeepsSourceImmutable() {
        TestData.Seed seed = TestData.task(repository, DataMode.LOCAL_STORAGE);
        UUID owner = seed.ownerId();
        UUID app = seed.applicationId();
        UUID task = seed.taskId();
        UUID stranger = UUID.randomUUID();
        repository.createUser(stranger, stranger + "@example.test", "Stranger");
        UUID version = UUID.randomUUID();
        artifacts.createDraftVersion(version, app, 1, "sha256:" + "a".repeat(64));
        UUID build = UUID.randomUUID();
        artifacts.queueBuild(build, task, version);
        assertThatThrownBy(() -> jdbc.update("UPDATE application_versions SET status='VERIFIED', "
                + "build_id=? WHERE id=?", build, version)).isInstanceOf(DataIntegrityViolationException.class);

        jdbc.update("UPDATE builds SET status='RUNNING' WHERE id=?", build);
        jdbc.update("UPDATE builds SET status='SUCCEEDED', exit_code=0, artifact_digest=?, "
                + "completed_at=now() WHERE id=?", "sha256:" + "b".repeat(64), build);
        jdbc.update("UPDATE application_versions SET status='VERIFIED', build_id=? WHERE id=?", build, version);
        jdbc.update("UPDATE applications SET latest_ready_version_id=? WHERE id=?", version, app);
        assertThatThrownBy(() -> jdbc.update("UPDATE builds SET status='FAILED', exit_code=1 WHERE id=?", build))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE application_versions SET status='FAILED' WHERE id=?", version))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> artifacts.requestPublication(UUID.randomUUID(), app, version, stranger))
                .isInstanceOf(DataIntegrityViolationException.class);
        UUID publication = UUID.randomUUID();
        assertThat(artifacts.requestPublication(publication, app, version, owner).status().name())
                .isEqualTo("REQUESTED");
        assertThatThrownBy(() -> jdbc.update("UPDATE publications SET requested_by=? WHERE id=?", stranger, publication))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(artifacts.findVersion(version).orElseThrow().sourceDigest())
                .isEqualTo("sha256:" + "a".repeat(64));
        assertThat(artifacts.requestModelCall(UUID.randomUUID(), task, TaskStatus.PLAN,
                "mock-provider", "deterministic-test").inputTokens()).isNull();
    }

    @Test
    void fourthRepairIsRejectedWithoutAnEvent() {
        UUID task = TestData.task(repository, DataMode.MOCK).taskId();
        progress.transition(task, TaskStatus.GENERATE, EventType.STAGE_STARTED, "Generate", null);
        for (int attempt = 1; attempt <= 3; attempt++) {
            progress.transition(task, TaskStatus.VERIFY, EventType.STAGE_STARTED, "Verify", null);
            progress.transition(task, TaskStatus.REPAIR, EventType.REPAIR_REQUESTED, "Repair", null);
            progress.transition(task, TaskStatus.GENERATE, EventType.STAGE_STARTED, "Generate", null);
        }
        progress.transition(task, TaskStatus.VERIFY, EventType.STAGE_STARTED, "Verify", null);
        int eventsBefore = repository.listEvents(task).size();
        assertThatThrownBy(() -> progress.transition(task, TaskStatus.REPAIR,
                EventType.REPAIR_REQUESTED, "Repair", null)).isInstanceOf(IllegalStateException.class);
        assertThat(repository.findTask(task).orElseThrow().status()).isEqualTo(TaskStatus.VERIFY);
        assertThat(repository.findTask(task).orElseThrow().repairAttempts()).isEqualTo(3);
        assertThat(repository.listEvents(task)).hasSize(eventsBefore);
    }
}
