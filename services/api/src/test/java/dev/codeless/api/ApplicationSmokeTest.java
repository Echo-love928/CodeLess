package dev.codeless.api;

import static org.assertj.core.api.Assertions.assertThat;

import dev.codeless.api.data.PostgresTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;

class ApplicationSmokeTest extends PostgresTestBase {
    @Autowired ApplicationContext context;

    @Test
    void applicationContextStarts() {
        assertThat(context).isNotNull();
    }
}
