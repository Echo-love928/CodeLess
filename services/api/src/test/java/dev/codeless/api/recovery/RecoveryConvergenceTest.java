package dev.codeless.api.recovery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.data.PostgresTestBase;
import dev.codeless.api.tasks.TaskQueueService;
import dev.codeless.api.tasks.TaskScheduler;
import dev.codeless.api.tasks.TaskStageRunner;
import dev.codeless.api.versions.SnapshotStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;

/** D18-A-01/02 with real PostgreSQL: lease heartbeat, restart/expiry and cancel convergence, idempotent cleanup. */
class RecoveryConvergenceTest extends PostgresTestBase {
    @Autowired PlatformRepository repository;
    @Autowired TaskQueueService queue;
    @Autowired JdbcClient jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired SnapshotStore snapshots;
    @TempDir Path temporary;
    Path root;
    RunnerCleanup cleanup;

    @BeforeEach void isolate() throws Exception {
        jdbc.sql("UPDATE generation_tasks SET queue_state='FINISHED', lease_token=NULL, lease_expires_at=NULL "
                + "WHERE queue_state IN ('QUEUED','RUNNING')").update();
        root = temporary.toRealPath();
        cleanup = new RunnerCleanup(jdbc, transactions, root.resolve("agent/work"), root.resolve("workspaces"),
                root.resolve("agent/recovery/cleanup"));
    }

    /** The runner/D08 resources a worker leaves behind for {@code task}: scratch, working copy, immutable snapshot. */
    private Map<String, Path> resources(UUID task) throws Exception {
        var paths = new LinkedHashMap<String, Path>();
        paths.put("runnerScratch", RecoveryFixtures.write(root.resolve("agent/work/" + task + "/source-1/src/pages/HomePage.vue"), "scratch"));
        paths.put("workingCopy", RecoveryFixtures.write(root.resolve("workspaces/" + task + "/source/src/pages/HomePage.vue"), "working"));
        paths.put("pendingWrite", RecoveryFixtures.write(root.resolve("workspaces/" + task + "/.write-123.tmp"), "partial"));
        paths.put("snapshot", RecoveryFixtures.write(root.resolve("workspaces/" + task + "/snapshots/" + UUID.randomUUID() + "/src/pages/HomePage.vue"), "frozen"));
        return paths;
    }

    private int failedEvents(UUID task) {
        return jdbc.sql("SELECT count(*) FROM task_events WHERE task_id=? AND type='TASK_FAILED'").param(task).query(Integer.class).single();
    }

    private Map<String, Object> taskRow(UUID task) {
        return jdbc.sql("SELECT status, failure_code, queue_state, lease_token IS NULL AS lease_cleared, event_sequence FROM generation_tasks WHERE id=?")
                .param(task).query().singleRow();
    }

    private String versionStatus(UUID version) {
        return jdbc.sql("SELECT status FROM application_versions WHERE id=?").param(version).query(String.class).single();
    }

