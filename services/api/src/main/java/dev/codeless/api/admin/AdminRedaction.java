package dev.codeless.api.admin;

import java.util.List;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Masks credential-shaped text before anything reaches an administrator projection. Prompts are untrusted user
 * data: the admin API never returns them in full, only a short preview taken after masking.
 */
final class AdminRedaction {
    static final String MASK = "[REDACTED]";
    static final int PREVIEW_CODE_POINTS = 40;
    private record Rule(Pattern pattern, Function<Matcher, String> replacement) {}
    /** Order matters: whole-value rules run before rules that would consume only part of a value. */
    private static final List<Rule> RULES = List.of(
            whole("-----BEGIN [A-Z0-9 ]{1,40}-----.*?(?:-----END [A-Z0-9 ]{1,40}-----|\\z)", Pattern.DOTALL),
            // Header values contain spaces ("Bearer x", "a=1; b=2"): mask the rest of the line, not one word.
            keep("(?i)\\b(proxy-authorization|authorization|set-cookie|cookie)(\\s*[:=]\\s*)[^\\r\\n]*"),
            keep("(?i)\\b(bearer|basic|digest)(\\s+)[A-Za-z0-9._~+/=-]+"),
            keep("(?iu)\\b(api[_-]?key|apikey|secret|client[_-]?secret|auth[_-]?token|_authToken|token|password"
                    + "|passwd|pwd|passphrase|access[_-]?key|private[_-]?key|credential|authorization|cookie)(\\s*[:=]\\s*|\\s+is\\s+)"
                    + "(?:\"[^\"]*\"|'[^']*'|(?:(?:bearer|basic|digest|token)\\s+)?\\S+)"),
            keep("(密码|密钥|秘钥|口令|令牌)(\\s*[:：=]\\s*|\\s*[是为]\\s*)\\S+"),
            whole("\\beyJ[A-Za-z0-9_-]{6,}\\.[A-Za-z0-9_-]{6,}\\.[A-Za-z0-9_-]{6,}", 0),
            whole("\\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}", 0),
            whole("\\bgh[pousr]_[A-Za-z0-9]{16,}", 0),
            whole("\\bA[KS]IA[0-9A-Z]{16}\\b", 0),
            whole("\\bxox[abprs]-[A-Za-z0-9-]{10,}", 0),
            whole("\\bAIza[0-9A-Za-z_-]{30,}", 0),
            // Long opaque runs (hex/base64 keys, digests) are never useful in an admin listing.
            whole("[A-Za-z0-9+/_=-]{32,}", 0));
    private static final Pattern INVISIBLE = Pattern.compile("[\\p{Cc}\\p{Cf}\\s]+");

    private AdminRedaction() {}

    /** Keeps the key and separator (groups 1 and 2) and masks the value. */
    private static Rule keep(String regex) {
        return new Rule(Pattern.compile(regex), m -> m.group(1) + m.group(2) + MASK);
    }

    private static Rule whole(String regex, int flags) {
        return new Rule(Pattern.compile(regex, flags), m -> MASK);
    }

    static String redact(String text) {
        if (text == null) return null;
        String result = text;
        for (Rule rule : RULES) {
            Matcher matcher = rule.pattern().matcher(result);
            StringBuilder masked = new StringBuilder();
            while (matcher.find()) matcher.appendReplacement(masked, Matcher.quoteReplacement(rule.replacement().apply(matcher)));
            matcher.appendTail(masked);
            result = masked.toString();
        }
        return result;
    }

    /** Masks first, then truncates, so a secret straddling the cut can never leak a prefix. */
    static String preview(String text) {
        String clean = INVISIBLE.matcher(redact(text)).replaceAll(" ").strip();
        if (clean.codePointCount(0, clean.length()) <= PREVIEW_CODE_POINTS) return clean;
        return clean.substring(0, clean.offsetByCodePoints(0, PREVIEW_CODE_POINTS)) + "…";
    }
}
