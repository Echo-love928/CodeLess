package dev.codeless.api.agent;

import java.time.OffsetDateTime;
import tools.jackson.databind.JsonNode;

/** Internal trusted worker contract; never exposed as a model-controlled shell or HTTP endpoint. */
public interface BuildGateway {
    JsonNode run(JsonNode draft, OffsetDateTime deadline);
}
