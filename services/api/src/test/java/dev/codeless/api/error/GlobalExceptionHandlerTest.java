package dev.codeless.api.error;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.codeless.api.system.HealthController;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

class GlobalExceptionHandlerTest {
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new ValidationController(), new HealthController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void invalidBodyReturnsUnifiedErrorWithoutInternalDetails() throws Exception {
        mockMvc.perform(post("/test/validation")
                        .header("X-Request-ID", "test-trace")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("Request validation failed"))
                .andExpect(jsonPath("$.path").value("/test/validation"))
                .andExpect(jsonPath("$.traceId").value("test-trace"))
                .andExpect(jsonPath("$.timestamp").isNotEmpty())
                .andExpect(jsonPath("$.details.name").isNotEmpty())
                .andExpect(jsonPath("$.exception").doesNotExist())
                .andExpect(jsonPath("$.stackTrace").doesNotExist());
    }

    @Test
    void unsupportedMethodPreservesStatusAndAllowHeader() throws Exception {
        mockMvc.perform(post("/api/health"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(header().string(HttpHeaders.ALLOW, "GET"))
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"))
                .andExpect(jsonPath("$.path").value("/api/health"));
    }

    @RestController
    @RequestMapping("/test")
    static class ValidationController {
        @PostMapping("/validation")
        Input validate(@Valid @RequestBody Input input) {
            return input;
        }
    }

    record Input(@NotBlank String name) {}
}
