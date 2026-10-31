package dev.codeless.api.cover;

import dev.codeless.api.agent.AgentJournal;
import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.deploy.PublicationService;
import dev.codeless.api.versions.SnapshotStore;
import java.net.URI;
import java.nio.file.*;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;

public final class CoverService {
    private record Version(UUID task,UUID build,String source,String status) {}
    private final PublicationService publications;private final JdbcClient jdbc;private final SnapshotStore snapshots;
    private final Path journalRoot;private final URI origin;private final CoverStore store;
    public CoverService(PublicationService publications,JdbcClient jdbc,SnapshotStore snapshots,Path journalRoot,String origin,CoverStore store) {
        this.publications=publications;this.jdbc=jdbc;this.snapshots=snapshots;this.journalRoot=journalRoot.toAbsolutePath().normalize();this.store=store;
        this.origin=URI.create(origin);
        if(!"https".equals(this.origin.getScheme()) || this.origin.getHost()==null || !"/".equals(this.origin.getPath()) && !this.origin.getPath().isEmpty()
                || this.origin.getUserInfo()!=null || this.origin.getQuery()!=null || this.origin.getFragment()!=null) throw new IllegalArgumentException("COVER_ORIGIN_INVALID");
    }
    public CoverGateway.Binding binding(UUID owner,UUID id) {
        // Owner check happens first, including for administrators. No file or worker is touched by a foreign read.
        var deployment=publications.deployment(owner,id);var p=deployment.publication();
        if(!"PUBLISHED".equals(p.status()) || !"SUCCEEDED".equals(deployment.phase())) throw CoverStore.missing();
        try {
            var version=jdbc.sql("SELECT source_task_id,build_id,source_digest,status FROM application_versions WHERE id=? AND application_id=?")
                    .params(p.versionId(),p.applicationId()).query((rs,n)->new Version(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getString(3),rs.getString(4))).single();
            if(version.task()==null || version.build()==null || !"VERIFIED".equals(version.status()) || !version.source().equals(deployment.sourceDigest())) throw CoverStore.unavailable();
            var outcome=snapshots.outcome(p.versionId(),version.source(),"VERIFIED");var report=outcome.report();
            if(!deployment.artifactDigest().equals(outcome.artifactDigest()) || !deployment.reportDigest().equals(outcome.reportDigest())) throw CoverStore.unavailable();
            var verification=UUID.fromString(report.path("verificationId").asText());
            CoverStore.safe(journalRoot.resolve(version.task().toString()),true);
            var entry=CoverEntryProof.resolve(version.task(),p.versionId(),version.build(),version.source(),outcome.artifactDigest(),verification,new AgentJournal(journalRoot).read(version.task()));
            var expected=new URI("https",null,"d"+id.toString().replace("-","")+"."+origin.getHost(),origin.getPort(),"/",null,null).toString();
            if(!expected.equals(p.url())) throw CoverStore.unavailable();
            return new CoverGateway.Binding(id,p.applicationId(),p.versionId(),p.status(),version.source(),outcome.artifactDigest(),p.url(),entry);
        } catch(AuthFailure failure) {throw failure;}
        catch(Exception failure) {throw new AuthFailure(HttpStatus.SERVICE_UNAVAILABLE,"COVER_ENTRY_UNAVAILABLE");}
    }
    public CoverStore.View metadata(UUID owner,UUID id) {return store.metadata(binding(owner,id));}
    public byte[] image(UUID owner,UUID id,String digest) {return store.image(binding(owner,id),digest);}
}
