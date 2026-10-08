package dev.codeless.api.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Opt-in application GET timing; no identifiers, queries, headers, session or body values in logs. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE+11)
@ConditionalOnProperty(name="codeless.diagnostics.application.enabled",havingValue="true")
public final class ApplicationTimingFilter extends OncePerRequestFilter {
    private static final Pattern PATH=Pattern.compile("/api/v0/applications/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"GET".equals(request.getMethod()) || !PATH.matcher(request.getRequestURI()).matches();
    }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)
            throws IOException,ServletException {
        var logger=LoggerFactory.getLogger(ApplicationTimingFilter.class);String id=UUID.randomUUID().toString();long start=System.nanoTime();
        response.setHeader("X-Codeless-Diagnostic-Id",id);
        logger.info("application.lifecycle phase=started id={} at={}",id,Instant.now());
        boolean returned=false;
        try {chain.doFilter(request,response);returned=true;}
        finally {logger.info("application.lifecycle phase=finished id={} at={} elapsedMs={} status={} returned={}",id,Instant.now(),
                Math.max(0,(System.nanoTime()-start)/1_000_000),returned?Integer.toString(response.getStatus()):"UNKNOWN",returned);}
    }
}
