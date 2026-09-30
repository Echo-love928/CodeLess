package dev.codeless.api.tasks;

import dev.codeless.api.data.PlatformModels.TaskStatus;
import java.util.UUID;

/** Trusted adapter boundary. A READY result is still rejected without a verified real build. */
public interface TaskStageRunner {
    StageResult execute(UUID taskId, TaskStatus stage);

    record StageResult(TaskStatus next, String message, String failureCode) {}
}
