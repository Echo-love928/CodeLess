package dev.codeless.api.preview;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;

/** Test-private task/auth GET timing: no task ID, query, headers, cookie or body in the log. */
@TestConfiguration
class PlatformHttpDiagnosticsConfiguration {
    @Bean FilterRegistrationBean<OncePerRequestFilter> taskHttpTiming() {
        var path=Pattern.compile("/api/v0/tasks/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
        var taskLogger=LoggerFactory.getLogger(PlatformHttpDiagnosticsConfiguration.class);
        var filter=new OncePerRequestFilter() {
            @Override protected boolean shouldNotFilter(HttpServletRequest request) {
                return !"GET".equals(request.getMethod())||(!path.matcher(request.getRequestURI()).matches()&&!request.getRequestURI().equals("/api/v0/auth/me"));
            }
            @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)
                    throws ServletException,IOException {
                String id=UUID.randomUUID().toString();long start=System.nanoTime();boolean returned=false;
                String route=request.getRequestURI().equals("/api/v0/auth/me")?"auth":"task";
                response.setHeader("X-Codeless-Diagnostic-Id",id);taskLogger.info("{}.lifecycle phase=started id={} at={}",route,id,Instant.now());
                try {chain.doFilter(request,response);returned=true;}
                finally {taskLogger.info("{}.lifecycle phase=finished id={} at={} elapsedMs={} status={} returned={}",route,id,Instant.now(),
                    Math.max(0,(System.nanoTime()-start)/1_000_000),returned?Integer.toString(response.getStatus()):"UNKNOWN",returned);}
            }
        };
        var registration=new FilterRegistrationBean<OncePerRequestFilter>(filter);registration.setOrder(Ordered.HIGHEST_PRECEDENCE+12);return registration;
    }
}
