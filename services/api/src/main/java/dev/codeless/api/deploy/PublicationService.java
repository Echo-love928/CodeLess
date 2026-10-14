package dev.codeless.api.deploy;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.data.ArtifactRepository;
import dev.codeless.api.data.PlatformModels.Publication;
import dev.codeless.api.versions.*;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.*;

@Service
public class PublicationService {
    public record View(UUID id,UUID applicationId,UUID versionId,UUID requestedBy,String status,String url,
                       OffsetDateTime createdAt,OffsetDateTime publishedAt) {}
    public record Deployment(View publication,String phase,String sourceDigest,String artifactDigest,String reportDigest,
                             List<DeploymentRecords.Event> history,String failureCode,View latestSuccessful) {}
    public record Page(List<View> items,View latestSuccessful) {}
    private record Version(String status,String source,UUID build) {}
    private final JdbcClient jdbc;
    private final ArtifactRepository artifacts;
    private final SnapshotStore snapshots;
    private final DeploymentRecords records;
    private final DeploymentGateway hosting;
    private final TransactionTemplate tx;
    public PublicationService(JdbcClient jdbc,ArtifactRepository artifacts,SnapshotStore snapshots,DeploymentRecords records,
                              DeploymentGateway hosting,PlatformTransactionManager manager) {
        this.jdbc=jdbc;this.artifacts=artifacts;this.snapshots=snapshots;this.records=records;this.hosting=hosting;tx=new TransactionTemplate(manager);
    }
    private static AuthFailure conflict(String code) {return new AuthFailure(HttpStatus.CONFLICT,code);}
    private static View view(Publication p) {return new View(p.id(),p.applicationId(),p.versionId(),p.requestedBy(),p.status().name(),p.url(),p.createdAt(),p.publishedAt());}
    private void owned(UUID owner,UUID app) {
        if(!jdbc.sql("SELECT EXISTS(SELECT 1 FROM applications WHERE id=? AND owner_id=?)").params(app,owner).query(Boolean.class).single())
            throw new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND");
    }
    private Publication ownedPublication(UUID owner,UUID id) {
        var p=artifacts.findPublication(id).orElseThrow(()->new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND"));
        owned(owner,p.applicationId());return p;
    }
    private static UUID publicationId(UUID owner,String key) {
        try {
            byte[] hash=MessageDigest.getInstance("SHA-256").digest(("codeless-publication-v1\n"+owner+"\n"+key).getBytes(StandardCharsets.UTF_8));
            hash[6]=(byte)((hash[6]&0x0f)|0x80);hash[8]=(byte)((hash[8]&0x3f)|0x80);
            var bytes=ByteBuffer.wrap(hash);return new UUID(bytes.getLong(),bytes.getLong());
        } catch(Exception failure) {throw new IllegalStateException(failure);}
    }
    public View request(UUID owner,UUID app,UUID version,String digest,String key) {
        UUID id=publicationId(owner,key);
        return tx.execute(status->{
            // Global to this owner/key, including requests for different applications. No in-memory-only deduplication.
            jdbc.sql("SELECT pg_advisory_xact_lock(?)").param(id.getMostSignificantBits()^id.getLeastSignificantBits()).query((rs,n)->true).single();
            var application=jdbc.sql("SELECT status FROM applications WHERE id=? AND owner_id=? FOR UPDATE")
                    .params(app,owner).query(String.class).optional().orElseThrow(()->new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND"));
            var existing=artifacts.findPublication(id);
            if(existing.isPresent()) {
                var p=existing.get();var binding=records.binding(id);
                if(!p.applicationId().equals(app) || !p.versionId().equals(version) || !p.requestedBy().equals(owner)
                        || !binding.artifactDigest().equals(digest)) throw conflict("PUBLICATION_IDEMPOTENCY_CONFLICT");
                bindingMatches(p,binding);return view(p);
            }
            if(!"ACTIVE".equals(application)) throw conflict("PUBLICATION_APPLICATION_UNAVAILABLE");
            var binding=verified(id,owner,app,version,digest);
            records.create(binding);
            return view(artifacts.requestPublication(id,app,version,owner));
        });
    }
    private DeploymentRecords.Binding verified(UUID id,UUID owner,UUID app,UUID version,String digest) {
        var v=jdbc.sql("SELECT status,source_digest,build_id FROM application_versions WHERE id=? AND application_id=?")
                .params(version,app).query((rs,n)->new Version(rs.getString(1),rs.getString(2),rs.getObject(3,UUID.class))).optional()
                .orElseThrow(()->new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND"));
        if(!"VERIFIED".equals(v.status())) throw conflict("PUBLICATION_VERSION_UNAVAILABLE");
        String actual=jdbc.sql("SELECT artifact_digest FROM builds WHERE id=? AND version_id=? AND status='SUCCEEDED' AND exit_code=0 AND completed_at IS NOT NULL")
                .params(v.build(),version).query(String.class).optional().orElseThrow(()->conflict("PUBLICATION_VERSION_UNAVAILABLE"));
        if(!actual.equals(digest)) throw conflict("PUBLICATION_ARTIFACT_MISMATCH");
        var o=snapshots.outcome(version,v.source(),"VERIFIED");var report=o.report();
        if(!actual.equals(o.artifactDigest()) || !v.build().toString().equals(report.path("buildId").asText())
                || !"SUCCEEDED".equals(report.path("buildStatus").asText()) || !report.path("exitCode").isIntegralNumber()
                || report.path("exitCode").asInt()!=0 || !"PASSED".equals(report.path("verificationStatus").asText()))
            throw new SnapshotFailure("SNAPSHOT_REPORT_INVALID");
        return new DeploymentRecords.Binding(id,app,version,owner,v.build(),v.source(),actual,o.reportDigest());
    }
    private static void bindingMatches(Publication p,DeploymentRecords.Binding b) {
        if(!p.id().equals(b.id()) || !p.applicationId().equals(b.applicationId()) || !p.versionId().equals(b.versionId()) || !p.requestedBy().equals(b.ownerId()))
            throw new AuthFailure(HttpStatus.SERVICE_UNAVAILABLE,"DEPLOYMENT_RECORD_UNAVAILABLE");
    }
    public View get(UUID owner,UUID id) {return view(ownedPublication(owner,id));}
    private View latest(UUID app) {
        return jdbc.sql("SELECT id FROM publications WHERE application_id=? AND status='PUBLISHED' ORDER BY published_at DESC,id DESC LIMIT 1")
                .param(app).query(UUID.class).optional().map(id->view(artifacts.findPublication(id).orElseThrow())).orElse(null);
    }
    public Page list(UUID owner,UUID app) {
        owned(owner,app);
        var items=jdbc.sql("SELECT id FROM publications WHERE application_id=? ORDER BY created_at DESC,id DESC LIMIT 100")
                .param(app).query(UUID.class).list().stream().map(id->view(artifacts.findPublication(id).orElseThrow())).toList();
        return new Page(items,latest(app));
    }
    public Deployment deployment(UUID owner,UUID id) {
        var p=ownedPublication(owner,id);var b=records.binding(id);bindingMatches(p,b);var events=records.events(id);
        String phase=events.isEmpty()?"UNKNOWN":events.getLast().phase();
        // SQL and volume are separate resources; a terminal ledger entry without SQL commit is never success.
        if(!switch(p.status()) {case PUBLISHED -> "SUCCEEDED".equals(phase);case FAILED -> "FAILED".equals(phase);
            case REQUESTED -> Set.of("PREPARING","PUBLISHING","PROBING").contains(phase);}) phase="UNKNOWN";
        return new Deployment(view(p),phase,b.sourceDigest(),b.artifactDigest(),b.reportDigest(),events,
                "FAILED".equals(phase)?events.getLast().failureCode():null,latest(p.applicationId()));
    }
    /** Internal worker entry. No HTTP endpoint and absent from the model tool registry. */
    public void process(UUID id) {
        tx.executeWithoutResult(status->{
            var locked=jdbc.sql("SELECT id FROM publications WHERE id=? AND status='REQUESTED' FOR UPDATE SKIP LOCKED")
                    .param(id).query(UUID.class).optional();
            if(locked.isEmpty()) return;
            var p=artifacts.findPublication(id).orElseThrow();
            try {
                var b=records.binding(id);bindingMatches(p,b);
                var events=records.events(id);
                if(events.size()!=1 || !"PREPARING".equals(events.getFirst().phase())) throw new IllegalStateException("DEPLOYMENT_INTERRUPTED");
                var checked=verified(id,p.requestedBy(),p.applicationId(),p.versionId(),b.artifactDigest());
                if(!checked.equals(b)) throw new IllegalStateException("DEPLOYMENT_BINDING_MISMATCH");
                var outcome=snapshots.outcome(p.versionId(),b.sourceDigest(),"VERIFIED");
                var bytes=snapshots.artifactBytes(p.versionId(),b.sourceDigest());
                var assets=new ArrayList<DeploymentGateway.Asset>();
                for(var entry:outcome.artifact().files()) assets.add(new DeploymentGateway.Asset(entry.path(),entry.digest(),bytes.get(entry.path())));
                var payload=new DeploymentGateway.Payload(id,p.versionId(),b.artifactDigest(),assets);
                Instant deadline=Instant.now().plusSeconds(30);
                records.append(id,"PUBLISHING",null);
                String url=hosting.publish(payload,deadline);
                if(!publicUrl(url)) throw new IllegalStateException("HOSTING_URL_INVALID");
                if(Instant.now().isAfter(deadline)) throw new IllegalStateException("DEPLOYMENT_TIMEOUT");
                records.append(id,"PROBING",null);
                var probe=hosting.probe(payload,url,deadline);
                if(Instant.now().isAfter(deadline)) throw new IllegalStateException("DEPLOYMENT_TIMEOUT");
                if(probe==null || !Boolean.TRUE.equals(probe.accessible()) || !p.versionId().equals(probe.versionId()) || !b.artifactDigest().equals(probe.artifactDigest()))
                    throw new IllegalStateException("DEPLOYMENT_PROBE_FAILED");
                jdbc.sql("UPDATE publications SET status='PUBLISHED',url=?,published_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1 WHERE id=? AND status='REQUESTED'")
                        .params(url,id).update();
                terminal(id,"SUCCEEDED",null);
            } catch(RuntimeException failure) {
                String code=Set.of("HOSTING_UNAVAILABLE","HOSTING_URL_INVALID","DEPLOYMENT_TIMEOUT","DEPLOYMENT_INTERRUPTED","DEPLOYMENT_BINDING_MISMATCH","DEPLOYMENT_PROBE_FAILED")
                        .contains(Objects.toString(failure.getMessage(),"")) ? failure.getMessage() : failure instanceof SnapshotFailure ? "DEPLOYMENT_SNAPSHOT_INVALID" : "DEPLOYMENT_FAILED";
                jdbc.sql("UPDATE publications SET status='FAILED',url=NULL,published_at=NULL,updated_at=clock_timestamp(),row_version=row_version+1 WHERE id=? AND status='REQUESTED'").param(id).update();
                terminal(id,"FAILED",code);
            }
        });
    }
    private void terminal(UUID id,String phase,String code) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {records.append(id,phase,code);}
        });
    }
    private static boolean publicUrl(String url) {
        try {
            var uri=URI.create(url);String host=uri.getHost();
            // No user-controlled endpoint is accepted. Adapter must additionally pin/validate DNS and reject redirects.
            return "https".equals(uri.getScheme()) && host!=null && host.matches("[A-Za-z0-9.-]+") && host.contains(".")
                    && !host.matches("[0-9.]+") && !host.toLowerCase(Locale.ROOT).endsWith(".localhost")
                    && !host.toLowerCase(Locale.ROOT).endsWith(".local") && uri.getUserInfo()==null && uri.getFragment()==null;
        } catch(Exception invalid) {return false;}
    }
}
