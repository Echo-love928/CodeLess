package dev.codeless.api.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class LoginAttemptsTest {
    @Test
    void unknownEmailFloodCannotDenyFreshAccountOrEvictKnownLockout() {
        LoginAttempts attempts = new LoginAttempts();
        UUID knownAccount = UUID.randomUUID();
        for (int i = 0; i < 5; i++) attempts.failedKnown(knownAccount);

        for (int i = 0; i < 10_001; i++) attempts.failed("unknown-" + i + "@example.test");

        assertThat(attempts.blocked("demo@codeless.local")).isFalse();
        assertThat(attempts.blockedKnown(UUID.randomUUID())).isFalse();
        assertThat(attempts.blockedKnown(knownAccount)).isTrue();
    }
}
