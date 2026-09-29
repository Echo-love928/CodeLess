package dev.codeless.api.tasks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.data.PlatformModels.DataMode;
import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.data.PostgresTestBase;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

class TaskQueueIntegrationTest extends PostgresTestBase {
    @Autowired PlatformRepository repository;
    @Autowired TaskQueueService queue;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;

    @BeforeEach void clearUnclaimedFixtures() {
        jdbc.update("UPDATE generation_tasks SET queue_state='FINISHED', lease_token=NULL, "
                + "lease_expires_at=NULL WHERE queue_state IN ('QUEUED','RUNNING')");
    }

    private record Seed(UUID owner, UUID app) {}

    private Seed seed() {
        UUID owner = UUID.randomUUID();
        UUID app = UUID.randomUUID();
        repository.createUser(owner, owner + "@example.test", "Task owner");
        repository.createApplication(app, owner, "Task app", DataMode.MOCK);
        return new Seed(owner, app);
    }

    @Test void duplicateIdempotencyRequestsCreateOneTaskAndOneEvent() throws Exception {
        Seed seed = seed();
        var pool = Executors.newFixedThreadPool(8);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Callable<UUID>> requests = new ArrayList<>();
            for (int i = 0; i < 16; i++) requests.add(() -> {
                start.await();
                return queue.create(seed.owner(), seed.app(), "Make a page", "retry-1").id();
            });
            var futures = requests.stream().map(pool::submit).toList();
            start.countDown();
            List<UUID> ids = new ArrayList<>();
            for (var future : futures) ids.add(future.get(30, TimeUnit.SECONDS));
            assertThat(ids).containsOnly(ids.getFirst());
            assertThat(jdbc.queryForObject("SELECT count(*) FROM generation_tasks WHERE application_id = ?",
                    Integer.class, seed.app())).isEqualTo(1);
            assertThat(repository.listEvents(ids.getFirst())).hasSize(1);
            assertThatThrownBy(() -> queue.create(seed.owner(), seed.app(), "Different page", "retry-1"))
                    .isInstanceOf(AuthFailure.class);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM generation_tasks WHERE application_id = ?",
                    Integer.class, seed.app())).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test void twoConsumersCannotClaimSameTaskOrRunTwoTasksForOneApplication() throws Exception {
        Seed seed = seed();
        UUID first = queue.create(seed.owner(), seed.app(), "First", null).id();
        UUID second = queue.create(seed.owner(), seed.app(), "Second", null).id();
        var pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Callable<TaskQueueService.Claim> take = () -> {
                start.await();
                return queue.claim().orElse(null);
            };
            var one = pool.submit(take);
            var two = pool.submit(take);
            start.countDown();
            List<TaskQueueService.Claim> claims = Arrays.asList(one.get(30, TimeUnit.SECONDS),
                    two.get(30, TimeUnit.SECONDS));
            assertThat(claims.stream().filter(c -> c != null).toList()).hasSize(1)
                    .first().extracting(TaskQueueService.Claim::taskId).isIn(first, second);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM generation_tasks "
                    + "WHERE application_id = ? AND queue_state = 'RUNNING'", Integer.class, seed.app()))
                    .isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test void cancellationAndTerminalStateRejectLateWorkerWrites() {
        Seed seed = seed();
        UUID id = queue.create(seed.owner(), seed.app(), "Cancel me", null).id();
        TaskQueueService.Claim claim = queue.claim().orElseThrow();
        queue.cancel(seed.owner(), id);
        assertThat(queue.find(seed.owner(), id).orElseThrow().status()).isEqualTo(TaskStatus.FAILED);
        assertThat(queue.find(seed.owner(), id).orElseThrow().failureCode()).isEqualTo("CANCELLED");
        assertThatThrownBy(() -> queue.advance(claim, TaskStatus.GENERATE,
                EventType.STAGE_STARTED, "late write", null)).isInstanceOf(IllegalStateException.class);
        assertThat(repository.listEvents(id)).hasSize(2);
        queue.cancel(seed.owner(), id);
        assertThat(repository.listEvents(id)).hasSize(2);
    }

    @Test void leaseExpiryWhileWaitingForTaskRowLockRejectsStageAndEvent() throws Exception {
        Seed seed = seed();
        UUID id = queue.create(seed.owner(), seed.app(), "Wait across expiry", null).id();
        TaskQueueService.Claim claim = queue.claim().orElseThrow();
        jdbc.update("UPDATE generation_tasks SET lease_expires_at = clock_timestamp() + interval '4 seconds' "
                + "WHERE id = ?", id);

        CountDownLatch rowLocked = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        CountDownLatch workerReady = new CountDownLatch(1);
        AtomicInteger workerPid = new AtomicInteger();
        var pool = Executors.newFixedThreadPool(2);
        try {
            var holder = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
                jdbc.queryForObject("SELECT id FROM generation_tasks WHERE id = ? FOR UPDATE", UUID.class, id);
                rowLocked.countDown();
                try {
                    if (!releaseLock.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("lock hold timed out");
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                }
            }));
            assertThat(rowLocked.await(5, TimeUnit.SECONDS)).isTrue();

            var worker = pool.submit(() -> {
                try {
                    new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
                        workerPid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                        workerReady.countDown();
                        queue.advance(claim, TaskStatus.GENERATE, EventType.STAGE_STARTED,
                                "late stage", null);
                    });
                    return (RuntimeException) null;
                } catch (RuntimeException exception) {
                    return exception;
                }
            });
            assertThat(workerReady.await(5, TimeUnit.SECONDS)).isTrue();
            boolean waitingForLock = false;
            long waitDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (System.nanoTime() < waitDeadline) {
                String waitType = jdbc.queryForObject("SELECT wait_event_type FROM pg_stat_activity WHERE pid = ?",
                        String.class, workerPid.get());
                if ("Lock".equals(waitType)) {
                    waitingForLock = true;
                    break;
                }
                Thread.sleep(20);
            }
            assertThat(waitingForLock).as("worker must be blocked on the task row").isTrue();
            assertThat(jdbc.queryForObject("SELECT clock_timestamp() < lease_expires_at "
                    + "FROM generation_tasks WHERE id = ?", Boolean.class, id)).isTrue();

            long expiryDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(6);
            while (System.nanoTime() < expiryDeadline && Boolean.FALSE.equals(jdbc.queryForObject(
                    "SELECT clock_timestamp() >= lease_expires_at FROM generation_tasks WHERE id = ?",
                    Boolean.class, id))) {
                Thread.sleep(20);
            }
            assertThat(jdbc.queryForObject("SELECT clock_timestamp() >= lease_expires_at "
                    + "FROM generation_tasks WHERE id = ?", Boolean.class, id)).isTrue();
            releaseLock.countDown();
            holder.get(5, TimeUnit.SECONDS);
            assertThat(worker.get(5, TimeUnit.SECONDS)).isInstanceOf(IllegalStateException.class);
            assertThat(repository.findTask(id).orElseThrow().status()).isEqualTo(TaskStatus.PLAN);
            assertThat(repository.listEvents(id)).hasSize(1);
        } finally {
            releaseLock.countDown();
            pool.shutdownNow();
        }
    }

    @Test void freshSchedulerRecoversAbandonedExpiredLeaseAsInterruptedNeverReady() {
        Seed seed = seed();
        UUID id = queue.create(seed.owner(), seed.app(), "Interrupted", null).id();
        TaskQueueService.Claim stale = queue.claim().orElseThrow();
        jdbc.update("UPDATE generation_tasks SET lease_expires_at = now() - interval '1 second' WHERE id = ?", id);
        TaskStageRunner fixture = (taskId, stage) -> { throw new AssertionError("stale task must not run"); };
        new TaskScheduler(queue, fixture).tick();
        assertThat(queue.find(seed.owner(), id).orElseThrow().status()).isEqualTo(TaskStatus.FAILED);
        assertThat(queue.find(seed.owner(), id).orElseThrow().failureCode()).isEqualTo("INTERRUPTED");
        assertThat(jdbc.queryForObject("SELECT queue_state FROM generation_tasks WHERE id = ?",
                String.class, id)).isEqualTo("FINISHED");
        assertThat(repository.listEvents(id)).hasSize(2);
        assertThatThrownBy(() -> queue.advance(stale, TaskStatus.READY,
                EventType.STAGE_COMPLETED, "false success", null)).isInstanceOf(IllegalStateException.class);
        assertThat(queue.recoverOneExpired()).isFalse();
    }

    @Test void runnerFixtureCannotDeclareReadyWithoutRealVerifiedBuild() {
        Seed seed = seed();
        UUID id = queue.create(seed.owner(), seed.app(), "Fixture", null).id();
        TaskStageRunner fixture = (taskId, stage) -> switch (stage) {
            case PLAN -> new TaskStageRunner.StageResult(TaskStatus.GENERATE, "planned", null);
            case GENERATE -> new TaskStageRunner.StageResult(TaskStatus.VERIFY, "generated", null);
            case VERIFY -> new TaskStageRunner.StageResult(TaskStatus.READY, "claimed ready", null);
            default -> throw new AssertionError(stage);
        };
        new TaskScheduler(queue, fixture).tick();
        assertThat(queue.find(seed.owner(), id).orElseThrow().status()).isEqualTo(TaskStatus.FAILED);
        assertThat(queue.find(seed.owner(), id).orElseThrow().failureCode()).isEqualTo("INVALID_STAGE_RESULT");
        assertThat(repository.listEvents(id)).hasSize(4);
    }

    @Test void queuedDeadlineExpiresWithoutRunnerClaimOrFalseSuccess() {
        Seed seed = seed();
        UUID id = queue.create(seed.owner(), seed.app(), "Timed out in queue", null).id();
        jdbc.update("UPDATE generation_tasks SET deadline_at = now() - interval '1 second' WHERE id = ?", id);
        assertThat(queue.claim()).isEmpty();
        assertThat(queue.recoverOneExpired()).isTrue();
        assertThat(queue.find(seed.owner(), id).orElseThrow().status()).isEqualTo(TaskStatus.FAILED);
        assertThat(queue.find(seed.owner(), id).orElseThrow().failureCode()).isEqualTo("INTERRUPTED");
        assertThat(repository.listEvents(id)).hasSize(2);
    }
}