    @Test void d18aT2RepeatedAndConcurrentCancelsConvergeOnceAndNeverThrow() throws Exception {
        var seed = RecoveryFixtures.seed(repository, "D18 cancel convergence");
        UUID task = RecoveryFixtures.queuedTask(repository, seed.app(), "Generate a page, then get cancelled");
        var claim = queue.claim(Duration.ofSeconds(30)).orElseThrow();
        assertThat(claim.taskId()).isEqualTo(task);
        var draft = RecoveryFixtures.draft(jdbc, snapshots, temporary.resolve("src"), seed.app(), task, 1);
        var paths = resources(task);

        var first = queue.cancel(seed.owner(), task);
        assertThat(first.status()).isEqualTo(TaskStatus.FAILED);
        assertThat(first.failureCode()).isEqualTo("CANCELLED");

        var pool = Executors.newFixedThreadPool(12);
        var start = new CountDownLatch(1);
        var calls = new ArrayList<Callable<Object>>();
        for (int i = 0; i < 8; i++) calls.add(() -> { start.await(); return queue.cancel(seed.owner(), task).status(); });
        for (int i = 0; i < 4; i++) calls.add(() -> { start.await(); return queue.cancelAsAdministrator(task).orElseThrow().changed(); });
        for (int i = 0; i < 4; i++) calls.add(() -> { start.await(); return queue.recoverExpired().isPresent(); });
        for (int i = 0; i < 6; i++) calls.add(() -> { start.await(); return cleanup.request(task).status(); });
        List<Future<Object>> futures = calls.stream().map(pool::submit).toList();
        start.countDown();
        var outcomes = new ArrayList<Object>();
        for (var future : futures) outcomes.add(future.get(30, TimeUnit.SECONDS)); // any exception fails the test here
        pool.shutdown();

        assertThat(outcomes.subList(0, 8)).containsOnly(TaskStatus.FAILED);
        assertThat(outcomes.subList(8, 12)).containsOnly(false);           // administrator: ALREADY_TERMINAL
        assertThat(outcomes.subList(12, 16)).containsOnly(false);          // nothing left to recover
        assertThat(outcomes.subList(16, 22)).containsOnly("CLEANED", "ALREADY_CLEANED").contains("CLEANED");
        assertThat(outcomes.subList(16, 22).stream().filter("CLEANED"::equals).count()).isEqualTo(1);
        assertThat(failedEvents(task)).isEqualTo(1);
        var row = taskRow(task);
        assertThat(row).containsEntry("status", "FAILED").containsEntry("failure_code", "CANCELLED")
                .containsEntry("queue_state", "FINISHED").containsEntry("lease_cleared", true);

        // The stale worker can neither write nor renew, and the candidate version converged with the task.
        assertThatThrownBy(() -> queue.advance(claim, TaskStatus.GENERATE, EventType.STAGE_STARTED, "late", null))
                .isInstanceOf(IllegalStateException.class);
        assertThat(queue.renew(claim, Duration.ofSeconds(30))).isFalse();
        assertThat(versionStatus(draft.id())).isEqualTo("FAILED");
        var report = snapshots.outcome(draft.id(), draft.sourceDigest(), "FAILED").report();
        assertThat(report.path("failureCode").asText()).isEqualTo("CANCELLED");
        assertThat(report.path("status").asText()).isEqualTo("FAILED");
        assertThat(report.path("artifactDigest").isNull()).isTrue();

        assertThat(paths.get("runnerScratch")).doesNotExist();
        assertThat(paths.get("workingCopy")).doesNotExist();
        assertThat(paths.get("pendingWrite")).doesNotExist();
        assertThat(paths.get("snapshot")).exists();
        assertThat(cleanup.request(task).status()).isEqualTo("ALREADY_CLEANED");
        try (var receipts = Files.list(root.resolve("agent/recovery/cleanup"))) {
            assertThat(receipts.filter(p -> p.getFileName().toString().endsWith(".json")).count()).isEqualTo(1);
        }

        // Cancelling a queued (never claimed) task concurrently, and a READY task, also converge without exceptions.
        UUID queued = RecoveryFixtures.queuedTask(repository, seed.app(), "Cancel before any worker claims me");
        var racers = Executors.newFixedThreadPool(8);
        var go = new CountDownLatch(1);
        var queuedResults = new ArrayList<Future<TaskStatus>>();
        for (int i = 0; i < 16; i++) queuedResults.add(racers.submit(() -> { go.await(); return queue.cancel(seed.owner(), queued).status(); }));
        go.countDown();
        for (var result : queuedResults) assertThat(result.get(30, TimeUnit.SECONDS)).isEqualTo(TaskStatus.FAILED);
        racers.shutdown();
        assertThat(failedEvents(queued)).isEqualTo(1);
        UUID ready = RecoveryFixtures.queuedTask(repository, seed.app(), "Already finished task");
        RecoveryFixtures.verified(jdbc, snapshots, temporary.resolve("src"), seed.app(), ready, 2);
        int readyEvents = (int) taskRow(ready).get("event_sequence");
        assertThat(queue.cancel(seed.owner(), ready).status()).isEqualTo(TaskStatus.READY);
        assertThat(queue.cancel(seed.owner(), ready).status()).isEqualTo(TaskStatus.READY);
        assertThat(taskRow(ready).get("event_sequence")).isEqualTo(readyEvents);

        RecoveryFixtures.evidence("D18-A-T2", Map.of(
                "case", "repeated and concurrent cancellation never throws and converges once",
                "runningTask", Map.of("taskId", task, "row", row, "taskFailedEvents", 1,
                        "concurrentCalls", Map.of("ownerCancel", 8, "adminCancel", 4, "expiryRecovery", 4, "runnerCleanup", 6),
                        "exceptions", 0, "cleanupOutcomes", outcomes.subList(16, 22), "draftVersion", Map.of(
                                "versionId", draft.id(), "status", "FAILED", "frozenReport", report),
                        "staleWorkerWriteRejected", true, "staleRenewalRejected", true),
                "runnerCleanup", Map.of(
                        "removed", List.of("work/<task>", "workspaces/<task>/source", "workspaces/<task>/.write-123.tmp"),
                        "retained", List.of("workspaces/<task>/snapshots/<id>"), "receipts", 1),
                "queuedTask", Map.of("taskId", queued, "concurrentOwnerCancels", 16, "taskFailedEvents", 1),
                "readyTask", Map.of("taskId", ready, "status", "READY", "eventsUnchanged", true)));
    }

