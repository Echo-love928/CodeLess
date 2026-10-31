package dev.codeless.api.cover;

import dev.codeless.api.auth.AuthFailure;
import java.nio.channels.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Dedicated bounded worker; never occupies the generation lease scheduler. */
public final class CoverCoordinator implements AutoCloseable {
    private record Candidate(UUID id,UUID owner,OffsetDateTime at) {}
    private record Cursor(OffsetDateTime at,UUID id) {}
    private final Path root;private final JdbcClient jdbc;private final CoverService service;private final CoverStore store;private final CoverGateway gateway;
    private final ScheduledExecutorService executor=Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().name("publication-cover").factory());
    private FileChannel channel;private FileLock lock;private Cursor cursor=new Cursor(OffsetDateTime.parse("1970-01-01T00:00:00Z"),new UUID(0,0));
    private volatile boolean stopped,active,quarantined;
    public CoverCoordinator(Path root,JdbcClient jdbc,CoverService service,CoverStore store,CoverGateway gateway) {
        this.root=root;this.jdbc=jdbc;this.service=service;this.store=store;this.gateway=gateway;
    }
    public void start() throws Exception {
        CoverStore.safe(root,true);
        channel=FileChannel.open(root.resolve("coordinator.lock"),StandardOpenOption.CREATE,StandardOpenOption.WRITE,LinkOption.NOFOLLOW_LINKS);
        try {lock=channel.tryLock();if(lock==null) throw new IllegalStateException("COVER_COORDINATOR_ALREADY_OWNED");}
        catch(Exception e) {channel.close();executor.shutdownNow();throw e;}
        try {
            quarantined=Files.exists(root.resolve("quarantine.json"),LinkOption.NOFOLLOW_LINKS);
            if(Files.exists(root.resolve("inflight.json"),LinkOption.NOFOLLOW_LINKS)) quarantine("COVER_PROCESS_INTERRUPTED");
            if(Files.exists(root.resolve("cursor.json"),LinkOption.NOFOLLOW_LINKS)) {
                var n=CoverStore.JSON.readTree(CoverStore.read(root.resolve("cursor.json"),2048));
                if(!n.isObject() || !n.propertyNames().equals(Set.of("at","id"))) throw new IllegalStateException();
                cursor=new Cursor(OffsetDateTime.parse(n.path("at").asText()),UUID.fromString(n.path("id").asText()));
            }
        } catch(Exception corrupt) {quarantine("COVER_CURSOR_INVALID");}
        executor.scheduleWithFixedDelay(this::tick,2,2,TimeUnit.SECONDS);
    }
    private synchronized void write(String name,Object value) throws Exception {
        CoverStore.safe(root,true);var tmp=root.resolve(UUID.randomUUID()+".tmp");
        try(var file=FileChannel.open(tmp,StandardOpenOption.CREATE_NEW,StandardOpenOption.WRITE,LinkOption.NOFOLLOW_LINKS)) {
            var bytes=java.nio.ByteBuffer.wrap(CoverStore.JSON.writeValueAsBytes(value));while(bytes.hasRemaining()) file.write(bytes);file.force(true);
        }
        Files.move(tmp,root.resolve(name),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
    }
    private void quarantine(String code) {
        quarantined=true;
        try {write("quarantine.json",Map.of("code",code,"at",Instant.now().toString(),"manualRecoveryRequired",true));}
        catch(Exception failure) {org.slf4j.LoggerFactory.getLogger(getClass()).error("COVER_QUARANTINE_PERSIST_FAILED");}
    }
    void tick() {
        if(stopped || quarantined) return;
        try {
            var batch=jdbc.sql("SELECT p.id,a.owner_id,p.published_at FROM publications p JOIN applications a ON a.id=p.application_id WHERE p.status='PUBLISHED' AND (p.published_at,p.id)>(?,?) ORDER BY p.published_at,p.id LIMIT 3")
                    .params(cursor.at(),cursor.id()).query((rs,n)->new Candidate(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,OffsetDateTime.class))).list();
            for(var p:batch) {
                if(stopped || quarantined) return;
                CoverGateway.Binding binding;
                try {binding=service.binding(p.owner(),p.id());}
                catch(AuthFailure unavailable) {
                    // SQL publication and the terminal file ledger are separate resources. A missing/unavailable
                    // binding is not proof that this publication may be permanently skipped by the durable cursor.
                    org.slf4j.LoggerFactory.getLogger(getClass()).warn("COVER_ENTRY_UNAVAILABLE publication={}",p.id());
                    quarantine("COVER_ENTRY_UNAVAILABLE");return;
                }
                active=true;
                try {
                    // Written before process creation: a JVM crash cannot silently restart an unknown capture.
                    write("inflight.json",Map.of("publicationId",p.id().toString(),"at",Instant.now().toString()));
                    var result=gateway.capture(binding,Instant.now().plusSeconds(45));
                    var record=store.metadata(binding);
                    // Normalize the typed Long byte count through the wire JSON parser too.
                    // IntNode(36233) and LongNode(36233) differ in Jackson tree equality.
                    var expected=CoverStore.JSON.readTree(CoverStore.JSON.writeValueAsBytes(record));
                    if(!Set.of("SUCCEEDED","FAILED").contains(record.status()) || !expected.equals(result)
                            || "CLEANUP_FAILED".equals(record.failureCode())) throw new IllegalStateException("COVER_RESULT_UNCONFIRMED");
                    Files.delete(root.resolve("inflight.json"));
                } finally {active=false;}
                advance(p);
            }
        } catch(Exception failure) {quarantine("COVER_PROCESS_UNCONFIRMED");}
    }
    private void advance(Candidate p) throws Exception {
        write("cursor.json",Map.of("at",p.at().toString(),"id",p.id().toString()));cursor=new Cursor(p.at(),p.id());
    }
    @Override public void close() throws Exception {
        stopped=true;if(active) quarantine("COVER_SHUTDOWN_UNCONFIRMED");executor.shutdownNow();
        if(!executor.awaitTermination(5,TimeUnit.SECONDS)) {quarantine("COVER_SHUTDOWN_UNCONFIRMED");return;}
        if(lock!=null && lock.isValid()) lock.release();if(channel!=null) channel.close();
    }
}
