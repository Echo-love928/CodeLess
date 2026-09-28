package dev.codeless.api.auth;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class AuthAccountRepository {
    private final JdbcClient jdbc;

    public AuthAccountRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    record Account(UUID id, String email, String displayName, String hash, String role) {}

    Optional<Account> activeByEmail(String email) {
        return jdbc.sql("""
                SELECT u.id, u.email, u.display_name, c.password_hash, c.role
                FROM platform_users u JOIN auth_credentials c ON c.user_id = u.id
                WHERE lower(u.email) = lower(?) AND u.status = 'ACTIVE'
                """).param(email).query((rs, row) -> new Account(
                (UUID) rs.getObject("id"), rs.getString("email"), rs.getString("display_name"),
                rs.getString("password_hash"), rs.getString("role"))).optional();
    }

    Optional<Account> activeById(UUID id) {
        return jdbc.sql("""
                SELECT u.id, u.email, u.display_name, c.password_hash, c.role
                FROM platform_users u JOIN auth_credentials c ON c.user_id = u.id
                WHERE u.id = ? AND u.status = 'ACTIVE'
                """).param(id).query((rs, row) -> new Account(
                (UUID) rs.getObject("id"), rs.getString("email"), rs.getString("display_name"),
                rs.getString("password_hash"), rs.getString("role"))).optional();
    }

    @Transactional
    public void seed(String email, String displayName, String hash, String role) {
        UUID id = jdbc.sql("""
                INSERT INTO platform_users(id, email, display_name, status)
                VALUES (?, ?, ?, 'ACTIVE') ON CONFLICT DO NOTHING RETURNING id
                """).params(UUID.randomUUID(), email, displayName).query(UUID.class).optional()
                .orElseGet(() -> jdbc.sql("SELECT id FROM platform_users WHERE lower(email) = lower(?)")
                        .param(email).query(UUID.class).single());
        jdbc.sql("INSERT INTO auth_credentials(user_id, password_hash, role) VALUES (?, ?, ?) "
                + "ON CONFLICT (user_id) DO NOTHING").params(id, hash, role).update();
    }
}
