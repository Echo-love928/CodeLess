package dev.codeless.api.cover;

import com.fasterxml.jackson.annotation.JsonInclude;
import dev.codeless.api.auth.AuthFailure;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.http.HttpStatus;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Read-only owner adapter for the native screenshot queue. GET never creates a job. */
public final class CoverStore {
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record View(UUID deploymentId, UUID applicationId, UUID versionId, String sourceDigest, String artifactDigest,
                       String entryPath, String status, int attempts, String failureCode, String imageDigest, Long imageBytes) {}
    static final JsonMapper JSON = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    private static final Set<String> FIELDS = Set.of("deploymentId","applicationId","versionId","sourceDigest","artifactDigest",
            "entryPath","status","attempts","failureCode","imageDigest","imageBytes","completedAt");
    private static final Set<String> FAILURES = Set.of("TARGET_REJECTED","CAPTURE_TIMEOUT","CAPTURE_FAILED","CLEANUP_FAILED","CAPTURE_INTERRUPTED");
    private final Path root;
    public CoverStore(Path root) {this.root=root.toAbsolutePath().normalize();}
    static AuthFailure unavailable() {return new AuthFailure(HttpStatus.SERVICE_UNAVAILABLE,"COVER_UNAVAILABLE");}
    static AuthFailure missing() {return new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND");}
    static void safe(Path path, boolean directory) throws Exception {
        var absolute=path.toAbsolutePath().normalize();var current=absolute.getRoot();
        for(var part:absolute) {
            current=current.resolve(part);
            if(Files.isSymbolicLink(current) || !current.equals(current.toRealPath())) throw unavailable();
        }
        if(directory ? !Files.isDirectory(absolute,LinkOption.NOFOLLOW_LINKS) : !Files.isRegularFile(absolute,LinkOption.NOFOLLOW_LINKS)) throw unavailable();
        if(!directory && absolute.getFileSystem().supportedFileAttributeViews().contains("unix")
                && ((Number)Files.getAttribute(absolute,"unix:nlink",LinkOption.NOFOLLOW_LINKS)).longValue()!=1) throw unavailable();
    }
    static byte[] read(Path file,int limit) throws Exception {
        safe(file,false);
        try(var channel=FileChannel.open(file,StandardOpenOption.READ,LinkOption.NOFOLLOW_LINKS)) {
            if(channel.size()>limit) throw unavailable();
            var bytes=ByteBuffer.allocate(limit+1);
            while(bytes.hasRemaining() && channel.read(bytes)!=-1) {}
            if(bytes.position()>limit) throw unavailable();
            return Arrays.copyOf(bytes.array(),bytes.position());
        }
    }
    private static String text(JsonNode n,String key) {if(!n.path(key).isTextual()) throw unavailable();return n.path(key).asText();}
    private static boolean digest(String s) {return s!=null && s.matches("sha256:[a-f0-9]{64}");}
    private Path job(UUID id) {return root.resolve(id.toString());}
    public View metadata(CoverGateway.Binding binding) {
        try {
            safe(root,true);var directory=job(binding.id());
            if(!Files.exists(directory,LinkOption.NOFOLLOW_LINKS)) throw missing();
            safe(directory,true);var file=directory.resolve("job.json");
            if(!Files.exists(file,LinkOption.NOFOLLOW_LINKS)) throw missing();
            var n=JSON.readTree(read(file,8192));
            if(n==null || !n.isObject() || !FIELDS.containsAll(n.propertyNames())) throw unavailable();
            var path=n.has("entryPath")?text(n,"entryPath"):"/";
            if(!binding.id().toString().equals(text(n,"deploymentId")) || !binding.applicationId().toString().equals(text(n,"applicationId"))
                    || !binding.versionId().toString().equals(text(n,"versionId")) || !binding.sourceDigest().equals(text(n,"sourceDigest"))
                    || !binding.artifactDigest().equals(text(n,"artifactDigest")) || !binding.entryPath().equals(path)) throw missing();
            var status=text(n,"status");var attempts=n.path("attempts");
            if(!Set.of("QUEUED","RUNNING","RETRYING","SUCCEEDED","FAILED").contains(status)
                    || !attempts.isIntegralNumber() || !attempts.canConvertToInt() || attempts.asInt()<0 || attempts.asInt()>2) throw unavailable();
            if(!Set.of("SUCCEEDED","FAILED").contains(status) && Files.exists(root.getParent().resolve("quarantine.json"),LinkOption.NOFOLLOW_LINKS)) throw unavailable();
            String failure=n.path("failureCode").isNull()?null:text(n,"failureCode");
            if((failure!=null && !FAILURES.contains(failure)) || ("FAILED".equals(status)?failure==null:!"RETRYING".equals(status)&&failure!=null)) throw unavailable();
            String hash=null;Long size=null;
            if("SUCCEEDED".equals(status)) {
                hash=text(n,"imageDigest");var length=n.path("imageBytes");
                if(!digest(hash) || !length.isIntegralNumber() || !length.canConvertToLong() || length.asLong()<24 || length.asLong()>6*1024*1024) throw unavailable();
                size=length.asLong();validateImage(directory,hash,size);
            } else if(!n.path("imageDigest").isNull() || !n.path("imageBytes").isNull()) throw unavailable();
            return new View(binding.id(),binding.applicationId(),binding.versionId(),binding.sourceDigest(),binding.artifactDigest(),path,status,attempts.asInt(),failure,hash,size);
        } catch(AuthFailure f) {throw f;} catch(Exception f) {throw unavailable();}
    }
    public byte[] image(CoverGateway.Binding binding,String expected) {
        if(!digest(expected)) throw missing();
        var record=metadata(binding);
        if(!"SUCCEEDED".equals(record.status()) || !expected.equals(record.imageDigest())) throw missing();
        try {return validateImage(job(binding.id()),expected,record.imageBytes());}
        catch(AuthFailure f) {throw f;} catch(Exception f) {throw unavailable();}
    }
    private byte[] validateImage(Path directory,String hash,long size) throws Exception {
        var png=read(directory.resolve("cover.png"),6*1024*1024);
        if(png.length!=size || png.length<24 || !Arrays.equals(Arrays.copyOf(png,8),new byte[]{(byte)137,80,78,71,13,10,26,10})
                || ByteBuffer.wrap(png).getInt(12)!=0x49484452 || ByteBuffer.wrap(png).getInt(16)!=1280 || ByteBuffer.wrap(png).getInt(20)!=720
                || !hash.equals("sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(png)))) throw unavailable();
        return png;
    }
}
