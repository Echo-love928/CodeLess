package dev.codeless.api.cover;

import dev.codeless.api.auth.*;
import dev.codeless.api.error.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="codeless.cover.enabled",havingValue="true")
@RequestMapping("/api/v0/publications/{publicationId}/cover")
public final class CoverController {
    private final OwnershipGuard ownership;private final CoverService service;
    public CoverController(OwnershipGuard ownership,CoverService service) {this.ownership=ownership;this.service=service;}
    private static UUID id(String value) {
        try {var id=UUID.fromString(value);if(!id.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();return id;}
        catch(Exception invalid) {throw new AuthFailure(HttpStatus.BAD_REQUEST,"INVALID_REQUEST");}
    }
    private static <T> ResponseEntity<T> response(HttpStatus status,T body) {
        return ResponseEntity.status(status).header("Cache-Control","no-store").header("X-Content-Type-Options","nosniff").body(body);
    }
    @GetMapping public ResponseEntity<CoverStore.View> get(@PathVariable String publicationId,HttpServletRequest request) {
        var owner=ownership.userId(request);return response(HttpStatus.OK,service.metadata(owner,id(publicationId)));
    }
    @GetMapping("/image") public ResponseEntity<byte[]> image(@PathVariable String publicationId,
            @RequestParam(required=false) String digest,HttpServletRequest request) {
        var owner=ownership.userId(request);var bytes=service.image(owner,id(publicationId),digest);
        return ResponseEntity.ok().header("Cache-Control","no-store").header("X-Content-Type-Options","nosniff")
                .contentType(MediaType.IMAGE_PNG).contentLength(bytes.length).body(bytes);
    }
    @ExceptionHandler(AuthFailure.class) public ResponseEntity<ApiError> failure(AuthFailure f,HttpServletRequest request) {
        return response(f.status(),new ApiError(f.code(),"Cover unavailable",Instant.now(),request.getRequestURI(),UUID.randomUUID().toString(),Map.of()));
    }
}
