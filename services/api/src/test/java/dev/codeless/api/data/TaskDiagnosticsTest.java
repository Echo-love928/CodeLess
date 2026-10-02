package dev.codeless.api.data;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

import dev.codeless.api.auth.AuthFilter;
import dev.codeless.api.data.PlatformModels.DataMode;
import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.data.TaskDiagnosticsService.FileChange;
import dev.codeless.api.tasks.TaskQueueService;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@TestPropertySource(properties = {
        "CODELESS_DEMO_PASSWORD=demo-password-for-test-only",
        "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only"
})
class TaskDiagnosticsTest extends PostgresTestBase {
    @Autowired TaskDiagnosticsService diagnostics;
    @Autowired PlatformRepository repository;
    @Autowired ArtifactRepository artifacts;
    @Autowired TaskQueueService queue;
    @Autowired JdbcTemplate jdbc;
    @Autowired WebApplicationContext context;
    @Autowired AuthFilter filter;
    MockMvc mvc;
    static final String DIGEST = "sha256:" + "a".repeat(64);
    record Seed(UUID owner, UUID app, TaskQueueService.Claim claim) {}
    record Browser(MockHttpSession session, String csrf) {}

    @BeforeEach void setup() {
        jdbc.update("UPDATE generation_tasks SET queue_state='FINISHED', lease_token=NULL, lease_expires_at=NULL WHERE queue_state IN ('QUEUED','RUNNING')");
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(filter).build();
    }

    Seed seed(UUID owner) {
        UUID app = UUID.randomUUID();
        repository.createApplication(app, owner, "Diagnostics fixture", DataMode.MOCK);
        queue.create(owner, app, "Deterministic structured metadata fixture", null);
        var claim = queue.claim().orElseThrow();
        queue.advance(claim, TaskStatus.GENERATE, EventType.STAGE_STARTED, "Fixture stage", null);
        return new Seed(owner, app, claim);
    }

    Seed seed() {
        UUID owner = UUID.randomUUID();
        repository.createUser(owner, owner + "@example.test", "Owner");
        return seed(owner);
    }

    List<FileChange> changes() { return List.of(new FileChange("src/pages/Home.vue", "ADDED", null, DIGEST)); }

    @Test void persistsVersionedMetadataAndAtomicEventWithoutChangingStageAndRejectsWritesAfterCancel() {
        Seed seed = seed();
        UUID id = seed.claim().taskId();
        assertThat(diagnostics.read(seed.owner(), id).files().available()).isFalse();
        assertThat(diagnostics.recordFiles(id, seed.claim().token(), 0, changes())).isEqualTo(1);
        assertThat(diagnostics.read(seed.owner(), id).files().changes()).isEqualTo(changes());
        assertThat(repository.listEvents(id)).hasSize(3).last().extracting(PlatformModels.Event::type).isEqualTo(EventType.TOOL_RESULT);
        assertThat(repository.findTask(id).orElseThrow().status()).isEqualTo(TaskStatus.GENERATE);
        assertThat(diagnostics.recordFiles(id, seed.claim().token(), 1, List.of())).isEqualTo(2);
        var empty = diagnostics.read(seed.owner(), id).files();
        assertThat(empty.available()).isTrue();
        assertThat(empty.changes()).isEmpty();
        assertThatThrownBy(() -> diagnostics.recordFiles(id, seed.claim().token(), 1, changes())).isInstanceOf(IllegalStateException.class);
        queue.cancel(seed.owner(), id);
        assertThatThrownBy(() -> diagnostics.recordFiles(id, seed.claim().token(), 2, changes())).isInstanceOf(IllegalStateException.class);
        assertThat(diagnostics.read(seed.owner(), id).files().revision()).isEqualTo(2);
        assertThat(repository.listEvents(id)).hasSize(5);
    }

    @Test void rejectsUnsafeMetadataAndInvalidLeaseWithoutPartialPersistence() {
        Seed seed = seed();
        UUID id = seed.claim().taskId();
        List<List<FileChange>> invalid = new ArrayList<>();
        invalid.add(List.of(new FileChange("../../.env", "ADDED", null, DIGEST)));
        invalid.add(List.of(new FileChange("src/pages/Home.vue", "ADDED", DIGEST, DIGEST)));
        invalid.add(List.of(new FileChange("src/pages/Home.vue", "MODIFIED", DIGEST, DIGEST)));
        invalid.add(List.of(new FileChange("src/pages/Home.vue", "DELETED", "bad", null)));
        invalid.add(List.of(changes().getFirst(), changes().getFirst()));
        invalid.add(java.util.Collections.nCopies(41, changes().getFirst()));
        for (var value : invalid) assertThatThrownBy(() -> diagnostics.recordFiles(id, seed.claim().token(), 0, value)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> diagnostics.recordFiles(id, UUID.randomUUID(), 0, changes())).isInstanceOf(IllegalStateException.class);
        jdbc.update("UPDATE generation_tasks SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=?", id);
        assertThatThrownBy(() -> diagnostics.recordFiles(id, seed.claim().token(), 0, changes())).isInstanceOf(IllegalStateException.class);
        assertThat(diagnostics.read(seed.owner(), id).files().available()).isFalse();
        assertThat(repository.listEvents(id)).hasSize(2);
    }

