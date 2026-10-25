package dev.codeless.api.agent;

import java.util.*;
import tools.jackson.databind.JsonNode;

/**
 * Host checks of a GENERATE done proposal before its source is frozen. The shape rules mirror the runner's
 * services/runner/src/verify/actions.mjs, which stays authoritative; routes and coverage are the platform's.
 * A rejection names a fixed reason so the model can correct its own proposal; it never grants anything.
 */
final class AcceptanceActions {
    record Rejection(String code, Map<String,Object> detail) {}
    static final int LIMIT=20;
    private static final Set<String> TYPES=Set.of("click","fill","select","check","expectText","expectVisible","reload","navigate");
    private static final Set<String> ROLES=Set.of("button","link","textbox","checkbox","combobox","heading","listitem","tab");
    private static final Set<String> ROUTES=Set.of("/","/tasks","/catalog");
    private AcceptanceActions() {}

    static Rejection check(JsonNode plan,JsonNode actions) {
        if(!actions.isArray() || actions.isEmpty()) return invalid("NO_ACTIONS",Map.of("limit",LIMIT));
        if(actions.size()>LIMIT) return invalid("TOO_MANY_ACTIONS",Map.of("limit",LIMIT,"actual",actions.size()));
        Set<String> covered=new HashSet<>();String route=null;
        for(int index=0;index<actions.size();index++) {
            JsonNode action=actions.get(index);
            String reason=shape(action);
            if(reason!=null) return invalid(reason,Map.of("index",index));
            String type=action.path("type").asText();
            if(type.equals("navigate")) {
                route=action.path("path").asText();
                if(!ROUTES.contains(route)) return invalid("UNSUPPORTED_ROUTE",Map.of("index",index,"routes",List.copyOf(new TreeSet<>(ROUTES))));
            }
            if(placeholder(action)) return invalid("TEMPLATE_PLACEHOLDER",Map.of("index",index));
            if(route!=null && Set.of("expectText","expectVisible").contains(type)) covered.add(route);
        }
        var missing=new TreeSet<String>();
        for(JsonNode page:plan.path("pages")) if(!covered.contains(page.path("route").asText())) missing.add(page.path("route").asText());
        return missing.isEmpty()?null:new Rejection("AGENT_ACCEPTANCE_INCOMPLETE",Map.of("reason","ROUTE_NOT_ASSERTED","routes",List.copyOf(missing)));
    }
    private static Rejection invalid(String reason,Map<String,Object> extra) {
        var detail=new LinkedHashMap<String,Object>();detail.put("reason",reason);detail.putAll(extra);
        return new Rejection("AGENT_ACCEPTANCE_INVALID",detail);
    }
    private static boolean keys(JsonNode value,Set<String> allowed) {
        return value.isObject() && allowed.containsAll(value.propertyNames());
    }
    private static boolean text(JsonNode value,int max) {
        return value.isString() && !blank(value.asText()) && value.asText().length()<=max;
    }
    /** True when String.prototype.trim() would leave nothing: JS WhiteSpace and LineTerminator, not Character.isWhitespace. */
    private static boolean blank(String value) {
        return value.chars().allMatch(c -> c==0x09 || c==0x0a || c==0x0b || c==0x0c || c==0x0d || c==0x20 || c==0xa0
                || c==0x1680 || c>=0x2000 && c<=0x200a || c==0x2028 || c==0x2029 || c==0x202f || c==0x205f || c==0x3000 || c==0xfeff);
    }
    private static String shape(JsonNode action) {
        if(!keys(action,Set.of("type","target","value","path")) || !TYPES.contains(action.path("type").asText())) return "UNSUPPORTED_ACTION";
        String type=action.path("type").asText();
        if(type.equals("reload")) return keys(action,Set.of("type"))?null:"UNEXPECTED_FIELDS";
        if(type.equals("navigate")) {
            if(!keys(action,Set.of("type","path")) || !text(action.path("path"),256)) return "INVALID_NAVIGATION";
            String path=action.path("path").asText();
            return path.matches("/[A-Za-z0-9_/-]*(?:#[A-Za-z0-9_/-]*)?") && !path.startsWith("//")
                    && !Arrays.asList(path.split("/")).contains("..")?null:"INVALID_NAVIGATION";
        }
        boolean valued=Set.of("fill","select","expectText").contains(type);
        if(!keys(action,valued?Set.of("type","target","value"):Set.of("type","target"))) return "UNEXPECTED_FIELDS";
        JsonNode target=action.path("target");
        if(!target.isObject()) return "INVALID_TARGET";
        if(target.has("testId")) { if(!keys(target,Set.of("testId")) || !text(target.path("testId"),100)) return "INVALID_TARGET"; }
        else if(target.has("text")) { if(!keys(target,Set.of("text")) || !text(target.path("text"),256)) return "INVALID_TARGET"; }
        else if(!keys(target,Set.of("role","name")) || !ROLES.contains(target.path("role").asText()) || !text(target.path("name"),256)) return "INVALID_TARGET";
        // Fill is literal user input, including blanks used to test form rejection. Locators and assertions stay nonblank.
        if(valued && !(type.equals("fill") && action.path("value").isString() && action.path("value").asText().length()<=2000)
                && !text(action.path("value"),2000)) return "INVALID_VALUE";
        return null;
    }
    /**
     * A testId is an attribute value the generated source has to produce, so interpolation syntax in one is an
     * unresolved template that the rendered DOM can never match. Texts and values are not judged here: a Vue
     * string such as "{{ count }}" bound with {{ literal }} renders its braces verbatim, and the runner accepts it.
     */
    private static boolean placeholder(JsonNode action) {
        String testId=action.path("target").path("testId").asText("");
        return testId.contains("{{") || testId.contains("}}") || testId.contains("${");
    }
}
