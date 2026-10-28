package dev.codeless.api.error;

import dev.codeless.api.auth.AuthFailure;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.ConstraintViolationException;
import java.sql.SQLException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
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
            case "APPLICATION_TASK_LIMIT" -> "Application active task limit reached";
            case "USER_TASK_LIMIT" -> "User active task limit reached";
            case "TASK_QUEUE_FULL" -> "Task queue is full";
            case "TASK_ADMISSION_BUSY" -> "Task admission is busy; retry later";
            default -> "Request is invalid";
        };
        var headers=new HttpHeaders();
        if(java.util.Set.of("APPLICATION_TASK_LIMIT","USER_TASK_LIMIT","TASK_QUEUE_FULL","TASK_ADMISSION_BUSY").contains(exception.code()))
            headers.set("Retry-After","1");
        return response(exception.status(), exception.code(), message, request, Map.of(),headers);
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> validation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        Map<String, String> details = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors()
                .forEach(error -> details.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return response(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Request validation failed", request, details);
    }

    @ExceptionHandler({ConstraintViolationException.class, HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ApiError> malformed(Exception exception, HttpServletRequest request) {
        return response(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Request is malformed", request, Map.of());
    }

    /** A missing required query parameter or header is the client's error, not a server failure. */
    @ExceptionHandler(ServletRequestBindingException.class)
    public ResponseEntity<ApiError> binding(ServletRequestBindingException exception, HttpServletRequest request) {
        return response(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Request is malformed", request, Map.of());
    }

    /** PostgreSQL text cannot hold NUL (SQLSTATE 22021): such input is rejected as invalid instead of a 500. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> integrity(DataIntegrityViolationException exception, HttpServletRequest request,
                                              HttpServletResponse response) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause())
            if (cause instanceof SQLException sql && "22021".equals(sql.getSQLState()))
                return response(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Request is malformed", request, Map.of());
        return unexpected(exception, request, response);
    }

    /** The catch-all below would turn these into 500s; they are the standard 415 and (bodiless) 406. */
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiError> mediaType(HttpMediaTypeNotSupportedException exception, HttpServletRequest request) {
        return response(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", "Content type is not supported",
                request, Map.of());
    }

    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    public ResponseEntity<Void> notAcceptable() {
        return ResponseEntity.status(HttpStatus.NOT_ACCEPTABLE).build();
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
    public ResponseEntity<ApiError> unexpected(Exception exception, HttpServletRequest request,
                                              HttpServletResponse response) {
        // A disconnected SSE socket cannot accept a second JSON response.
        if (response.isCommitted()) return null;
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
        return ResponseEntity.status(status).headers(headers)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).body(error);
    }
}
