package dev.codeless.api.error;

import dev.codeless.api.auth.AuthFailure;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(AuthFailure.class)
    public ResponseEntity<ApiError> auth(AuthFailure exception, HttpServletRequest request) {
        String message = switch (exception.code()) {
            case "INVALID_CREDENTIALS" -> "Invalid email or password";
            case "LOGIN_RATE_LIMITED" -> "Too many login attempts";
            case "UNAUTHENTICATED" -> "Authentication required";
            case "NOT_FOUND" -> "Resource was not found";
            case "FORBIDDEN" -> "Access denied";
            default -> "Request is invalid";
        };
        return response(exception.status(), exception.code(), message, request, Map.of());
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> validation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        Map<String, String> details = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors()
                .forEach(error -> details.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return response(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Request validation failed", request, details);
    }

    @ExceptionHandler({ConstraintViolationException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<ApiError> malformed(Exception exception, HttpServletRequest request) {
        return response(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Request is malformed", request, Map.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> notFound(NoResourceFoundException exception, HttpServletRequest request) {
        return response(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource was not found", request, Map.of());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiError> methodNotAllowed(
            HttpRequestMethodNotSupportedException exception, HttpServletRequest request) {
        return response(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "Method is not allowed",
                request, Map.of(), exception.getHeaders());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> unexpected(Exception exception, HttpServletRequest request) {
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "An unexpected error occurred", request, Map.of());
    }

    private ResponseEntity<ApiError> response(
            HttpStatus status,
            String code,
            String message,
            HttpServletRequest request,
            Map<String, String> details) {
        return response(status, code, message, request, details, new HttpHeaders());
    }

    private ResponseEntity<ApiError> response(
            HttpStatus status,
            String code,
            String message,
            HttpServletRequest request,
            Map<String, String> details,
            HttpHeaders headers) {
        String suppliedTraceId = request.getHeader("X-Request-ID");
        String traceId = suppliedTraceId == null || suppliedTraceId.isBlank()
                ? UUID.randomUUID().toString()
                : suppliedTraceId.substring(0, Math.min(suppliedTraceId.length(), 100));
        ApiError error = new ApiError(code, message, Instant.now(), request.getRequestURI(), traceId, details);
        return ResponseEntity.status(status).headers(headers).body(error);
    }
}
