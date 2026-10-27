package dev.codeless.api.tasks;

import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.recovery.RunnerCleanup;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "codeless.tasks.enabled", havingValue = "true", matchIfMissing = true)
public class TaskScheduler {
    private static final Logger log = LoggerFactory.getLogger(TaskScheduler.class);

    private final TaskQueueService queue;
    private final TaskStageRunner runner;
    private final Duration lease;
    private final RunnerCleanup cleanup;

    /** Direct construction keeps the legacy deadline-long lease and requests no resource cleanup. */
    public TaskScheduler(TaskQueueService queue, TaskStageRunner runner) {
        this(queue, runner, null, null);
    }

    /**
     * Production: a short lease renewed by a heartbeat only while this process lives, so a crash or restart converges
     * to FAILED/INTERRUPTED within one lease; runner resources are released by task ID once the task is terminal.
     */
    @Autowired
    public TaskScheduler(TaskQueueService queue, TaskStageRunner runner, RunnerCleanup cleanup,
                         @Value("${codeless.tasks.lease-ms:60000}") long leaseMs) {
        this(queue, runner, cleanup, lease(leaseMs));
    }

    private static Duration lease(long millis) {
        if (millis < 1000 || millis > 600_000) throw new IllegalStateException("codeless.tasks.lease-ms must be 1000..600000");
        return Duration.ofMillis(millis);
    }

    private TaskScheduler(TaskQueueService queue, TaskStageRunner runner, RunnerCleanup cleanup, Duration lease) {
        this.queue = queue;
        this.runner = runner;
        this.cleanup = cleanup;
        this.lease = lease;
    }

    @Scheduled(fixedDelayString = "${codeless.tasks.poll-ms:1000}")
    public void tick() {
        for (int i = 0; i < 100; i++) { // bounded drain
            Optional<UUID> recovered = queue.recoverExpired();
            if (recovered.isEmpty()) break;
            release(recovered.get());
        }
        Optional<TaskQueueService.Claim> candidate = lease == null ? queue.claim() : queue.claim(lease);
        if (candidate.isEmpty()) return;
        TaskQueueService.Claim claim = candidate.get();
        if (lease == null) {
            run(claim, new AtomicBoolean());
            return;
        }
        var lost = new AtomicBoolean();
        ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(task -> {
            Thread thread = new Thread(task, "codeless-task-lease");
            thread.setDaemon(true);
            return thread;
        });
        long period = Math.max(100, lease.toMillis() / 3);
        heartbeat.scheduleWithFixedDelay(() -> {
            if (lost.get()) return;
            try {
                if (!queue.renew(claim, lease)) lost.set(true);
            } catch (RuntimeException transientFailure) {
                // Retried next period; if renewal keeps failing the lease expires and recovery fails the task.
            }
        }, period, period, TimeUnit.MILLISECONDS);
        try (var executing = cleanup.executing(claim.taskId())) {
            run(claim, lost);
        } finally {
            heartbeat.shutdownNow();
            try {
                heartbeat.awaitTermination(5, TimeUnit.SECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            release(claim.taskId());
        }
    }

    private void run(TaskQueueService.Claim claim, AtomicBoolean lost) {
        try (var timing=TaskTiming.begin(claim.taskId())) {
            runMeasured(claim,lost);
        }
    }

    private void runMeasured(TaskQueueService.Claim claim, AtomicBoolean lost) {
        TaskStatus stage = claim.stage();
        for (int i = 0; i < 12; i++) {
            // Cancelled or expired: never start another model call or build for a lease this worker no longer holds.
            if (lost.get()) return;
            TaskStageRunner.StageResult result;
            try {
                result = runner.execute(claim, stage);
            } catch (Exception exception) {
                failIfLeased(claim, stage, "RUNNER_ERROR", exception);
                return;
            }
            try {
                EventType type = switch (result.next()) {
                    case FAILED -> EventType.TASK_FAILED;
                    case READY -> EventType.STAGE_COMPLETED;
                    case REPAIR -> EventType.REPAIR_REQUESTED;
                    default -> EventType.STAGE_STARTED;
                };
                stage = runner.advance(queue, claim, result, type).status();
                if (stage == TaskStatus.FAILED || stage == TaskStatus.READY) return;
            } catch (RuntimeException exception) {
                failIfLeased(claim, stage, "INVALID_STAGE_RESULT", exception);
                return;
            }
        }
        failIfLeased(claim, stage, "STAGE_LIMIT", null);
    }

    private void release(UUID taskId) {
        if (cleanup == null) return;
        try {
            cleanup.request(taskId);
        } catch (RuntimeException unavailable) {
            // The retention sweep is the backstop; cleanup never changes task state.
        }
    }

    private void failIfLeased(TaskQueueService.Claim claim, TaskStatus stage, String code, Exception cause) {
        boolean recorded = false;
        try {
            queue.advance(claim, TaskStatus.FAILED, EventType.TASK_FAILED,
                    "Task execution failed safely", code);
            recorded = true;
        } catch (RuntimeException ignored) {
            // Cancellation or lease expiry already owns the final state; expiry recovery handles the latter.
        }
        // The cause never reaches the public failure code, so this line is the only way to attribute it.
        if (cause != null)
            log.warn("Task {} stopped at {} as {} ({})", claim.taskId(), stage, code,
                    recorded ? "recorded" : "lease no longer held; cancellation or expiry recovery decides", cause);
    }
}
