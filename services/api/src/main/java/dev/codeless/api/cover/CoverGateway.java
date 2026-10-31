package dev.codeless.api.cover;

import java.time.Instant;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/** Trusted coordinator only. There is no HTTP/model enqueue operation. */
public interface CoverGateway {
    record Binding(UUID id, UUID applicationId, UUID versionId, String status, String sourceDigest,
                   String artifactDigest, String url, String entryPath) {}
    JsonNode capture(Binding binding, Instant deadline);
}
