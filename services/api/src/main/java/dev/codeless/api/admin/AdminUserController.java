package dev.codeless.api.admin;

import dev.codeless.api.auth.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/v0/admin/users")
public class AdminUserController {
    private final OwnershipGuard ownership;private final AdminUserService users;
    public AdminUserController(OwnershipGuard ownership,AdminUserService users) {this.ownership=ownership;this.users=users;}
    private static void fields(JsonNode b,Set<String> names) {
        if(b==null || !b.isObject() || !b.propertyNames().equals(names)) invalid();
    }
    private static void invalid() {throw new AuthFailure(HttpStatus.BAD_REQUEST,"INVALID_REQUEST");}
    private static String text(JsonNode b,String name) {if(!b.path(name).isTextual()) invalid();return b.path(name).asText();}
    private static boolean flag(JsonNode b,String name) {if(!b.path(name).isBoolean()) invalid();return b.path(name).asBoolean();}
    @PostMapping
    public ResponseEntity<Map<String,UUID>> create(@RequestBody JsonNode body,HttpServletRequest request) {
        ownership.requireAdmin(request);fields(body,Set.of("email","displayName","password","role","isTest"));
        var id=users.create(ownership.userId(request),text(body,"email"),text(body,"displayName"),text(body,"password"),text(body,"role"),flag(body,"isTest"));
        return ResponseEntity.status(HttpStatus.CREATED).header("Cache-Control","no-store").body(Map.of("id",id));
    }
    @PatchMapping("/{id}")
    public ResponseEntity<Void> update(@PathVariable UUID id,@RequestBody JsonNode body,HttpServletRequest request) {
        ownership.requireAdmin(request);fields(body,Set.of("status","isTest"));
        users.update(ownership.userId(request),id,text(body,"status"),flag(body,"isTest"));return ResponseEntity.noContent().header("Cache-Control","no-store").build();
    }
    @PostMapping("/{id}/cleanup")
    public ResponseEntity<Void> cleanup(@PathVariable UUID id,HttpServletRequest request) {
        ownership.requireAdmin(request);users.cleanupTestUser(ownership.userId(request),id);
        return ResponseEntity.noContent().header("Cache-Control","no-store").build();
    }
    @PostMapping("/{id}/password")
    public ResponseEntity<Void> reset(@PathVariable UUID id,@RequestBody JsonNode body,HttpServletRequest request) {
        ownership.requireAdmin(request);fields(body,Set.of("password"));users.reset(ownership.userId(request),id,text(body,"password"));
        return ResponseEntity.noContent().header("Cache-Control","no-store").build();
    }
}
