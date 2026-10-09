package dev.codeless.api.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Opt-in timing of the one observed upstream failure; never logs queries, headers, sessions or tokens. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE+10)
@ConditionalOnProperty(name="codeless.diagnostics.csrf.enabled",havingValue="true")
public final class CsrfTimingFilter extends OncePerRequestFilter {
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"GET".equals(request.getMethod()) || !"/api/v0/auth/csrf".equals(request.getRequestURI());
    }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)
            throws IOException,ServletException {
        var logger=LoggerFactory.getLogger(CsrfTimingFilter.class);String id=UUID.randomUUID().toString();long start=System.nanoTime();
        response.setHeader("X-Codeless-Diagnostic-Id",id);
        logger.info("csrf.lifecycle phase=started id={} at={}",id,Instant.now());
        boolean returned=false;
        try {chain.doFilter(request,response);returned=true;}
        finally {logger.info("csrf.lifecycle phase=finished id={} at={} elapsedMs={} status={} returned={}",id,Instant.now(),
                Math.max(0,(System.nanoTime()-start)/1_000_000),returned?Integer.toString(response.getStatus()):"UNKNOWN",returned);}
    }
}
