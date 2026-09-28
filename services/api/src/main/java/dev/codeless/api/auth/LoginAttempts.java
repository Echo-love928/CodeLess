package dev.codeless.api.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class LoginAttempts {
    private final ConcurrentHashMap<String, Attempt> attempts = new ConcurrentHashMap<>();
    private final Clock clock = Clock.systemUTC();
    private record Attempt(int failures, Instant until) {}

    public boolean blocked(String key) {
        Attempt attempt = attempts.get(key);
        if (attempt == null) {
            if (attempts.size() >= 10000) {
                attempts.entrySet().removeIf(entry -> clock.instant().isAfter(entry.getValue().until()));
            }
            return attempts.size() >= 10000;
        }
        if (clock.instant().isAfter(attempt.until())) {
            attempts.remove(key, attempt);
            return false;
        }
        return attempt.failures() >= 5;
    }

    public void failed(String key) {
        attempts.compute(key, (ignored, prior) -> {
            Instant now = clock.instant();
            int failures = prior == null || now.isAfter(prior.until()) ? 1 : prior.failures() + 1;
            return new Attempt(failures, now.plus(Duration.ofMinutes(15)));
        });
    }

    public void succeeded(String key) {
        attempts.remove(key);
    }
}
