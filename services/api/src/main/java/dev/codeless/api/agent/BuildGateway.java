package dev.codeless.api.agent;

import java.time.OffsetDateTime;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/** Internal trusted worker contract; never exposed as a model-controlled shell or HTTP endpoint. */
public interface BuildGateway {
    JsonNode run(JsonNode draft, OffsetDateTime deadline);

    /** Task-scoped run, so runner scratch can be released by task ID (D18 recovery). */
    default JsonNode run(UUID taskId, JsonNode draft, OffsetDateTime deadline) {
        return run(draft, deadline);
    }
}
