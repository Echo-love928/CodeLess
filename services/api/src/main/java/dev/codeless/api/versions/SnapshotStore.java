package dev.codeless.api.versions;

import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/** Trusted orchestration only. No HTTP write API and no model-selected storage roots. */
public interface SnapshotStore {
    record Entry(String path, long bytes, String digest) {}
    record Manifest(String digest, List<Entry> files) {}
    record Source(Path directory, Manifest manifest) {}
    record Outcome(String status, String sourceDigest, String artifactDigest, Manifest artifact,
                   String reportDigest, JsonNode report) {}
    Source freezeSource(UUID version, Path source, String digest, JsonNode files);
    Source source(UUID version, String digest);
    Outcome freezeOutcome(UUID version, String digest, String status, JsonNode result, String failureCode);
    Outcome outcome(UUID version, String digest, String status);
    String readSource(UUID version, String digest, String path);
    default JsonNode componentMapping(UUID version,String digest) {throw new SnapshotFailure("MAPPING_UNAVAILABLE");}
}
