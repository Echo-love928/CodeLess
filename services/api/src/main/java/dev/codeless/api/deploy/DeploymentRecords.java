package dev.codeless.api.deploy;

import dev.codeless.api.auth.AuthFailure;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.json.JsonMapper;

/** Private append-only phase ledger. PostgreSQL publication rows remain the authoritative terminal state. */
public final class DeploymentRecords {
    public record Binding(UUID id, UUID applicationId, UUID versionId, UUID ownerId, UUID buildId,
                          String sourceDigest, String artifactDigest, String reportDigest) {}
    public record Event(String phase, Instant at, String failureCode) {}
    private final Path root;
    private final JsonMapper json=JsonMapper.builder().build();
    public DeploymentRecords(Path root) {this.root=root.toAbsolutePath().normalize();}
    private static void check(Path path, boolean directory) throws Exception {
        for(Path current=path.toAbsolutePath().normalize();current!=null;current=current.getParent()) {
            boolean dir=!current.equals(path.toAbsolutePath().normalize()) || directory;
            if(Files.isSymbolicLink(current) || !current.equals(current.toRealPath()) ||
                    !(dir?Files.isDirectory(current,LinkOption.NOFOLLOW_LINKS):Files.isRegularFile(current,LinkOption.NOFOLLOW_LINKS)))
                throw new IllegalStateException();
        }
        if(!directory && path.getFileSystem().supportedFileAttributeViews().contains("unix")
                && ((Number)Files.getAttribute(path,"unix:nlink",LinkOption.NOFOLLOW_LINKS)).longValue()!=1) throw new IllegalStateException();
    }
    private void directory(Path path) throws Exception {
        Path current=path.getRoot();
        for(Path part:path) {current=current.resolve(part);if(!Files.exists(current,LinkOption.NOFOLLOW_LINKS)) Files.createDirectory(current);check(current,true);}
    }
    private <T> T read(Path path, Class<T> type) throws Exception {
        check(path,false);
        if(Files.size(path)>16384) throw new IllegalStateException();
        byte[] bytes;
        try(var input=Files.newInputStream(path,LinkOption.NOFOLLOW_LINKS)) {bytes=input.readNBytes(16385);}
        check(path,false);if(bytes.length>16384) throw new IllegalStateException();
        return json.readValue(bytes,type);
    }
    private void write(Path path,Object value) throws Exception {
        directory(path.getParent());
        if(Files.exists(path,LinkOption.NOFOLLOW_LINKS)) throw new IllegalStateException();
        Path pending=Files.createTempFile(path.getParent(),".pending-",".json");
        check(pending,false);
        try(var channel=FileChannel.open(pending,StandardOpenOption.WRITE,LinkOption.NOFOLLOW_LINKS)) {
            var buffer=ByteBuffer.wrap(json.writeValueAsBytes(value));while(buffer.hasRemaining()) channel.write(buffer);channel.force(true);
        }
        Files.move(pending,path,StandardCopyOption.ATOMIC_MOVE);
    }
    public synchronized void create(Binding binding) {
        try {
            Path path=root.resolve(binding.id().toString()).resolve("binding.json");
            // An SQL rollback may leave an orphan; only an exactly equal binding can ever be reused.
            if(Files.exists(path,LinkOption.NOFOLLOW_LINKS)) {
                if(!binding.equals(read(path,Binding.class))) throw unavailable();
                var history=events(binding.id());
                if(history.size()!=1 || !"PREPARING".equals(history.getFirst().phase())) throw unavailable();
                return;
            }
            write(path,binding);append(binding.id(),"PREPARING",null);
        } catch(AuthFailure failure) {throw failure;}
        catch(Exception failure) {throw unavailable();}
    }
    public Binding binding(UUID id) {
        try {return read(root.resolve(id.toString()).resolve("binding.json"),Binding.class);}
        catch(Exception failure) {throw unavailable();}
    }
    public List<Event> events(UUID id) {
        try {
            Path directory=root.resolve(id.toString());check(directory,true);
            var result=new ArrayList<Event>();
            try(var paths=Files.list(directory)) {
                var files=paths.filter(p->p.getFileName().toString().matches("[0-9]+\\.json")).sorted().toList();
                if(files.size()>4) throw new IllegalStateException();
                for(int i=0;i<files.size();i++) {
                    if(!files.get(i).getFileName().toString().equals(i+".json")) throw new IllegalStateException();
                    Event e=read(files.get(i),Event.class);
                    String previous=result.isEmpty()?null:result.getLast().phase();
                    if(!allowed(previous,e.phase()) || e.at()==null ||
                            ("FAILED".equals(e.phase()) ? e.failureCode()==null || !e.failureCode().matches("[A-Z][A-Z0-9_]{1,100}") : e.failureCode()!=null)) throw new IllegalStateException();
                    result.add(e);
                }
            }
            return List.copyOf(result);
        } catch(Exception failure) {throw unavailable();}
    }
    private boolean allowed(String old,String next) {
        return old==null ? "PREPARING".equals(next) : switch(old) {
            case "PREPARING" -> Set.of("PUBLISHING","FAILED").contains(next);
            case "PUBLISHING" -> Set.of("PROBING","FAILED").contains(next);
            case "PROBING" -> Set.of("SUCCEEDED","FAILED").contains(next);
            default -> false;
        };
    }
    public synchronized void append(UUID id,String phase,String code) {
        try {
            var old=events(id);String previous=old.isEmpty()?null:old.getLast().phase();
            if(!allowed(previous,phase)) throw new IllegalStateException();
            write(root.resolve(id.toString()).resolve(old.size()+".json"),new Event(phase,Instant.now(),code));
        } catch(Exception failure) {throw unavailable();}
    }
    private static AuthFailure unavailable() {return new AuthFailure(HttpStatus.SERVICE_UNAVAILABLE,"DEPLOYMENT_RECORD_UNAVAILABLE");}
}
