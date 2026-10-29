package dev.codeless.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

/** D24-A: a valid JSON prefix must not reach a handler before the whole bounded body is checked. */
class RequestBodyBoundaryTest {
    private static final int LIMIT = 128 * 1024;
    private AuthFilter filter;
    private AuthAccountRepository accounts;

    @BeforeEach void setup() {
        accounts = mock(AuthAccountRepository.class);
        filter = new AuthFilter(accounts, JsonMapper.builder().build());
    }

    private MockHttpServletRequest request(byte[] body, boolean chunked) {
        var request = new MockHttpServletRequest("POST", "/api/v0/auth/login") {
            @Override public long getContentLengthLong() { return chunked ? -1 : super.getContentLengthLong(); }
            @Override public int getContentLength() { return chunked ? -1 : super.getContentLength(); }
        };
        request.setContentType("application/json");
        request.setCharacterEncoding("UTF-8");
        request.setContent(body);
        request.getSession().setAttribute(AuthFilter.CSRF, "fixture-csrf");
        request.addHeader("X-CSRF-Token", "fixture-csrf");
        return request;
    }

    @Test void knownLengthOversizedBodyNeverReachesHandler() throws Exception {
        rejectsOversized(false);
    }

    @Test void unknownLengthValidJsonPrefixWithOversizedTrailingWhitespaceNeverReachesHandler() throws Exception {
        rejectsOversized(true);
    }

    private void rejectsOversized(boolean chunked) throws Exception {
        byte[] body = ("{\"email\":\"fixture@example.test\",\"password\":\"fixture-secret\"}" + " ".repeat(LIMIT))
                .getBytes(StandardCharsets.UTF_8);
        var response = new MockHttpServletResponse();
        var called = new AtomicInteger();
        filter.doFilter(request(body, chunked), response, (req, res) -> called.incrementAndGet());
        assertThat(called.get()).as("oversized body must be rejected before any handler side effect").isZero();
        assertThat(response.getStatus()).isEqualTo(400);
        var error = JsonMapper.builder().build().readTree(response.getContentAsByteArray());
        assertThat(error.path("code").asText()).isEqualTo("INVALID_REQUEST");
        assertThat(error.path("traceId").asText()).isNotBlank();
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(response.getContentAsString()).doesNotContain("fixture-secret", "fixture@example.test", "fixture-csrf");
        verifyNoInteractions(accounts);
    }

    @Test void exactLimitIsPassedByteForByteForBothFramings() throws Exception {
        for (boolean chunked : new boolean[]{false, true}) {
            byte[] body = ("{\"prompt\":\"" + "😀".repeat(8000) + "\"}").getBytes(StandardCharsets.UTF_8);
            byte[] padded = java.util.Arrays.copyOf(body, LIMIT);
            java.util.Arrays.fill(padded, body.length, LIMIT, (byte) ' ');
            var response = new MockHttpServletResponse();
            var called = new AtomicInteger();
            filter.doFilter(request(padded, chunked), response, (req, res) -> {
                assertThat(req.getInputStream().readAllBytes()).isEqualTo(padded);
                called.incrementAndGet();
            });
            assertThat(called.get()).isEqualTo(1);
            assertThat(response.getStatus()).isEqualTo(200);
        }
    }

    @Test void authenticationAndCsrfFailuresStillTakePrecedence() throws Exception {
        var request = request(new byte[LIMIT + 1], true);
        request.removeHeader("X-CSRF-Token");
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> { throw new AssertionError("CSRF bypass"); });
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("CSRF_INVALID");
        request.setRequestURI("/api/v0/tasks");
        response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> { throw new AssertionError("authentication bypass"); });
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("UNAUTHENTICATED");
    }
}
