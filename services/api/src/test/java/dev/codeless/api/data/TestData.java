package dev.codeless.api.data;

import dev.codeless.api.data.PlatformModels.DataMode;
import java.util.UUID;

/** Isolated seed for each integration path; the container starts with an empty database. */
final class TestData {
    private TestData() {}

    record Seed(UUID ownerId, UUID applicationId, UUID taskId) {}

    static Seed task(PlatformRepository repository, DataMode mode) {
        UUID owner = UUID.randomUUID();
        UUID application = UUID.randomUUID();
        UUID task = UUID.randomUUID();
        repository.createUser(owner, owner + "@example.test", "Test owner");
        repository.createApplication(application, owner, "Test application", mode);
        repository.createTask(task, application, "Create a Vue page");
        return new Seed(owner, application, task);
    }
}
