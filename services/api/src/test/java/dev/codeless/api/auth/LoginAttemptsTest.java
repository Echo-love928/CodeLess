package dev.codeless.api.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class LoginAttemptsTest {
    @Test void clientAndAccountAreBothPartOfTheLimitAndUnknownFloodCannotEvictKnownLimits() {
        LoginAttempts attempts = new LoginAttempts();
        UUID account = UUID.randomUUID();
        for (int i = 0; i < 5; i++) assertThat(attempts.acquireKnown(account, "192.0.2.1")).isTrue();
        for (int i = 0; i < 10_001; i++) attempts.acquire("unknown-" + i + "@example.test", "192.0.2.1");
        assertThat(attempts.acquireKnown(account, "192.0.2.1")).isFalse();
        assertThat(attempts.acquireKnown(account, "192.0.2.2")).isTrue();
        assertThat(attempts.acquireKnown(UUID.randomUUID(), "192.0.2.1")).isTrue();
        attempts.succeededKnown(account, "192.0.2.2");
        assertThat(attempts.acquireKnown(account, "192.0.2.1")).isFalse();
    }

    @Test void concurrentReservationsAdmitOnlyFiveGuesses() throws Exception {
        LoginAttempts attempts = new LoginAttempts();
        UUID account = UUID.randomUUID();
        try (var pool = Executors.newFixedThreadPool(24)) {
            var calls = new java.util.ArrayList<java.util.concurrent.Callable<Boolean>>();
            for (int i = 0; i < 24; i++) calls.add(() -> attempts.acquireKnown(account, "192.0.2.1"));
            int allowed = 0;
            for (var result : pool.invokeAll(calls)) if (result.get()) allowed++;
            assertThat(allowed).isEqualTo(5);
        }
    }

    @Test void expiryDoesNotSlideWhenAttackersKeepRetryingAndSuccessResetsOnlyThatClient() {
        AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-05T00:00:00Z"));
        Clock clock = new Clock() {
            public ZoneId getZone() { return ZoneOffset.UTC; }
            public Clock withZone(ZoneId zone) { return this; }
            public Instant instant() { return now.get(); }
        };
        LoginAttempts attempts = new LoginAttempts(clock);
        UUID account = UUID.randomUUID();
        for (int i = 0; i < 5; i++) assertThat(attempts.acquireKnown(account, "a")).isTrue();
        now.set(now.get().plusSeconds(899));
        assertThat(attempts.acquireKnown(account, "a")).isFalse();
        now.set(now.get().plusSeconds(1));
        assertThat(attempts.acquireKnown(account, "a")).isTrue();
        attempts.succeededKnown(account, "a");
        for (int i = 0; i < 5; i++) assertThat(attempts.acquireKnown(account, "a")).isTrue();
    }
}
