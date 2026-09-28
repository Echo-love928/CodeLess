package dev.codeless.api.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Reusable authorization boundary for future application, task and version handlers. */
@Component
public class OwnershipGuard {
    private final JdbcClient jdbc;

    public OwnershipGuard(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public UUID userId(HttpServletRequest request) {
        AuthAccountRepository.Account account = (AuthAccountRepository.Account) request.getAttribute(AuthFilter.ACCOUNT);
        if (account == null) throw new AuthFailure(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED");
        return account.id();
    }

    public void requireAdmin(HttpServletRequest request) {
        AuthAccountRepository.Account account = (AuthAccountRepository.Account) request.getAttribute(AuthFilter.ACCOUNT);
        if (account == null) throw new AuthFailure(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED");
        if (!"ADMIN".equals(account.role())) throw new AuthFailure(HttpStatus.FORBIDDEN, "FORBIDDEN");
    }

    public void requireApplication(HttpServletRequest request, UUID applicationId) {
        boolean owned = jdbc.sql("SELECT EXISTS (SELECT 1 FROM applications WHERE id = ? AND owner_id = ?)")
                .params(applicationId, userId(request)).query(Boolean.class).single();
        if (!owned) throw new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    public void requireTask(HttpServletRequest request, UUID taskId) {
        boolean owned = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM generation_tasks t JOIN applications a ON a.id = t.application_id
                WHERE t.id = ? AND a.owner_id = ?)
                """).params(taskId, userId(request)).query(Boolean.class).single();
        if (!owned) throw new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    public void requireVersion(HttpServletRequest request, UUID versionId) {
        boolean owned = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM application_versions v JOIN applications a ON a.id = v.application_id
                WHERE v.id = ? AND a.owner_id = ?)
                """).params(versionId, userId(request)).query(Boolean.class).single();
        if (!owned) throw new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND");
    }
}
