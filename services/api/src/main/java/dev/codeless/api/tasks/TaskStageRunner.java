package dev.codeless.api.tasks;

import dev.codeless.api.data.PlatformModels.TaskStatus;
import java.util.UUID;

/** Trusted adapter boundary. A READY result is still rejected without a verified real build. */
public interface TaskStageRunner {
    StageResult execute(UUID taskId, TaskStatus stage);

    /** Production adapters receive the original claim, never reload a newer lease token. */
    default StageResult execute(TaskQueueService.Claim claim, TaskStatus stage) {
        return execute(claim.taskId(), stage);
    }

    default TaskQueueService.TaskView advance(TaskQueueService queue, TaskQueueService.Claim claim,
                                              StageResult result, dev.codeless.api.data.PlatformModels.EventType type) {
        return queue.advance(claim, result.next(), type, result.message(), result.failureCode());
    }

    record StageResult(TaskStatus next, String message, String failureCode) {}
}
