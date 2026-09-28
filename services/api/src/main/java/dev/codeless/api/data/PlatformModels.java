package dev.codeless.api.data;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Database-facing domain values. Public v0 JSON deliberately omits owner and rowVersion. */
public final class PlatformModels {
    private PlatformModels() {}

    public enum UserStatus { ACTIVE, DISABLED }
    public enum ApplicationStatus { ACTIVE, ARCHIVED }
    public enum DataMode { STATIC, MOCK, LOCAL_STORAGE }
    public enum TaskStatus { PLAN, GENERATE, VERIFY, REPAIR, READY, FAILED }
    public enum EventType { STAGE_STARTED, STAGE_COMPLETED, TOOL_RESULT, REPAIR_REQUESTED, TASK_FAILED }
    public enum VersionStatus { DRAFT, VERIFIED, FAILED }
    public enum BuildStatus { QUEUED, RUNNING, SUCCEEDED, FAILED }
    public enum PublicationStatus { REQUESTED, PUBLISHED, FAILED }
    public enum ModelCallStatus { REQUESTED, SUCCEEDED, FAILED }

    public record User(UUID id, String email, String displayName, UserStatus status,
                       long rowVersion, OffsetDateTime createdAt, OffsetDateTime updatedAt) {}
    public record Application(UUID id, UUID ownerId, String name, String description,
                              DataMode dataMode, ApplicationStatus status, UUID latestReadyVersionId,
                              long rowVersion, OffsetDateTime createdAt, OffsetDateTime updatedAt) {}
    public record Task(UUID id, UUID applicationId, String prompt, TaskStatus status,
                       int repairAttempts, String failureCode, int eventSequence, long rowVersion,
                       OffsetDateTime createdAt, OffsetDateTime updatedAt) {}
    public record Event(UUID id, UUID taskId, int sequence, EventType type, TaskStatus stage,
                        String message, OffsetDateTime occurredAt) {}
    public record Version(UUID id, UUID applicationId, int number, String sourceDigest,
                          VersionStatus status, UUID buildId, long rowVersion,
                          OffsetDateTime createdAt, OffsetDateTime updatedAt) {}
    public record Build(UUID id, UUID taskId, UUID versionId, BuildStatus status, Integer exitCode,
                        String artifactDigest, String logUrl, long rowVersion,
                        OffsetDateTime createdAt, OffsetDateTime completedAt) {}
    public record Publication(UUID id, UUID applicationId, UUID versionId, UUID requestedBy,
                              PublicationStatus status, String url, long rowVersion,
                              OffsetDateTime createdAt, OffsetDateTime updatedAt, OffsetDateTime publishedAt) {}
    public record ModelCall(UUID id, UUID taskId, TaskStatus stage, String provider, String model,
                            ModelCallStatus status, Integer inputTokens, Integer outputTokens,
                            String errorCode, long rowVersion, OffsetDateTime createdAt,
                            OffsetDateTime completedAt) {}
}
