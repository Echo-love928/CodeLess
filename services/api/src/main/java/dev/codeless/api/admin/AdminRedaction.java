package dev.codeless.api.admin;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Masks credential-shaped text before anything reaches an administrator projection. Prompts are untrusted user
 * data: the admin API never returns them in full, only a short preview taken after masking.
 */
final class AdminRedaction {
    static final String MASK = "[REDACTED]";
    static final int PREVIEW_CODE_POINTS = 40;
    private static final Pattern ASSIGNMENT = Pattern.compile("(?iu)\\b(api[_-]?key|apikey|secret|client[_-]?secret"
            + "|auth[_-]?token|_authToken|token|password|passwd|pwd|passphrase|access[_-]?key|private[_-]?key"
            + "|credential|authorization|cookie)(\\s*[:=]\\s*|\\s+is\\s+)(\"[^\"]*\"|'[^']*'|\\S+)"
            + "|(密码|密钥|秘钥|口令|令牌)(\\s*[:：=]\\s*|\\s*[是为]\\s*)(\\S+)");
    private static final List<Pattern> SECRETS = List.of(
            Pattern.compile("-----BEGIN [A-Z0-9 ]{1,40}-----.*?(?:-----END [A-Z0-9 ]{1,40}-----|\\z)", Pattern.DOTALL),
            Pattern.compile("(?i)\\bbearer\\s+[A-Za-z0-9._~+/=-]{6,}"),
            Pattern.compile("\\beyJ[A-Za-z0-9_-]{6,}\\.[A-Za-z0-9_-]{6,}\\.[A-Za-z0-9_-]{6,}"),
            Pattern.compile("\\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}"),
            Pattern.compile("\\bgh[pousr]_[A-Za-z0-9]{16,}"),
            Pattern.compile("\\bA[KS]IA[0-9A-Z]{16}\\b"),
            Pattern.compile("\\bxox[abprs]-[A-Za-z0-9-]{10,}"),
            Pattern.compile("\\bAIza[0-9A-Za-z_-]{30,}"),
            // Long opaque runs (hex/base64 keys, digests) are never useful in an admin listing.
            Pattern.compile("[A-Za-z0-9+/_=-]{32,}"));
    private static final Pattern INVISIBLE = Pattern.compile("[\\p{Cc}\\p{Cf}\\s]+");

    private AdminRedaction() {}

    static String redact(String text) {
        if (text == null) return null;
        Matcher assignment = ASSIGNMENT.matcher(text);
        StringBuilder masked = new StringBuilder();
        while (assignment.find()) {
            String key = assignment.group(1) != null ? assignment.group(1) + assignment.group(2)
                    : assignment.group(4) + assignment.group(5);
            assignment.appendReplacement(masked, Matcher.quoteReplacement(key + MASK));
        }
        assignment.appendTail(masked);
        String result = masked.toString();
        for (Pattern secret : SECRETS) result = secret.matcher(result).replaceAll(Matcher.quoteReplacement(MASK));
        return result;
    }

    /** Masks first, then truncates, so a secret straddling the cut can never leak a prefix. */
    static String preview(String text) {
        String clean = INVISIBLE.matcher(redact(text)).replaceAll(" ").strip();
        if (clean.codePointCount(0, clean.length()) <= PREVIEW_CODE_POINTS) return clean;
        return clean.substring(0, clean.offsetByCodePoints(0, PREVIEW_CODE_POINTS)) + "…";
    }
}
