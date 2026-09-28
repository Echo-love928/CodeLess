package dev.codeless.api.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletResponse;

@RestController
@RequestMapping("/api/v0")
public class AuthController {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final AuthAccountRepository accounts;
    private final BCryptPasswordEncoder encoder;
    private final LoginAttempts attempts;

    public AuthController(AuthAccountRepository accounts, BCryptPasswordEncoder encoder, LoginAttempts attempts) {
        this.accounts = accounts;
        this.encoder = encoder;
        this.attempts = attempts;
    }

    public record LoginRequest(String email, String password) {}
    public record UserResponse(String id, String email, String displayName, String role) {
        static UserResponse from(AuthAccountRepository.Account account) {
            return new UserResponse(account.id().toString(), account.email(), account.displayName(), account.role());
        }
    }

    @GetMapping("/auth/csrf")
    public Map<String, String> csrf(HttpServletRequest request, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        HttpSession session = request.getSession(true);
        String token = (String) session.getAttribute(AuthFilter.CSRF);
        if (token == null) {
            byte[] bytes = new byte[32];
            RANDOM.nextBytes(bytes);
            token = HexFormat.of().formatHex(bytes);
            session.setAttribute(AuthFilter.CSRF, token);
        }
        return Map.of("token", token);
    }

    @PostMapping("/auth/login")
    public UserResponse login(@RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        String email = body.email() == null ? "" : body.email().strip().toLowerCase(Locale.ROOT);
        String password = body.password() == null ? "" : body.password();
        if (email.length() > 320 || password.length() > 1024) {
            throw new AuthFailure(HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
        }
        String key = email;
        if (attempts.blocked(key)) {
            throw new AuthFailure(HttpStatus.TOO_MANY_REQUESTS, "LOGIN_RATE_LIMITED");
        }
        AuthAccountRepository.Account account = accounts.activeByEmail(email).orElse(null);
        if (account == null || !encoder.matches(password, account.hash())) {
            attempts.failed(key);
            throw new AuthFailure(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS");
        }
        attempts.succeeded(key);
        request.changeSessionId();
        request.getSession(false).setAttribute(AuthFilter.USER_ID, account.id());
        return UserResponse.from(account);
    }

    @GetMapping("/auth/me")
    public UserResponse me(HttpServletRequest request, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        return UserResponse.from((AuthAccountRepository.Account) request.getAttribute(AuthFilter.ACCOUNT));
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        request.getSession(false).invalidate();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/admin/session")
    public UserResponse adminSession(HttpServletRequest request) {
        return UserResponse.from((AuthAccountRepository.Account) request.getAttribute(AuthFilter.ACCOUNT));
    }
}
