package dev.codeless.api.model;

import java.io.IOException;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.json.JsonReadFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** Evaluates the deliberately small, closed plan schema; adds template/reference invariants. */
@Component
public final class PlanValidator {
    private final JsonMapper mapper = JsonMapper.builder()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .disable(JsonReadFeature.ALLOW_JAVA_COMMENTS).build();
    private final JsonNode schema;
    private static final Map<String, String> ROUTES = Map.of("/", "src/pages/HomePage.vue",
            "/tasks", "src/pages/TasksPage.vue", "/catalog", "src/pages/CatalogPage.vue");

    public PlanValidator() {
        try (var stream = new ClassPathResource("model/plan/plan.schema.json").getInputStream()) {
            schema = mapper.readTree(stream);
            verifySchema(schema);
        } catch (IOException exception) { throw new IllegalStateException("Plan schema unavailable", exception); }
    }

    public String schemaJson() { return schema.toString(); }

    private static void verifySchema(JsonNode rule) {
        Set<String> supported = Set.of("$schema", "$id", "title", "description", "type", "const", "enum",
                "additionalProperties", "required", "properties", "minItems", "maxItems", "items",
                "minLength", "maxLength", "pattern");
        for (String keyword : rule.propertyNames())
            if (!supported.contains(keyword)) throw new IllegalStateException("Unsupported plan schema keyword: " + keyword);
        String type = rule.path("type").asText();
        if (!Set.of("object", "array", "string", "integer", "boolean").contains(type))
            throw new IllegalStateException("Unsupported plan schema type");
        if (type.equals("object")) {
            if (!rule.has("additionalProperties") || rule.get("additionalProperties").booleanValue())
                throw new IllegalStateException("Plan objects must be closed");
            for (var property : rule.get("properties")) verifySchema(property);
        } else if (type.equals("array") && rule.path("maxItems").asInt(-1) != 0) {
            if (!rule.has("items")) throw new IllegalStateException("Plan arrays require items");
            verifySchema(rule.get("items"));
        }
    }

    public JsonNode validate(String json, String expectedDataMode) {
        if (json == null || json.length() > 64 * 1024) throw new ModelFailure("PLAN_INVALID");
        JsonNode plan;
        try {
            try (var parser = mapper.createParser(json)) {
                plan = mapper.readTree(parser);
                if (parser.nextToken() != null) throw new ModelFailure("PLAN_INVALID");
            }
        } catch (ModelFailure failure) { throw failure; }
        catch (RuntimeException exception) { throw new ModelFailure("PLAN_INVALID"); }
        if (plan != null && plan.isObject() && plan.has("unsupportedRequest"))
            throw new ModelFailure("PLAN_UNSUPPORTED_REQUEST");
        check(schema, plan);
        if (!plan.get("dataMode").asText().equals(expectedDataMode)) throw new ModelFailure("PLAN_DATA_MODE");
        Set<String> files = new HashSet<>();
        Set<String> paths = new HashSet<>();
        for (var file : plan.get("files")) {
            String path = file.get("path").asText();
            if (!paths.add(path.toLowerCase(Locale.ROOT))) throw new ModelFailure("PLAN_INVALID");
            files.add(path);
        }
        Set<String> routes = new HashSet<>();
        Set<String> usedVue = new HashSet<>();
        for (var page : plan.get("pages")) {
            String route = page.get("route").asText();
            String file = page.get("file").asText();
            if (!routes.add(route) || !ROUTES.get(route).equals(file) || !files.contains(file))
                throw new ModelFailure("PLAN_INVALID");
            usedVue.add(file);
        }
        Set<String> names = new HashSet<>();
        for (var component : plan.get("components")) {
            String name = component.get("name").asText();
            String file = component.get("file").asText();
            if (!names.add(name.toLowerCase(Locale.ROOT)) || !file.equals("src/components/" + name + ".vue")
                    || !files.contains(file)) throw new ModelFailure("PLAN_INVALID");
            usedVue.add(file);
        }
        if (files.stream().anyMatch(path -> path.endsWith(".vue") && !usedVue.contains(path)))
            throw new ModelFailure("PLAN_INVALID");
        Set<String> ids = new HashSet<>();
        Set<String> covered = new HashSet<>();
        for (var acceptance : plan.get("acceptance")) {
            String route = acceptance.get("route").asText();
            if (!routes.contains(route) || !ids.add(acceptance.get("id").asText()))
                throw new ModelFailure("PLAN_INVALID");
            covered.add(route);
        }
        if (!covered.containsAll(routes)) throw new ModelFailure("PLAN_INVALID");
        return plan;
    }

    private static void check(JsonNode rule, JsonNode value) {
        if (value == null) throw new ModelFailure("PLAN_INVALID");
        boolean type = switch (rule.path("type").asText()) {
            case "object" -> value.isObject();
            case "array" -> value.isArray();
            case "string" -> value.isString();
            case "integer" -> value.isNumber() && value.decimalValue().stripTrailingZeros().scale() <= 0;
            case "boolean" -> value.isBoolean();
            default -> false;
        };
        if (!type || (rule.has("const") && !equivalent(rule.get("const"), value)))
            throw new ModelFailure("PLAN_INVALID");
        if (rule.has("enum")) {
            boolean present = false;
            for (var option : rule.get("enum")) present |= equivalent(option, value);
            if (!present) throw new ModelFailure("PLAN_INVALID");
        }
        if (value.isObject()) {
            for (var required : rule.path("required"))
                if (!value.has(required.asText())) throw new ModelFailure("PLAN_INVALID");
            for (String name : value.propertyNames()) {
                var property = rule.path("properties").get(name);
                if (property == null) throw new ModelFailure("PLAN_INVALID");
                check(property, value.get(name));
            }
        } else if (value.isArray()) {
            if (value.size() < rule.path("minItems").asInt(0)
                    || value.size() > rule.path("maxItems").asInt(Integer.MAX_VALUE))
                throw new ModelFailure("PLAN_INVALID");
            for (var item : value) check(rule.get("items"), item);
        } else if (value.isString()) {
            String text = value.asText();
            int size = text.codePointCount(0, text.length());
            if (text.isBlank() || size < rule.path("minLength").asInt(0)
                    || size > rule.path("maxLength").asInt(Integer.MAX_VALUE)
                    || (rule.has("pattern") && !text.matches(rule.get("pattern").asText())))
                throw new ModelFailure("PLAN_INVALID");
        }
    }

    private static boolean equivalent(JsonNode left, JsonNode right) {
        return left.isNumber() && right.isNumber()
                ? left.decimalValue().compareTo(right.decimalValue()) == 0 : left.equals(right);
    }
}