    @Test void twoWritersWithTheSameExpectedRevisionCommitOnlyOneSnapshotAndOneEvent() throws Exception {
        Seed seed = seed();
        var pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            java.util.concurrent.Callable<Boolean> write = () -> {
                start.await();
                try { diagnostics.recordFiles(seed.claim().taskId(), seed.claim().token(), 0, changes()); return true; }
                catch (IllegalStateException exception) { return false; }
            };
            var first = pool.submit(write); var second = pool.submit(write);
            start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
            assertThat(diagnostics.read(seed.owner(), seed.claim().taskId()).files().revision()).isEqualTo(1);
            assertThat(repository.listEvents(seed.claim().taskId())).hasSize(3);
        } finally { pool.shutdownNow(); }
    }

    Browser login(String email, String password) throws Exception {
        var csrf = mvc.perform(get("/api/v0/auth/csrf")).andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) csrf.getRequest().getSession(false);
        String token = (String) session.getAttribute(AuthFilter.CSRF);
        mvc.perform(post("/api/v0/auth/login").session(session).header("X-CSRF-Token", token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk());
        return new Browser(session, token);
    }

    @Test void httpReadsOwnedPersistedBuildsExcludesRawLogsAndRejectsForeignAnonymousAndWriteRequests() throws Exception {
        Browser owner = login("demo@codeless.local", "demo-password-for-test-only");
        Seed seed = seed((UUID) owner.session().getAttribute(AuthFilter.USER_ID));
        UUID id = seed.claim().taskId();
        diagnostics.recordFiles(id, seed.claim().token(), 0, changes());
        UUID version = UUID.randomUUID(), build = UUID.randomUUID();
        artifacts.createDraftVersion(version, seed.app(), 1, DIGEST);
        artifacts.queueBuild(build, id, version);
        String path = "/api/v0/tasks/" + id + "/diagnostics";
        String queued = mvc.perform(get(path).session(owner.session())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        // Null is part of the public schema; an omitted field must not be mistaken for a valid result.
        assertThat(queued).contains("\"beforeDigest\":null", "\"exitCode\":null",
                "\"artifactDigest\":null", "\"completedAt\":null");
        jdbc.update("UPDATE builds SET status='FAILED', exit_code=2, completed_at=clock_timestamp(), log_url='https://internal.invalid/secret-token' WHERE id=?", build);
        String json = mvc.perform(get(path).session(owner.session())).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.taskId").value(id.toString()))
                .andExpect(jsonPath("$.files.changes[0].path").value("src/pages/Home.vue"))
                .andExpect(jsonPath("$.builds[0].exitCode").value(2))
                .andExpect(jsonPath("$.builds[0].status").value("FAILED"))
                .andReturn().getResponse().getContentAsString();
        assertThat(json).doesNotContain("logUrl", "log_url", "secret-token", "lease", "rawLog");
        assertThat(json).contains("\"beforeDigest\":null", "\"artifactDigest\":null");
        Browser foreign = login("admin@codeless.local", "admin-password-for-test-only");
        mvc.perform(get(path).session(foreign.session())).andExpect(status().isNotFound());
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v0/tasks/bad/diagnostics").session(owner.session())).andExpect(status().isBadRequest());
        mvc.perform(post(path).session(owner.session()).header("X-CSRF-Token", owner.csrf()))
                .andExpect(status().isMethodNotAllowed());
        assertThat(repository.findTask(id).orElseThrow().status()).isEqualTo(TaskStatus.GENERATE);
    }

    @Test void corruptPersistedPathsFailClosedInsteadOfReturningPrivateMetadata() {
        Seed seed = seed();
        UUID id = seed.claim().taskId();
        diagnostics.recordFiles(id, seed.claim().token(), 0, changes());
        jdbc.update("UPDATE task_file_snapshots SET changes=?::jsonb WHERE task_id=?",
                "[{\"path\":\"/private/secret\",\"operation\":\"ADDED\",\"beforeDigest\":null,\"afterDigest\":\"" + DIGEST + "\"}]", id);
        assertThatThrownBy(() -> diagnostics.read(seed.owner(), id)).isInstanceOf(IllegalArgumentException.class);
        assertThat(repository.findTask(id).orElseThrow().status()).isEqualTo(TaskStatus.GENERATE);
    }
}
