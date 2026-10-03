package dev.codeless.api.preview;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.HexFormat;
import java.util.UUID;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** v1 wire format shared with the trusted gateway. Key never enters generated workers. */
public final class PreviewCredentials {
    private final byte[] key;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    public PreviewCredentials(String keyHex, Clock clock) {
        if (!keyHex.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Preview key must be 32 random bytes in hex");
        this.key = HexFormat.of().parseHex(keyHex);
        this.clock = clock;
    }
    public String issue(UUID app, UUID version, UUID build, String source, String artifact) {
        if (!source.matches("sha256:[a-f0-9]{64}") || !artifact.matches("sha256:[a-f0-9]{64}"))
            throw new IllegalArgumentException("Invalid verified digest");
        long issued = clock.instant().getEpochSecond();
        byte[] nonce = new byte[16];
        random.nextBytes(nonce);
        String payload = String.join(".", "v1", app.toString(), version.toString(), build.toString(), source,
                artifact, Long.toString(issued), Long.toString(issued + 120), HexFormat.of().formatHex(nonce));
        String body = Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return body + "." + Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(body.getBytes(StandardCharsets.US_ASCII)));
        } catch (java.security.GeneralSecurityException error) {
            throw new IllegalStateException("Preview signing unavailable", error);
        }
    }
}