    @Test void heartbeatKeepsLiveLeaseAndCancelledWorkerIsReleasedOnlyAfterItStops() throws Exception {
        var seed = RecoveryFixtures.seed(repository, "D18 heartbeat");
        UUID task = RecoveryFixtures.queuedTask(repository, seed.app(), "Long running stage");
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var executions = new CopyOnWriteArrayList<String>();
        TaskStageRunner blocking = (id, stage) -> {
            executions.add(id + ":" + stage);
            try {
                RecoveryFixtures.write(root.resolve("agent/work/" + id + "/source-live/src/pages/HomePage.vue"), "live");
                entered.countDown();
                release.await(30, TimeUnit.SECONDS);
            } catch (Exception interrupted) {
                throw new IllegalStateException(interrupted);
            }
            return new TaskStageRunner.StageResult(TaskStatus.GENERATE, "plan accepted by fixture", null);
        };
        var paths = resources(task);
        var scheduler = new TaskScheduler(queue, blocking, cleanup, 1500);
        var worker = Executors.newSingleThreadExecutor().submit(scheduler::tick);
        assertThat(entered.await(30, TimeUnit.SECONDS)).isTrue();

        Thread.sleep(4500); // three lease lengths: only the heartbeat keeps this claim alive
        var live = jdbc.sql("SELECT queue_state, lease_expires_at > clock_timestamp() AS valid, status FROM generation_tasks WHERE id=?")
                .param(task).query().singleRow();
        assertThat(live).containsEntry("queue_state", "RUNNING").containsEntry("valid", true).containsEntry("status", "PLAN");
        assertThat(queue.recoverExpired()).isEmpty();

        queue.cancel(seed.owner(), task);
        var deferred = cleanup.request(task); // terminal, but this process still executes it
        assertThat(deferred.status()).isEqualTo("DEFERRED_ACTIVE");
        assertThat(root.resolve("agent/work/" + task)).exists();
        release.countDown();
        worker.get(30, TimeUnit.SECONDS);

        assertThat(executions).containsExactly(task + ":PLAN");
        assertThat(taskRow(task)).containsEntry("status", "FAILED").containsEntry("failure_code", "CANCELLED");
        assertThat(failedEvents(task)).isEqualTo(1);
        assertThat(repository.listEvents(task)).noneMatch(e -> e.stage() == TaskStatus.GENERATE);
        assertThat(root.resolve("agent/work/" + task)).doesNotExist();
        assertThat(paths.get("workingCopy")).doesNotExist();
        assertThat(paths.get("snapshot")).exists();
        assertThat(cleanup.request(task).status()).isEqualTo("ALREADY_CLEANED");
        RecoveryFixtures.evidence("D18-A-01-heartbeat-cancel", Map.of(
                "leaseMs", 1500, "observedAfterMs", 4500, "liveLeaseStillValid", true, "recoveredWhileAlive", false,
                "cleanupWhileStillExecuting", deferred.status(), "stageExecutions", executions,
                "finalRow", taskRow(task), "taskFailedEvents", 1, "lateGenerateEventWritten", false,
                "afterWorkerStopped", Map.of("runnerScratchRemoved", true, "workingCopyRemoved", true, "snapshotRetained", true)));
    }

