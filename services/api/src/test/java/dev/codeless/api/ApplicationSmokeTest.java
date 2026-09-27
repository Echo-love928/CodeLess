package dev.codeless.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

class ApplicationSmokeTest {
    @Test
    void applicationContextStarts() {
        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(CodeLessApiApplication.class)
                .web(WebApplicationType.NONE)
                .properties("spring.main.banner-mode=off")
                .run()) {
            assertThat(context.isActive()).isTrue();
        }
    }
}
