package dev.codeless.api.tools;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Closed internal tool definitions. Call context (task/lease/root) is never model supplied. */
@Component
public final class FileToolRegistry {
    public static final int MAX_FILES = 40, MAX_FILE_BYTES = 131072, MAX_TOTAL_BYTES = 524288, MAX_CALLS = 20;
    static final int MAX_INPUT_CHARS = 800000;
    private final JsonMapper mapper = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
    private final JsonNode registry;

    public FileToolRegistry() {
        try (var stream = new ClassPathResource("tools/registry.json").getInputStream()) {
            registry = mapper.readTree(stream);
            if (registry.path("limits").path("maxFiles").asInt() != MAX_FILES
                    || registry.path("limits").path("maxFileBytes").asInt() != MAX_FILE_BYTES
                    || registry.path("limits").path("maxTotalBytes").asInt() != MAX_TOTAL_BYTES
                    || registry.path("limits").path("maxCalls").asInt() != MAX_CALLS
                    || !registry.path("tools").valueStream().map(t -> t.path("name").asText()).toList()
                        .equals(List.of("files.list", "files.read", "files.create", "files.update", "files.delete")))
                throw new IllegalStateException("File tool registry mismatch");
        } catch (IOException exception) { throw new IllegalStateException("File tool registry unavailable", exception); }
    }

    public JsonNode definitions() { return registry.deepCopy(); }

    JsonNode validate(String name, String input) {
        JsonNode schema = null;
        for (var tool : registry.path("tools")) if (tool.path("name").asText().equals(name)) schema = tool.get("inputSchema");
        if (schema == null) throw new FileToolFailure("FILE_TOOL_UNKNOWN");
        if (input == null || input.length() > MAX_INPUT_CHARS) throw new FileToolFailure("FILE_INPUT_INVALID");
        JsonNode args;
        try (var parser = mapper.createParser(input)) {
            args = mapper.readTree(parser);
            if (parser.nextToken() != null) throw new FileToolFailure("FILE_INPUT_INVALID");
        } catch (RuntimeException exception) { throw new FileToolFailure("FILE_INPUT_INVALID"); }
        if (args == null || !args.isObject()) throw new FileToolFailure("FILE_INPUT_INVALID");
        for (var required : schema.path("required")) if (!args.has(required.asText())) throw new FileToolFailure("FILE_INPUT_INVALID");
        for (var field : args.propertyNames()) {
            var rule = schema.path("properties").get(field);
            var value = args.get(field);
            if (rule == null || !value.isString()) throw new FileToolFailure("FILE_INPUT_INVALID");
            String text = value.asText();
            int length = text.codePointCount(0, text.length());
            if (length < rule.path("minLength").asInt(0) || length > rule.path("maxLength").asInt(Integer.MAX_VALUE))
                throw new FileToolFailure("FILE_INPUT_INVALID");
            if (rule.has("pattern") && !text.matches(rule.get("pattern").asText()))
                throw new FileToolFailure(field.equals("path") ? "FILE_PATH_REJECTED" : "FILE_INPUT_INVALID");
        }
        if (args.has("path")) validatePath(args.get("path").asText());
        return args;
    }

    static void validatePath(String path) {
        if (path == null || path.length() > 240 || !path.matches(
                "src/(?:pages|components)/[A-Za-z][A-Za-z0-9_-]*\\.vue|src/data/[A-Za-z][A-Za-z0-9_-]*\\.ts"))
            throw new FileToolFailure("FILE_PATH_REJECTED");
        String basename = path.substring(path.lastIndexOf('/') + 1, path.lastIndexOf('.')).toUpperCase(Locale.ROOT);
        if (Set.of("CON", "PRN", "AUX", "NUL", "CONIN", "CONOUT").contains(basename)
                || basename.matches("(?:COM|LPT)[0-9]+")) throw new FileToolFailure("FILE_PATH_REJECTED");
    }
}
