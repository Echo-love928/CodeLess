package dev.codeless.api.deploy;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Platform-controlled hosting only. No model tool, user URL, command, credentials or filesystem path. */
public interface DeploymentGateway {
    record Asset(String path, String digest, byte[] bytes) {
        public Asset {bytes=bytes.clone();}
        @Override public byte[] bytes() {return bytes.clone();}
    }
    record Payload(UUID publicationId, UUID versionId, String artifactDigest, List<Asset> assets) {
        public Payload {assets=List.copyOf(assets);}
    }
    record Probe(Boolean accessible, UUID versionId, String artifactDigest) {}
    /** Create an immutable publication-specific location; never overwrite another publication, even on failure. */
    String publish(Payload payload, Instant deadline);
    /** Fetch only the configured public hosting origin; enforce deadline, deny redirects/private networks, verify served bytes. */
    Probe probe(Payload payload, String url, Instant deadline);
}
