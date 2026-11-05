package dev.codeless.api.system;

import java.util.Properties;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api")
public class HealthController {
    private final Properties build=new Properties();
    public HealthController() {
        try(var input=getClass().getClassLoader().getResourceAsStream("META-INF/build-info.properties")) {
            if(input!=null) build.load(input);
        } catch(java.io.IOException ignored) { /* Local development may have no packaged build-info. */ }
    }
    @GetMapping("/health")
    public HealthResponse health() {
        return new HealthResponse("UP","codeless-api",build.getProperty("build.commit","development"),build.getProperty("build.time","unknown"));
    }
    public record HealthResponse(String status,String service,String commit,String builtAt) {}
}
