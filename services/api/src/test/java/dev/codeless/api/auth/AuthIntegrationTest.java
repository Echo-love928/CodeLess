package dev.codeless.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.codeless.api.data.ArtifactRepository;
import dev.codeless.api.data.PlatformModels.DataMode;
import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.data.PostgresTestBase;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Import(AuthIntegrationTest.OwnedProbe.class)
@org.springframework.test.context.TestPropertySource(properties = {
        "CODELESS_DEMO_PASSWORD=demo-password-for-test-only",
        "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only"
})
class AuthIntegrationTest extends PostgresTestBase {
    MockMvc mvc;
    @Autowired WebApplicationContext context;
    @Autowired AuthFilter filter;
    @Autowired PlatformRepository platform;
    @Autowired ArtifactRepository artifacts;
    @Autowired AuthAccountRepository accounts;

    @BeforeEach
    void setUp() { mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(filter).build(); }

    record Browser(MockHttpSession session, String csrf) {}

    private Browser browser() throws Exception {
        MvcResult result = mvc.perform(get("/api/v0/auth/csrf"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty()).andReturn();
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        String token = (String) session.getAttribute(AuthFilter.CSRF);
        assertThat(token).hasSize(64);
        return new Browser(session, token);
    }

    private void login(Browser browser, String email, String password) throws Exception {
        mvc.perform(post("/api/v0/auth/login").session(browser.session())
                        .header("X-CSRF-Token", browser.csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.email").value(email));
    }

    @Test
    void correctAndWrongPasswordAndIndependentAccounts() throws Exception {
        Browser wrong = browser();
        mvc.perform(post("/api/v0/auth/login").session(wrong.session())
                        .header("X-CSRF-Token", wrong.csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"demo@codeless.local\",\"password\":\"wrong-secret\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        Browser demo = browser();
        Browser admin = browser();
        login(demo, "demo@codeless.local", "demo-password-for-test-only");
        login(admin, "admin@codeless.local", "admin-password-for-test-only");
        mvc.perform(get("/api/v0/auth/me").session(demo.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("USER"));
        mvc.perform(get("/api/v0/auth/me").session(admin.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));
        String hash = accounts.activeByEmail("demo@codeless.local").orElseThrow().hash();
        assertThat(hash).startsWith("$2").doesNotContain("demo-password-for-test-only");
    }

    @Test
    void logoutInvalidatesSessionAndCsrfProtectsWrites() throws Exception {
        Browser demo = browser();
        mvc.perform(post("/api/v0/auth/logout"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        mvc.perform(post("/api/v0/auth/login").session(demo.session())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        login(demo, "demo@codeless.local", "demo-password-for-test-only");
        mvc.perform(post("/api/v0/auth/logout").session(demo.session()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v0/auth/logout").session(demo.session())
                        .header("X-CSRF-Token", demo.csrf()))
                .andExpect(status().isNoContent());
        assertThat(demo.session().isInvalid()).isTrue();
        mvc.perform(get("/api/v0/auth/me"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void normalUserCannotAccessAdminRoute() throws Exception {
        Browser demo = browser();
        Browser admin = browser();
        login(demo, "demo@codeless.local", "demo-password-for-test-only");
        login(admin, "admin@codeless.local", "admin-password-for-test-only");
        mvc.perform(get("/api/v0/admin/session").session(demo.session()))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mvc.perform(get("/api/v0/admin/session").session(admin.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));
    }

    @Test
    void foreignApplicationTaskAndVersionAreHidden() throws Exception {
        UUID demoId = accounts.activeByEmail("demo@codeless.local").orElseThrow().id();
        UUID ownApplication = UUID.randomUUID();
        UUID ownTask = UUID.randomUUID();
        UUID ownVersion = UUID.randomUUID();
        platform.createApplication(ownApplication, demoId, "Owned app", DataMode.MOCK);
        platform.createTask(ownTask, ownApplication, "Owned prompt");
        artifacts.createDraftVersion(ownVersion, ownApplication, 1, "sha256:" + "b".repeat(64));
        UUID owner = UUID.randomUUID();
        UUID application = UUID.randomUUID();
        UUID task = UUID.randomUUID();
        UUID version = UUID.randomUUID();
        platform.createUser(owner, owner + "@example.test", "Another owner");
        platform.createApplication(application, owner, "Private app", DataMode.MOCK);
        platform.createTask(task, application, "Private prompt");
        artifacts.createDraftVersion(version, application, 1, "sha256:" + "a".repeat(64));
        Browser demo = browser();
        login(demo, "demo@codeless.local", "demo-password-for-test-only");
        for (String resource : new String[] {"applications/" + ownApplication, "tasks/" + ownTask,
                "versions/" + ownVersion}) {
            mvc.perform(get("/api/v0/test-owned/" + resource).session(demo.session()))
                    .andExpect(status().isOk());
        }
        for (String resource : new String[] {"applications/" + application, "tasks/" + task, "versions/" + version}) {
            mvc.perform(get("/api/v0/test-owned/" + resource).session(demo.session()))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
        }
        mvc.perform(get("/api/v0/test-owned/applications/" + UUID.randomUUID()).session(demo.session()))
                .andExpect(status().isNotFound());
    }

    @Test
    void fiveFailuresLimitFurtherAttempts() throws Exception {
        Browser browser = browser();
        String body = "{\"email\":\"unknown-" + UUID.randomUUID() + "@example.test\",\"password\":\"secret\"}";
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/api/v0/auth/login").session(browser.session())
                            .header("X-CSRF-Token", browser.csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        }
        mvc.perform(post("/api/v0/auth/login").session(browser.session())
                        .header("X-CSRF-Token", browser.csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("LOGIN_RATE_LIMITED"));
    }

    @RestController
    @RequestMapping("/api/v0/test-owned")
    static class OwnedProbe {
        private final OwnershipGuard guard;
        OwnedProbe(OwnershipGuard guard) { this.guard = guard; }
        @GetMapping("/applications/{id}") String app(HttpServletRequest request, @PathVariable UUID id) {
            guard.requireApplication(request, id); return "owned";
        }
        @GetMapping("/tasks/{id}") String task(HttpServletRequest request, @PathVariable UUID id) {
            guard.requireTask(request, id); return "owned";
        }
        @GetMapping("/versions/{id}") String version(HttpServletRequest request, @PathVariable UUID id) {
            guard.requireVersion(request, id); return "owned";
        }
    }
}
