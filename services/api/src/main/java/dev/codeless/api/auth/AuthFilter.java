package dev.codeless.api.auth;

import tools.jackson.databind.ObjectMapper;
import dev.codeless.api.error.ApiError;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;

@Component
public class AuthFilter extends OncePerRequestFilter {
    public static final String USER_ID = "codeless.userId";
    public static final String CSRF = "codeless.csrf";
    public static final String ACCOUNT = "codeless.account";
    private static final UrlPathHelper ROUTED = new UrlPathHelper();
    private final AuthAccountRepository accounts;
    private final ObjectMapper mapper;

    public AuthFilter(AuthAccountRepository accounts, ObjectMapper mapper) {
        this.accounts = accounts;
        this.mapper = mapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        // Spring routes on the decoded path without ;params, and the production edge matches /api/v0/ on the normalized
        // URI but forwards the raw target. Every decision below uses the routed path, and a non-canonical spelling never
        // reaches a handler (D19-A: /api;x=1/v0/auth/logout and /%61pi/v0/... skipped this filter, CSRF included).
        String routed = routed(request);
        if (routed == null) {
            error(response, request, HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
            return;
        }
        boolean canonical = path.equals(routed) && path.indexOf('%') < 0;
        if (!path.startsWith("/api/v0/") && !routed.startsWith("/api/v0/")) {
            if (!canonical && (scoped(path) || scoped(routed))) {
                error(response, request, HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
                return;
            }
            chain.doFilter(request, response);
            return;
        }
        HttpSession session = request.getSession(false);
        boolean publicAuth = routed.equals("/api/v0/auth/csrf") || routed.equals("/api/v0/auth/login");
        AuthAccountRepository.Account account = null;
        if (!publicAuth) {
            UUID id = session == null ? null : (UUID) session.getAttribute(USER_ID);
            account = id == null ? null : accounts.activeById(id).orElse(null);
            if (account == null) {
                error(response, request, HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED");
                return;
            }
        }
        if (!"GET".equals(request.getMethod()) && !"HEAD".equals(request.getMethod())
                && !"OPTIONS".equals(request.getMethod())) {
            String expected = session == null ? null : (String) session.getAttribute(CSRF);
            String supplied = request.getHeader("X-CSRF-Token");
            if (expected == null || supplied == null || !MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8))) {
                error(response, request, HttpStatus.FORBIDDEN, "CSRF_INVALID");
                return;
            }
        }
        // Spring routes on the decoded path without ;params, so /api/v0/%61dmin/ must not skip the role check.
        boolean admin = path.startsWith("/api/v0/admin/") || routed.startsWith("/api/v0/admin/");
        if (!publicAuth && admin && !"ADMIN".equals(account.role())) {
            error(response, request, HttpStatus.FORBIDDEN, "FORBIDDEN");
            return;
        }
        // Checked after identity, CSRF and role, so those failures keep their codes for every spelling.
        if (!canonical) {
            error(response, request, HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
            return;
        }
        // Identity, CSRF, role and canonical-path checks retain precedence. Even JSON with a valid prefix and
        // oversized trailing data must be rejected before a controller can produce a side effect.
        HttpServletRequest bounded;
        try { bounded = ApiRequestBody.bounded(request); }
        catch (ApiRequestBody.TooLarge tooLarge) {
            error(response, request, HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Request body exceeds 131072 bytes");
            return;
        }
        if (!publicAuth) bounded.setAttribute(ACCOUNT, account);
        chain.doFilter(bounded, response);
    }

    private static String routed(HttpServletRequest request) {
        try { return StringUtils.cleanPath(ROUTED.getPathWithinApplication(request)); }
        catch (IllegalArgumentException undecodable) { return null; }
    }

    private static boolean scoped(String path) {
        return path.startsWith("/api/") || path.startsWith("/internal/");
    }

    private void error(HttpServletResponse response, HttpServletRequest request, HttpStatus status, String code)
            throws IOException {
        String message = switch (code) {
            case "UNAUTHENTICATED" -> "Authentication required";
            case "CSRF_INVALID" -> "CSRF token missing or invalid";
            case "INVALID_REQUEST" -> "Request path is not canonical";
            default -> "Access denied";
        };
        error(response, request, status, code, message);
    }

    private void error(HttpServletResponse response, HttpServletRequest request, HttpStatus status, String code,
                       String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-store");
        mapper.writeValue(response.getWriter(), new ApiError(code, message, Instant.now(),
                request.getRequestURI(), UUID.randomUUID().toString(), Map.of()));
    }
}
