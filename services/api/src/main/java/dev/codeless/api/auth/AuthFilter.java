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
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class AuthFilter extends OncePerRequestFilter {
    public static final String USER_ID = "codeless.userId";
    public static final String CSRF = "codeless.csrf";
    public static final String ACCOUNT = "codeless.account";
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
        if (!path.startsWith("/api/v0/")) {
            chain.doFilter(request, response);
            return;
        }
        HttpSession session = request.getSession(false);
        boolean publicAuth = path.equals("/api/v0/auth/csrf") || path.equals("/api/v0/auth/login");
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
        if (publicAuth) {
            chain.doFilter(request, response);
            return;
        }
        if (path.startsWith("/api/v0/admin/") && !"ADMIN".equals(account.role())) {
            error(response, request, HttpStatus.FORBIDDEN, "FORBIDDEN");
            return;
        }
        request.setAttribute(ACCOUNT, account);
        chain.doFilter(request, response);
    }

    private void error(HttpServletResponse response, HttpServletRequest request, HttpStatus status, String code)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-store");
        String message = switch (code) {
            case "UNAUTHENTICATED" -> "Authentication required";
            case "CSRF_INVALID" -> "CSRF token missing or invalid";
            default -> "Access denied";
        };
        mapper.writeValue(response.getWriter(), new ApiError(code, message, Instant.now(),
                request.getRequestURI(), UUID.randomUUID().toString(), Map.of()));
    }
}
