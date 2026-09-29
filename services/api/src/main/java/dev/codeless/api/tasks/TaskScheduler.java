package dev.codeless.api.tasks;

import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "codeless.tasks.enabled", havingValue = "true", matchIfMissing = true)
public class TaskScheduler {
    private final TaskQueueService queue;
    private final TaskStageRunner runner;

    public TaskScheduler(TaskQueueService queue, TaskStageRunner runner) {
        this.queue = queue;
        this.runner = runner;
    }

    @Scheduled(fixedDelayString = "${codeless.tasks.poll-ms:1000}")
    public void tick() {
        for (int i = 0; i < 100 && queue.recoverOneExpired(); i++) { /* bounded drain */ }
        Optional<TaskQueueService.Claim> candidate = queue.claim();
        if (candidate.isEmpty()) return;
        TaskQueueService.Claim claim = candidate.get();
        TaskStatus stage = claim.stage();
        for (int i = 0; i < 12; i++) {
            TaskStageRunner.StageResult result;
            try {
                result = runner.execute(claim.taskId(), stage);
            } catch (Exception exception) {
                failIfLeased(claim, "RUNNER_ERROR");
                return;
            }
            try {
                EventType type = switch (result.next()) {
                    case FAILED -> EventType.TASK_FAILED;
                    case READY -> EventType.STAGE_COMPLETED;
                    case REPAIR -> EventType.REPAIR_REQUESTED;
                    default -> EventType.STAGE_STARTED;
                };
                stage = queue.advance(claim, result.next(), type, result.message(), result.failureCode()).status();
                if (stage == TaskStatus.FAILED || stage == TaskStatus.READY) return;
            } catch (RuntimeException exception) {
                failIfLeased(claim, "INVALID_STAGE_RESULT");
                return;
            }
        }
        failIfLeased(claim, "STAGE_LIMIT");
    }

    private void failIfLeased(TaskQueueService.Claim claim, String code) {
        try {
            queue.advance(claim, TaskStatus.FAILED, EventType.TASK_FAILED,
                    "Task execution failed safely", code);
        } catch (RuntimeException ignored) {
            // Cancellation or lease expiry already owns the final state; expiry recovery handles the latter.
        }
    }
}
