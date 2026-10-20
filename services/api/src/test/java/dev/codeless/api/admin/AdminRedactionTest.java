package dev.codeless.api.admin;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AdminRedactionTest {
    @Test void credentialShapedTextIsMaskedWherePlainTextSurvives() {
        // One case per line: header-style keys mask the rest of their line.
        String text = AdminRedaction.redact(String.join("\n",
                "Build a gallery. api_key=sk-proj-abcdef123456 PASSWORD: \"two words\"",
                "token is ghp_abcdefghijklmnopqrstuvwx",
                "Authorization: Bearer eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl",
                "AKIAABCDEFGHIJKLMNOP xoxb-1234567890-abc AIzaSyA1234567890abcdefghijklmnopqrstu",
                "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34\n-----END RSA PRIVATE KEY-----",
                "密码：hunter2 口令是 open-sesame deadbeefdeadbeefdeadbeefdeadbeefdeadbeef //registry/:_authToken=npm_abc"));
        assertThat(text).startsWith("Build a gallery. api_key=[REDACTED]").contains("PASSWORD: [REDACTED]")
                .contains("Authorization: [REDACTED]").contains("密码：[REDACTED]").contains("口令是 [REDACTED]");
        for (String secret : new String[] {"sk-proj", "two words", "ghp_", "eyJ", "AKIA", "xoxb-", "AIza", "MIIBOg",
                "PRIVATE KEY", "hunter2", "open-sesame", "deadbeef", "npm_abc"})
            assertThat(text).as(secret).doesNotContain(secret);
    }

    /** D17-B review P1: masking only the scheme word used to leave the credential itself in place. */
    @Test void authorizationSchemesAndCookieHeadersNeverKeepTheCredential() {
        assertThat(AdminRedaction.redact("Authorization: Bearer demoTok123")).isEqualTo("Authorization: [REDACTED]");
        assertThat(AdminRedaction.preview("Authorization: Bearer demoTok123")).isEqualTo("Authorization: [REDACTED]");
        String[][] cases = {
                {"authorization=Basic dXNlcjpwYXNz", "dXNlcjpwYXNz"},
                {"Proxy-Authorization: Digest username=\"u\", response=\"abc123\"", "abc123"},
                {"AUTHORIZATION:token tok_abc", "tok_abc"},
                {"Cookie: sid=abc; csrftoken=def", "def"},
                {"Set-Cookie: session=xyz; HttpOnly", "xyz"},
                {"curl -H 'Bearer demoTok123' https://example.test", "demoTok123"},
                {"token: Bearer abc123", "abc123"},
                {"the token is bearer abc123", "abc123"},
                {"x-api-key: k_live_42", "k_live_42"}};
        for (String[] c : cases) {
            assertThat(AdminRedaction.redact(c[0])).as(c[0]).doesNotContain(c[1]).contains("[REDACTED]");
            assertThat(AdminRedaction.preview(c[0])).as(c[0]).doesNotContain(c[1]);
        }
        // Masking is per line: the next line of an ordinary prompt survives.
        assertThat(AdminRedaction.redact("Authorization: Bearer x1\nBuild a page")).isEqualTo("Authorization: [REDACTED]\nBuild a page");
    }

    @Test void previewMasksBeforeTruncatingAndRemovesInvisibleCharacters() {
        String straddle = "a".repeat(30) + " key x " + "sk-" + "Z".repeat(20);
        String preview = AdminRedaction.preview(straddle);
        assertThat(preview).doesNotContain("sk-", "ZZZ");
        assertThat(preview.codePointCount(0, preview.length())).isLessThanOrEqualTo(AdminRedaction.PREVIEW_CODE_POINTS + 1);
        assertThat(AdminRedaction.preview("Line1\n\tLine2\u202Eevil\0")).isEqualTo("Line1 Line2 evil");
        assertThat(AdminRedaction.preview("短提示")).isEqualTo("短提示");
        String emoji = "😀".repeat(50);
        assertThat(AdminRedaction.preview(emoji)).isEqualTo("😀".repeat(AdminRedaction.PREVIEW_CODE_POINTS) + "…");
    }
}
