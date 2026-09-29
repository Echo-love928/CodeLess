package dev.codeless.api.apps;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.auth.OwnershipGuard;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/v0")
public class ApplicationController {
    private final ApplicationService applications;
    private final OwnershipGuard ownership;

    public ApplicationController(ApplicationService applications, OwnershipGuard ownership) {
        this.applications = applications;
        this.ownership = ownership;
    }

    @PostMapping("/applications")
    public ResponseEntity<ApplicationService.ApplicationView> create(
            @RequestBody JsonNode body, HttpServletRequest request) {
        fields(body, Set.of("name", "description", "dataMode", "template"));
        String name = name(body);
        String description = optionalText(body, "description", 1000);
        String dataMode = requiredText(body, "dataMode");
        if (!Set.of("STATIC", "MOCK", "LOCAL_STORAGE").contains(dataMode)) invalid();
        String template = optionalText(body, "template", 8);
        if (template != null && !template.equals("VUE")) invalid();
        ApplicationService.ApplicationView created = applications.create(
                ownership.userId(request), name, description, dataMode);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/applications")
    public ApplicationService.PageView list(@RequestParam(name = "page", defaultValue = "0") String pageValue,
                                            @RequestParam(name = "size", defaultValue = "20") String sizeValue,
                                            HttpServletRequest request) {
        int page = positiveInt(pageValue);
        int size = positiveInt(sizeValue);
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) invalid();
        return applications.list(ownership.userId(request), page, size);
    }

    @GetMapping("/applications/{applicationId}")
    public ApplicationService.ApplicationView detail(@PathVariable String applicationId,
                                                      HttpServletRequest request) {
        return applications.find(ownership.userId(request), uuid(applicationId))
                .orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND"));
    }

    @PatchMapping("/applications/{applicationId}")
    public ApplicationService.ApplicationView rename(@PathVariable String applicationId,
                                                      @RequestBody JsonNode body,
                                                      HttpServletRequest request) {
        fields(body, Set.of("name"));
        return applications.rename(ownership.userId(request), uuid(applicationId), name(body));
    }

    @GetMapping("/versions/{versionId}")
    public ApplicationService.VersionView version(@PathVariable String versionId,
                                                   HttpServletRequest request) {
        return applications.version(ownership.userId(request), uuid(versionId))
                .orElseThrow(() -> new AuthFailure(HttpStatus.NOT_FOUND, "NOT_FOUND"));
    }

    private static void fields(JsonNode body, Set<String> allowed) {
        if (body == null || !body.isObject()) invalid();
        body.propertyNames().forEach(field -> {
            if (!allowed.contains(field)) invalid();
        });
    }

    private static String name(JsonNode body) {
        String value = requiredText(body, "name").strip();
        if (value.isEmpty() || value.codePointCount(0, value.length()) > 120) invalid();
        return value;
    }

    private static String requiredText(JsonNode body, String field) {
        JsonNode value = body.get(field);
        if (value == null || !value.isTextual()) invalid();
        return value.asText();
    }

    private static String optionalText(JsonNode body, String field, int max) {
        JsonNode value = body.get(field);
        if (value == null) return null;
        if (!value.isTextual() || value.asText().codePointCount(0, value.asText().length()) > max) invalid();
        return value.asText();
    }

    private static UUID uuid(String value) {
        try { return UUID.fromString(value); }
        catch (IllegalArgumentException exception) { throw new AuthFailure(HttpStatus.BAD_REQUEST, "INVALID_REQUEST"); }
    }

    private static int positiveInt(String value) {
        try { return Integer.parseInt(value); }
        catch (NumberFormatException exception) { throw new AuthFailure(HttpStatus.BAD_REQUEST, "INVALID_REQUEST"); }
    }

    private static void invalid() { throw new AuthFailure(HttpStatus.BAD_REQUEST, "INVALID_REQUEST"); }
}
