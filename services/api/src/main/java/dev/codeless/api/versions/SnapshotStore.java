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
    /** Trusted deployment adapter only; exact manifest member, checked immutable bytes, never a source path. */
    default byte[] readArtifact(UUID version, String sourceDigest, String path) {throw new SnapshotFailure("SNAPSHOT_UNAVAILABLE");}
    default java.util.Map<String,byte[]> artifactBytes(UUID version,String sourceDigest) {throw new SnapshotFailure("SNAPSHOT_UNAVAILABLE");}
    /** Trusted source export only; exact frozen manifest members, each re-read and re-hashed. */
    default java.util.Map<String,byte[]> sourceBytes(UUID version,String digest) {throw new SnapshotFailure("SNAPSHOT_UNAVAILABLE");}
    default JsonNode componentMapping(UUID version,String digest) {throw new SnapshotFailure("MAPPING_UNAVAILABLE");}
}
