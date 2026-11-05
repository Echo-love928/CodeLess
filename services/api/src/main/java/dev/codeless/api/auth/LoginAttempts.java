package dev.codeless.api.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.UUID;
import java.util.Map;
import org.springframework.stereotype.Component;

/** A failing client cannot lock an account for clients at other addresses. */
@Component
public class LoginAttempts {
    private static final int MAX_KEYS = 10000;
    private final Map<Key, Attempt> unknown = new LinkedHashMap<>();
    private final Map<UUID, Map<Key, Attempt>> known = new HashMap<>();
    private final Clock clock;
    private record Key(String email, String address) {}
    private record Attempt(int failures, Instant until) {}

    public LoginAttempts() { this(Clock.systemUTC()); }
    LoginAttempts(Clock clock) { this.clock = clock; }

    /** Reserve before the slow password hash so parallel guesses share the same limit. */
    public synchronized boolean acquire(String email, String address) {
        return acquire(unknown, new Key(email, address));
    }

    public synchronized boolean acquireKnown(UUID account, String address) {
        return acquire(known.computeIfAbsent(account, ignored -> new LinkedHashMap<>()), new Key("", address));
    }

    private boolean acquire(Map<Key, Attempt> attempts, Key key) {
        Instant now = clock.instant();
        Attempt prior = attempts.get(key);
        if (prior != null && !now.isBefore(prior.until())) { attempts.remove(key); prior = null; }
        if (prior != null && prior.failures() >= 5) return false;
        if (prior == null && attempts.size() >= MAX_KEYS) {
            attempts.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().until()));
            if (attempts.size() >= MAX_KEYS) {
                // Only real account IDs allocate these maps. A flood of unknown emails cannot affect them.
                // Discard the oldest key instead of denying every new client when a map is full.
                attempts.remove(attempts.keySet().iterator().next());
            }
        }
        attempts.put(key, new Attempt(prior == null ? 1 : prior.failures() + 1,
                prior == null ? now.plus(Duration.ofMinutes(15)) : prior.until()));
        return true;
    }

    public synchronized void succeededKnown(UUID account, String address) {
        Map<Key, Attempt> attempts = known.get(account);
        if (attempts != null) {
            attempts.remove(new Key("", address));
            if (attempts.isEmpty()) known.remove(account);
        }
    }
}
