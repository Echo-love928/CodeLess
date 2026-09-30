package dev.codeless.api.tasks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.codeless.api.auth.AuthFilter;
import dev.codeless.api.data.PostgresTestBase;
import java.util.UUID;
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
class TaskHttpTest extends PostgresTestBase {
    @Autowired WebApplicationContext context;
    @Autowired AuthFilter filter;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    MockMvc mvc;

    record Browser(MockHttpSession session, String csrf) {}

    @BeforeEach void setup() {
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

    private UUID application(Browser browser) throws Exception {
        MvcResult response = mvc.perform(post("/api/v0/applications")
                .session(browser.session()).header("X-CSRF-Token", browser.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Task API app\",\"dataMode\":\"MOCK\"}"))
                .andExpect(status().isCreated()).andReturn();
        return UUID.fromString(mapper.readTree(response.getResponse().getContentAsString()).get("id").asText());
    }

    private String body(UUID app, String prompt) {
        return "{\"applicationId\":\"" + app + "\",\"prompt\":\"" + prompt + "\"}";
    }

    @Test void createReplayReadEventsAndCancelThroughAuthenticatedHttp() throws Exception {
        Browser owner = login("demo@codeless.local", "demo-password-for-test-only");
        UUID app = application(owner);
        MvcResult created = mvc.perform(post("/api/v0/tasks").session(owner.session())
                .header("X-CSRF-Token", owner.csrf()).header("Idempotency-Key", "http-retry-" + app)
                .contentType(MediaType.APPLICATION_JSON).content(body(app, "Build a page")))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("PLAN"))
                .andReturn();
        JsonNode first = mapper.readTree(created.getResponse().getContentAsString());
        String id = first.get("id").asText();
        mvc.perform(post("/api/v0/tasks").session(owner.session())
                .header("X-CSRF-Token", owner.csrf()).header("Idempotency-Key", "http-retry-" + app)
                .contentType(MediaType.APPLICATION_JSON).content(body(app, "Build a page")))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.id").value(id));
        mvc.perform(get("/api/v0/tasks/" + id).session(owner.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PLAN"));
        mvc.perform(get("/api/v0/tasks/" + id + "/events").session(owner.session()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].sequence").value(1));
        mvc.perform(post("/api/v0/tasks/" + id + "/cancel").session(owner.session())
                .header("X-CSRF-Token", owner.csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.failureCode").value("CANCELLED"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM task_events WHERE task_id = ?",
                Integer.class, UUID.fromString(id))).isEqualTo(2);
    }

    @Test void rejectsForeignAnonymousMalformedAndConflictingRequests() throws Exception {
        Browser owner = login("demo@codeless.local", "demo-password-for-test-only");
        Browser stranger = login("admin@codeless.local", "admin-password-for-test-only");
        UUID app = application(owner);
        MvcResult created = mvc.perform(post("/api/v0/tasks").session(owner.session())
                .header("X-CSRF-Token", owner.csrf()).header("Idempotency-Key", "conflict-" + app)
                .contentType(MediaType.APPLICATION_JSON).content(body(app, "Build a page")))
                .andExpect(status().isAccepted()).andReturn();
        String id = mapper.readTree(created.getResponse().getContentAsString()).get("id").asText();
        mvc.perform(post("/api/v0/tasks").session(owner.session())
                .header("X-CSRF-Token", owner.csrf()).header("Idempotency-Key", "conflict-" + app)
                .contentType(MediaType.APPLICATION_JSON).content(body(app, "Different")))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v0/tasks").session(stranger.session())
                .header("X-CSRF-Token", stranger.csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body(app, "Foreign")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v0/tasks/" + id).session(stranger.session()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v0/tasks/" + id)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v0/tasks/" + id + "/cancel").session(owner.session()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v0/tasks").session(owner.session())
                .header("X-CSRF-Token", owner.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"applicationId\":\"" + app + "\",\"prompt\":\" \",\"status\":\"READY\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v0/tasks").session(owner.session())
                .header("X-CSRF-Token", owner.csrf()).header("Idempotency-Key", "bad key")
                .contentType(MediaType.APPLICATION_JSON).content(body(app, "Build a page")))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM generation_tasks WHERE application_id = ?",
                Integer.class, app)).isEqualTo(1);
    }
}