    @Test void abandonedLeaseConvergesToInterruptedWithinOneLeaseAndReleasesResources() throws Exception {
        var seed = RecoveryFixtures.seed(repository, "D18 abandoned lease");
        UUID task = RecoveryFixtures.queuedTask(repository, seed.app(), "Worker process disappears");
        var claim = queue.claim(Duration.ofSeconds(1)).orElseThrow(); // no heartbeat: the owning process is gone
        var draft = RecoveryFixtures.draft(jdbc, snapshots, temporary.resolve("src"), seed.app(), task, 1);
        var paths = resources(task);
        assertThat(queue.recoverExpired()).as("a valid lease is never stolen").isEmpty();

        var invoked = new CopyOnWriteArrayList<UUID>();
        TaskStageRunner unexpected = (id, stage) -> {
            invoked.add(id);
            return new TaskStageRunner.StageResult(TaskStatus.FAILED, "fixture must not run", "UNEXPECTED_STAGE");
        };
        long started = System.nanoTime();
        Thread.sleep(1200);
        new TaskScheduler(queue, unexpected, cleanup, 60_000).tick();
        long convergedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);

        assertThat(invoked).isEmpty();
        assertThat(taskRow(task)).containsEntry("status", "FAILED").containsEntry("failure_code", "INTERRUPTED")
                .containsEntry("queue_state", "FINISHED").containsEntry("lease_cleared", true);
        assertThat(failedEvents(task)).isEqualTo(1);
        assertThatThrownBy(() -> queue.advance(claim, TaskStatus.READY, EventType.STAGE_COMPLETED, "late success", null))
                .isInstanceOf(IllegalStateException.class);
        assertThat(versionStatus(draft.id())).isEqualTo("FAILED");
        assertThat(snapshots.outcome(draft.id(), draft.sourceDigest(), "FAILED").report().path("failureCode").asText())
                .isEqualTo("INTERRUPTED");
        assertThat(paths.get("runnerScratch")).doesNotExist();
        assertThat(paths.get("workingCopy")).doesNotExist();
        assertThat(paths.get("snapshot")).exists();
        assertThat(Files.readString(root.resolve("agent/recovery/cleanup/" + task + ".json"))).contains("\"taskStatus\":\"FAILED\"", "INTERRUPTED");
        assertThat(queue.recoverExpired()).isEmpty();
        RecoveryFixtures.evidence("D18-A-01-abandoned-lease", Map.of(
                "leaseMs", 1000, "convergedWithinMs", convergedMs, "validLeaseLeftAlone", true, "row", taskRow(task),
                "taskFailedEvents", 1, "lateReadyRejected", true, "stageRunnerInvoked", invoked.size(),
                "draftVersion", Map.of("versionId", draft.id(), "status", "FAILED", "reportFailureCode", "INTERRUPTED"),
                "cleanupReceipt", true));
    }
}
