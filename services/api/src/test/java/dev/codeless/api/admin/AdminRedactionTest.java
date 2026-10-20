package dev.codeless.api.admin;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AdminRedactionTest {
    @Test void credentialShapedTextIsMaskedWherePlainTextSurvives() {
        String text = AdminRedaction.redact("Build a gallery. api_key=sk-proj-abcdef123456 PASSWORD: \"two words\" "
                + "token is ghp_abcdefghijklmnopqrstuvwx Authorization: Bearer eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl "
                + "AKIAABCDEFGHIJKLMNOP xoxb-1234567890-abc AIzaSyA1234567890abcdefghijklmnopqrstu "
                + "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34\n-----END RSA PRIVATE KEY----- "
                + "密码：hunter2 口令是 open-sesame deadbeefdeadbeefdeadbeefdeadbeefdeadbeef //registry/:_authToken=npm_abc");
        assertThat(text).startsWith("Build a gallery. api_key=[REDACTED]").contains("PASSWORD: [REDACTED]")
                .contains("密码：[REDACTED]").contains("口令是 [REDACTED]");
        for (String secret : new String[] {"sk-proj", "two words", "ghp_", "eyJ", "AKIA", "xoxb-", "AIza", "MIIBOg",
                "PRIVATE KEY", "hunter2", "open-sesame", "deadbeef", "npm_abc"})
            assertThat(text).as(secret).doesNotContain(secret);
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
