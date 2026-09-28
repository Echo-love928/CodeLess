package dev.codeless.api.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

@Configuration
public class DemoAccountInitializer {
    @Bean
    BCryptPasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    ApplicationRunner initializeDemoAccounts(AuthAccountRepository accounts, BCryptPasswordEncoder encoder,
            @Value("${CODELESS_DEMO_PASSWORD:}") String demoPassword,
            @Value("${CODELESS_ADMIN_PASSWORD:}") String adminPassword) {
        return args -> {
            // Opt-in only: a deployment must provide both secrets, never a committed default.
            if (demoPassword.isBlank() && adminPassword.isBlank()) {
                return;
            }
            if (demoPassword.length() < 12 || adminPassword.length() < 12 || demoPassword.equals(adminPassword)) {
                throw new IllegalStateException("Demo and admin passwords must be distinct and at least 12 characters");
            }
            accounts.seed("demo@codeless.local", "Demo user", encoder.encode(demoPassword), "USER");
            accounts.seed("admin@codeless.local", "Demo admin", encoder.encode(adminPassword), "ADMIN");
        };
    }
}
