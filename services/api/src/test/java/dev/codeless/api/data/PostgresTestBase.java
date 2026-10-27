package dev.codeless.api.data;

import java.nio.file.Path;
import java.util.UUID;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest
@ActiveProfiles("test")
// Contexts use distinct test properties but share one PostgreSQL server. Release each class's pool
// instead of retaining default-sized idle pools until the Spring context cache is evicted.
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
public abstract class PostgresTestBase {
    protected static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94")
            .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("codeless_test")
            .withUsername("codeless_test")
            .withPassword("local-test-only");

    /**
     * Admin audit records of every test context go to a fresh per-JVM directory under target/. A dynamic property
     * outranks CODELESS_ADMIN_AUDIT_ROOT and application config, and adding it here keeps context cache keys unchanged.
     */
    protected static final Path ADMIN_AUDIT_ROOT = Path.of("target", "test-admin-audit", UUID.randomUUID().toString())
            .toAbsolutePath().normalize();

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("CODELESS_DATABASE_URL", () -> "jdbc:postgresql://127.0.0.1:1/must_not_connect");
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("codeless.admin.audit-root", ADMIN_AUDIT_ROOT::toString);
    }
}
