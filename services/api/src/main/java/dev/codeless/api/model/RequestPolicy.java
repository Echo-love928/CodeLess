package dev.codeless.api.model;

import java.util.regex.Pattern;

/** Early rejection of explicit unsupported requests; output schema and runner remain authoritative. */
public final class RequestPolicy {
    private RequestPolicy() {}
    private static final Pattern FORBIDDEN = Pattern.compile(
            "(?iu)(后端|服务端|支付|付款|微信支付|支付宝|外部服务|外部接口|远程接口|安装依赖|新增依赖|"
            + "\\b(backend|server[- ]?side|stripe|paypal|payment|supabase|firebase|react|next\\.js|express|flask)\\b|"
            + "\\b(npm|pnpm|yarn)\\s+(add|install)\\b|\\b(fetch|axios)\\s*\\(|https?://)");
    private static final Pattern NEGATED = Pattern.compile(
            "(?iu)(?:(?:不需要|无需|不要|禁止|不使用|不生成|不接入)\\s*"
            + "(?:后端|服务端|支付|付款|外部服务|外部接口|(?:backend|payments?|external services?)\\b)"
            + "|\\b(?:no|without)\\s+(?:backend|payments?|external services?)\\b)");
    public static void validate(String request) {
        if (request != null && FORBIDDEN.matcher(NEGATED.matcher(request).replaceAll("")).find())
            throw new ModelFailure("PLAN_UNSUPPORTED_REQUEST");
    }
}
