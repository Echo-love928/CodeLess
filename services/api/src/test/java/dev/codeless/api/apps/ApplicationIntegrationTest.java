package dev.codeless.api.apps;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.codeless.api.auth.AuthFilter;
import dev.codeless.api.data.PostgresTestBase;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@TestPropertySource(properties = {
        "CODELESS_DEMO_PASSWORD=demo-password-for-test-only",
        "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only"
})
class ApplicationIntegrationTest extends PostgresTestBase {
    @Autowired WebApplicationContext context;
    @Autowired AuthFilter filter;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired ApplicationService applications;
    MockMvc mvc;

    record Browser(MockHttpSession session, String csrf) {}

    @BeforeEach void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(filter).build();
    }

    private Browser login(String email, String password) throws Exception {
        MvcResult csrf = mvc.perform(get("/api/v0/auth/csrf"))
                .andExpect(status().isOk()).andReturn();
        MockHttpSession session = (MockHttpSession) csrf.getRequest().getSession(false);
        String token = (String) session.getAttribute(AuthFilter.CSRF);
        mvc.perform(post("/api/v0/auth/login").session(session).header("X-CSRF-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk());
        return new Browser(session, token);
    }

    private JsonNode create(Browser browser, String body) throws Exception {
        MvcResult result = mvc.perform(post("/api/v0/applications")
                        .session(browser.session()).header("X-CSRF-Token", browser.csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn();
        return mapper.readTree(result.getResponse().getContentAsString());
    }

    @Test void createdShellAndDraftAreVisibleOnlyToOwner() throws Exception {
        Browser demo = login("demo@codeless.local", "demo-password-for-test-only");
        Browser admin = login("admin@codeless.local", "admin-password-for-test-only");
        JsonNode app = create(demo, "{\"name\":\"First app\",\"dataMode\":\"MOCK\",\"template\":\"VUE\"}");
        String id = app.get("id").asText();
        String versionId = app.get("baseVersionId").asText();
        assertThat(app.get("template").asText()).isEqualTo("VUE");
        assertThat(app.get("status").asText()).isEqualTo("ACTIVE");
        assertThat(app.get("latestReadyVersionId")).isNull();
        mvc.perform(get("/api/v0/applications/" + id).session(demo.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.baseVersionId").value(versionId));
        mvc.perform(get("/api/v0/versions/" + versionId).session(demo.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.applicationId").value(id))
                .andExpect(jsonPath("$.number").value(1)).andExpect(jsonPath("$.status").value("DRAFT"));
        mvc.perform(get("/api/v0/applications/" + id).session(admin.session()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v0/versions/" + versionId).session(admin.session()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v0/applications?page=0&size=100").session(admin.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[?(@.id == '" + id + "')]").isEmpty());
        mvc.perform(patch("/api/v0/applications/" + id).session(admin.session())
                        .header("X-CSRF-Token", admin.csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"stolen\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(patch("/api/v0/applications/" + id).session(demo.session())
                        .header("X-CSRF-Token", demo.csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Renamed\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Renamed"));
    }

    @Test void invalidInputAndAuthenticationAreRejectedWithoutRows() throws Exception {
        Browser demo = login("demo@codeless.local", "demo-password-for-test-only");
        String[] invalid = {
                "{\"name\":\"\",\"dataMode\":\"MOCK\"}",
                "{\"name\":\"   \",\"dataMode\":\"MOCK\"}",
                "{\"name\":\"" + "x".repeat(121) + "\",\"dataMode\":\"MOCK\"}",
                "{\"name\":\"bad\",\"dataMode\":\"MOCK\",\"template\":\"REACT\"}",
                "{\"name\":\"bad\",\"dataMode\":\"MOCK\",\"framework\":\"REACT\"}",
                "{\"name\":\"bad\",\"dataMode\":\"MOCK\",\"ownerId\":\"" + UUID.randomUUID() + "\"}",
                "{\"name\":\"bad\",\"dataMode\":\"REMOTE\"}"
        };
        for (String body : invalid) {
            mvc.perform(post("/api/v0/applications").session(demo.session())
                            .header("X-CSRF-Token", demo.csrf()).contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
        mvc.perform(post("/api/v0/applications").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"anonymous\",\"dataMode\":\"MOCK\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v0/applications").session(demo.session())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"no csrf\",\"dataMode\":\"MOCK\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v0/applications?page=-1").session(demo.session()))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v0/applications?size=101").session(demo.session()))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v0/applications?page=abc").session(demo.session()))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v0/applications/not-a-uuid").session(demo.session()))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM applications WHERE name = 'bad'", Long.class))
                .isZero();
        JsonNode boundary = create(demo, "{\"name\":\"" + "x".repeat(120)
                + "\",\"dataMode\":\"MOCK\"}");
        mvc.perform(patch("/api/v0/applications/" + boundary.get("id").asText())
                        .session(demo.session()).header("X-CSRF-Token", demo.csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"  \"}"))
                .andExpect(status().isBadRequest());
    }

    @Test void paginationUsesStableTimestampAndIdOrdering() throws Exception {
        Browser demo = login("demo@codeless.local", "demo-password-for-test-only");
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            ids.add(create(demo, "{\"name\":\"Page app " + UUID.randomUUID()
                    + "\",\"dataMode\":\"STATIC\"}").get("id").asText());
        }
        for (String id : ids) {
            jdbc.update("UPDATE applications SET created_at = '2026-01-01T00:00:00Z' WHERE id = ?",
                    UUID.fromString(id));
        }
        List<String> expected = ids.stream().sorted((a, b) -> b.compareTo(a)).toList();
        UUID ownerId = jdbc.queryForObject("SELECT id FROM platform_users WHERE email = 'demo@codeless.local'", UUID.class);
        List<String> actual = jdbc.queryForList("SELECT id::text FROM applications WHERE owner_id = ? "
                + "ORDER BY created_at DESC, id DESC", String.class, ownerId);
        List<String> pageIds = new ArrayList<>();
        for (int page = 0; page < (actual.size() + 1) / 2; page++) {
            MvcResult result = mvc.perform(get("/api/v0/applications?page=" + page + "&size=2")
                            .session(demo.session()))
                    .andExpect(status().isOk()).andReturn();
            JsonNode response = mapper.readTree(result.getResponse().getContentAsString());
            assertThat(response.get("total").asLong()).isEqualTo(actual.size());
            for (JsonNode item : response.get("items")) pageIds.add(item.get("id").asText());
        }
        assertThat(pageIds).containsExactlyElementsOf(actual);
        assertThat(pageIds).containsSubsequence(expected);
        assertThat(pageIds).doesNotHaveDuplicates();
    }

    @Test void concurrentCreationKeepsEachInitialVersionWithItsApplication() throws Exception {
        UUID ownerId = jdbc.queryForObject("SELECT id FROM platform_users WHERE email = 'demo@codeless.local'", UUID.class);
        var executor = Executors.newFixedThreadPool(8);
        try {
            List<Callable<ApplicationService.ApplicationView>> jobs = new ArrayList<>();
            for (int i = 0; i < 24; i++) {
                int index = i;
                jobs.add(() -> applications.create(ownerId, "Concurrent " + index,
                        null, "LOCAL_STORAGE"));
            }
            var futures = executor.invokeAll(jobs);
            List<UUID> versions = new ArrayList<>();
            for (var future : futures) {
                var app = future.get();
                versions.add(app.baseVersionId());
                assertThat(jdbc.queryForObject("SELECT application_id FROM application_versions WHERE id = ?",
                        UUID.class, app.baseVersionId())).isEqualTo(app.id());
                assertThat(jdbc.queryForObject("SELECT number FROM application_versions WHERE id = ?",
                        Integer.class, app.baseVersionId())).isEqualTo(1);
            }
            assertThat(versions).doesNotHaveDuplicates();
        } finally {
            executor.shutdownNow();
        }
    }
}
