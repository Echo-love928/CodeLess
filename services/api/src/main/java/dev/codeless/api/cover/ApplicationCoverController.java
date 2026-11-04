package dev.codeless.api.cover;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.auth.OwnershipGuard;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ApplicationCoverController {
    private final ApplicationCoverService covers;
    private final OwnershipGuard ownership;
    public ApplicationCoverController(ApplicationCoverService covers, OwnershipGuard ownership) {
        this.covers = covers; this.ownership = ownership;
    }
    @GetMapping("/api/v0/applications/{applicationId}/versions/{versionId}/cover")
    public ResponseEntity<byte[]> image(@PathVariable String applicationId, @PathVariable String versionId,
                                        HttpServletRequest request) {
        var owner = ownership.userId(request);
        byte[] image = covers.image(owner, id(applicationId), id(versionId));
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG)
                .header("Cache-Control", "private, no-store").header("Vary", "Cookie")
                .header("X-Content-Type-Options", "nosniff").body(image);
    }
    private static UUID id(String value) {
        try { return UUID.fromString(value); }
        catch (IllegalArgumentException invalid) { throw new AuthFailure(HttpStatus.BAD_REQUEST, "INVALID_REQUEST"); }
    }
}
