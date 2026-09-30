package dev.codeless.api.data;

import dev.codeless.api.data.PlatformModels.EventType;
import dev.codeless.api.data.PlatformModels.Task;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaskProgressService {
    private final PlatformRepository repository;

    public TaskProgressService(PlatformRepository repository) {
        this.repository = repository;
    }

    /** State change and its event share one database transaction and one locked task row. */
    @Transactional
    public void transition(UUID taskId, TaskStatus next, EventType eventType,
                           String message, String failureCode) {
        transitionLocked(taskId, next, eventType, message, failureCode, null);
    }

    /** The lease is checked only after the task row lock has been acquired. */
    @Transactional
    public void transitionLeased(UUID taskId, UUID leaseToken, TaskStatus next, EventType eventType,
                                 String message, String failureCode) {
        transitionLocked(taskId, next, eventType, message, failureCode,
                Objects.requireNonNull(leaseToken, "leaseToken"));
    }

    private void transitionLocked(UUID taskId, TaskStatus next, EventType eventType,
                                  String message, String failureCode, UUID leaseToken) {
        Task task = repository.lockTask(taskId);
        if (leaseToken != null && !repository.hasValidLease(taskId, leaseToken)) {
            throw new IllegalStateException("Lease is no longer active");
        }
        if (!allowed(task.status(), next)) {
            throw new IllegalStateException("Invalid task transition: " + task.status() + " -> " + next);
        }
        if (next == TaskStatus.READY && !repository.hasVerifiedBuild(taskId)) {
            throw new IllegalStateException("READY requires a verified version and a successful real build");
        }
        if ((next == TaskStatus.FAILED) != (failureCode != null && !failureCode.isBlank())) {
            throw new IllegalArgumentException("Failure code is required only for FAILED");
        }
        if ((next == TaskStatus.FAILED) != (eventType == EventType.TASK_FAILED)) {
            throw new IllegalArgumentException("TASK_FAILED event must match FAILED state");
        }
        int repairs = task.repairAttempts() + (next == TaskStatus.REPAIR ? 1 : 0);
        if (repairs > 3) {
            throw new IllegalStateException("Repair limit exceeded");
        }
        repository.updateTaskAndAppendEvent(task, next, repairs, failureCode, eventType, message, leaseToken);
    }

    private static boolean allowed(TaskStatus from, TaskStatus to) {
        if (to == TaskStatus.FAILED) return from != TaskStatus.FAILED && from != TaskStatus.READY;
        return switch (from) {
            case PLAN -> to == TaskStatus.GENERATE;
            case GENERATE -> to == TaskStatus.VERIFY;
            case VERIFY -> to == TaskStatus.REPAIR || to == TaskStatus.READY;
            case REPAIR -> to == TaskStatus.GENERATE;
            case READY, FAILED -> false;
        };
    }
}
