package dev.codeless.api.data;

import static org.assertj.core.api.Assertions.assertThat;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.test.context.TestContextManager;

class PostgresContextLifecycleTest {
    @Test
    void completedTestClassesReleaseTheirPoolsInsteadOfRetainingIdleDatabaseClients() throws Exception {
        for (Class<?> fixture : new Class<?>[] { FirstContext.class, SecondContext.class }) {
            var manager = new TestContextManager(fixture);
            manager.beforeTestClass();
            ConfigurableApplicationContext context = null;
            try {
                manager.prepareTestInstance(fixture.getDeclaredConstructor().newInstance());
                context = (ConfigurableApplicationContext) manager.getTestContext().getApplicationContext();
                var pool = context.getBean(HikariDataSource.class);
                assertThat(pool.isClosed()).isFalse();
                try (var connection = pool.getConnection(); var statement = connection.createStatement();
                        var result = statement.executeQuery("SELECT 1")) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getInt(1)).isEqualTo(1);
                }
                manager.afterTestClass();
                // A cached context otherwise retains its Hikari idle clients for the rest of the suite.
                assertThat(context.isActive()).as("context for %s must close after the class", fixture).isFalse();
                assertThat(pool.isClosed()).as("pool for %s must close after the class", fixture).isTrue();
            } finally {
                // Also clean up when running this regression against the unfixed base class.
                if (context != null && context.isActive()) context.close();
            }
        }
    }

    @SpringBootTest(classes = PoolConfiguration.class, webEnvironment = SpringBootTest.WebEnvironment.NONE,
            properties = "test.pool.fixture=first")
    static class FirstContext extends PostgresTestBase {}

    @SpringBootTest(classes = PoolConfiguration.class, webEnvironment = SpringBootTest.WebEnvironment.NONE,
            properties = "test.pool.fixture=second")
    static class SecondContext extends PostgresTestBase {}

    @TestConfiguration(proxyBeanMethods = false)
    static class PoolConfiguration {
        @Bean
        HikariDataSource dataSource(Environment environment) {
            var config = new HikariConfig();
            config.setJdbcUrl(environment.getRequiredProperty("spring.datasource.url"));
            config.setUsername(environment.getRequiredProperty("spring.datasource.username"));
            config.setPassword(environment.getRequiredProperty("spring.datasource.password"));
            config.setMaximumPoolSize(2);
            return new HikariDataSource(config);
        }
    }
}
