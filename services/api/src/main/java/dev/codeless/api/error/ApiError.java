package dev.codeless.api.error;

import java.time.Instant;
import java.util.Map;

public record ApiError(
        String code,
        String message,
        Instant timestamp,
        String path,
        String traceId,
        Map<String, String> details) {
}
