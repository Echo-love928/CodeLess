package dev.codeless.api.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class LoginAttempts {
    private static final int MAX_UNKNOWN_KEYS = 10000;
    // Only accounts already present in PostgreSQL can enter this map. Anonymous
    // identifiers cannot evict a real account's lockout state.
    private final ConcurrentHashMap<UUID, Attempt> knownAccounts = new ConcurrentHashMap<>();
    private final Map<String, Attempt> unknownEmails = new LinkedHashMap<>(16, 0.75f, true);
    private final Clock clock = Clock.systemUTC();
    private record Attempt(int failures, Instant until) {}

    public boolean blockedKnown(UUID accountId) {
        Attempt attempt = knownAccounts.get(accountId);
        if (attempt == null) return false;
        if (!clock.instant().isBefore(attempt.until())) {
            knownAccounts.remove(accountId, attempt);
            return false;
        }
        return attempt.failures() >= 5;
    }

    public void failedKnown(UUID accountId) {
        knownAccounts.compute(accountId, (ignored, prior) -> next(prior, clock.instant()));
    }

    public void succeededKnown(UUID accountId) {
        knownAccounts.remove(accountId);
    }

    public synchronized boolean blocked(String email) {
        Attempt attempt = unknownEmails.get(email);
        if (attempt == null) return false;
        if (!clock.instant().isBefore(attempt.until())) {
            unknownEmails.remove(email);
            return false;
        }
        return attempt.failures() >= 5;
    }

    public synchronized void failed(String email) {
        Instant now = clock.instant();
        Attempt prior = unknownEmails.get(email);
        if (prior == null && unknownEmails.size() >= MAX_UNKNOWN_KEYS) {
            unknownEmails.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().until()));
            if (unknownEmails.size() >= MAX_UNKNOWN_KEYS) {
                String eldest = unknownEmails.keySet().iterator().next();
                unknownEmails.remove(eldest);
            }
        }
        unknownEmails.put(email, next(prior, now));
    }

    private static Attempt next(Attempt prior, Instant now) {
        int failures = prior == null || !now.isBefore(prior.until()) ? 1 : prior.failures() + 1;
        return new Attempt(failures, now.plus(Duration.ofMinutes(15)));
    }
}
