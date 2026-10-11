package dev.codeless.api.agent;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import tools.jackson.databind.JsonNode;

/** Diagnostics are data. Only observed, allowlisted source failures authorize a repair. */
public final class RepairController {
    public enum Category { CODE, INFRASTRUCTURE, MODEL_INTERFACE, CONTROL }
    public record Failure(Category category,String code,String fingerprint,String diagnostic) {}
    public Failure classify(JsonNode result) {
        var build=result.path("build");var browser=result.path("verification");
        String reason=build.path("failure").asText();
        if(reason.isBlank()) reason=browser.path("failure").asText();
        if(reason.isBlank()) reason=result.path("failure").asText("RUNNER_UNAVAILABLE");
        if(reason.isBlank() || !reason.matches("[A-Z][A-Z0-9_]{1,80}")) reason="RUNNER_UNAVAILABLE";
        boolean browserFailed=build.path("status").asText().equals("SUCCEEDED") && !browser.isMissingNode() && !browser.isNull();
        String diagnostic=browserFailed?browser.path("error").asText(""):build.path("log").path("text").asText("");
        if(diagnostic.isBlank()) diagnostic=browserFailed?browser.path("diagnostics").toString():build.path("diagnostic").asText("");
        diagnostic=normalize(diagnostic);
        boolean compiler=reason.equals("BUILD_EXIT") && build.path("exitCode").isIntegralNumber()
                && build.path("status").asText().equals("FAILED") && !build.path("timedOut").asBoolean(true)
                && !build.path("oomKilled").asBoolean(true) && cleanBuild(build)
                && build.path("exitCode").asInt()>0 && build.path("exitCode").asInt()<125
                && diagnostic.matches("(?s).*(error TS[0-9]+|\\[vite:|VueCompilerError|SyntaxError|Could not resolve|Failed to resolve).*" );
        boolean page=build.path("status").asText().equals("SUCCEEDED") && build.path("exitCode").isIntegralNumber()
                && build.path("exitCode").asInt()==0 && !browser.path("timedOut").asBoolean(true)
                && cleanBuild(build) && browser.path("cleanup").path("browserClosed").asBoolean(false)
                && browser.path("status").asText().equals("FAILED") && browser.path("workerExitCode").asInt(-1)==1
                && Set.of("ACTION_FAILED","PAGE_EXCEPTION","CONSOLE_ERROR","BLANK_PAGE").contains(reason);
        String signature=diagnostic.lines().filter(line->line.matches(".*(?:error TS[0-9]+|\\[vite:|SyntaxError|VueCompilerError|Could not resolve|Failed to resolve).*"))
                .limit(10).reduce((a,b)->a+"\n"+b).orElse(diagnostic);
        return new Failure(compiler || page?Category.CODE:Category.INFRASTRUCTURE,"AGENT_"+reason,hash(reason+"\n"+signature),diagnostic);
    }
    private static boolean cleanBuild(JsonNode build) {
        var cleanup=build.path("cleanup");return cleanup.path("containerRemoved").asBoolean(false)
                && cleanup.path("workspaceRemoved").asBoolean(false) && cleanup.path("errors").isArray() && cleanup.path("errors").isEmpty();
    }
    public Category category(String code) {
        if(code.startsWith("MODEL_") || code.equals("AGENT_MODEL_PROTOCOL_INVALID")) return Category.MODEL_INTERFACE;
        if(code.contains("BUDGET") || code.contains("TIMEOUT") || code.contains("LEASE") || code.contains("REPAIR_LIMIT")
                || code.equals("AGENT_REPAIR_NO_PROGRESS") || code.equals("CANCELLED")) return Category.CONTROL;
        return Category.INFRASTRUCTURE;
    }
    public String stop(Failure failure,String sourceDigest,List<JsonNode> events,int attempts) {
        if(failure.category()!=Category.CODE) return failure.code();
        var previous=events.stream().filter(e -> e.path("kind").asText().equals("repair.failure")).reduce((a,b)->b);
        if(previous.isPresent()) {
            var value=previous.get().path("payload");
            if(value.path("fingerprint").asText().equals(failure.fingerprint()) && value.path("sourceDigest").asText().equals(sourceDigest))
                return "AGENT_REPAIR_NO_PROGRESS";
        }
        return attempts>=RuntimeBudget.REPAIRS?"AGENT_REPAIR_LIMIT_EXCEEDED":null;
    }
    static String normalize(String diagnostic) {
        String clean=diagnostic.replaceAll("\u001b\\[[0-9;]*[A-Za-z]","")
                .replaceAll("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}","<execution>")
                .replaceAll("(?m)^.*(?:built in|ELIFECYCLE|Command failed|codeless-generated|> vue-tsc|> vite).*(?:\\R|$)","")
                .replaceAll("\\b[0-9]+(?:\\.[0-9]+)?(?:ms|s)\\b","<duration>")
                .replaceAll("[ \\t]+"," ").strip();
        return clean.length()>12000?clean.substring(0,12000):clean;
    }
    private static String hash(String value) {
        try {return "sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch(Exception impossible) {throw new IllegalStateException(impossible);}
    }
}
