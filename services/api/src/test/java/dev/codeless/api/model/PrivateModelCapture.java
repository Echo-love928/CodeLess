package dev.codeless.api.model;

import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.ai.chat.prompt.Prompt;
import tools.jackson.databind.json.JsonMapper;

/** Explicit test-only private evidence. No headers, key, dispatch/retry or model-content transformation. */
public final class PrivateModelCapture implements ModelProvider {
    private final DeepSeekModelProvider delegate;
    private final Path root;
    private final AtomicInteger count=new AtomicInteger();
    private final JsonMapper json=JsonMapper.builder().build();
    public PrivateModelCapture(DeepSeekModelProvider delegate,Path trustedCaptureDirectory) {
        this.delegate=delegate;root=trustedCaptureDirectory.toAbsolutePath().normalize();
        try {
            Path part=root.getRoot();
            for(Path name:root) {
                part=part.resolve(name);
                if(!Files.exists(part,LinkOption.NOFOLLOW_LINKS))Files.createDirectory(part);
                if(!Files.isDirectory(part,LinkOption.NOFOLLOW_LINKS)||Files.isSymbolicLink(part)||!part.equals(part.toRealPath()))
                    throw new IllegalStateException("MODEL_CAPTURE_PATH_REJECTED");
            }
        } catch(java.io.IOException failure){throw new IllegalStateException("MODEL_CAPTURE_UNAVAILABLE",failure);}
    }
    public String id(){return delegate.id();}public String model(){return delegate.model();}
    public Map<String,Object> requestMetadata(Prompt prompt,int max){return delegate.requestMetadata(prompt,max);}
    public Reply call(Prompt prompt,int max,Duration timeout) {
        int number=count.incrementAndGet();if(number>12)throw new IllegalStateException("MODEL_CAPTURE_CALL_LIMIT");
        write(number,"request",delegate.requestBody(prompt,max).getBytes(StandardCharsets.UTF_8));
        Reply reply;
        try {reply=delegate.call(prompt,max,timeout);}
        catch(ModelFailure failure) {
            try {write(number,"result",json.writeValueAsBytes(Map.of("status","FAILED","code",failure.code(),"evidence",failure.evidence(),"replyCaptured",false)));}
            catch(RuntimeException captureFailure){failure.addSuppressed(captureFailure);}
            throw failure;
        }
        var result=new LinkedHashMap<String,Object>();result.put("status","RETURNED");result.put("replyContent",reply.content());result.put("evidence",reply.evidence());
        result.put("replyCaptured",true);result.put("qualityAccepted",false);
        try {write(number,"result",json.writeValueAsBytes(result));}
        catch(IllegalStateException captureFailure) {
            var failure=new ModelFailure("MODEL_CAPTURE_UNAVAILABLE",reply.evidence());failure.addSuppressed(captureFailure);throw failure;
        }
        return reply;
    }
    private void write(int number,String kind,byte[] bytes) {
        if(bytes.length>2*1024*1024)throw new IllegalStateException("MODEL_CAPTURE_SIZE_LIMIT");
        try {Files.write(root.resolve(String.format(Locale.ROOT,"%02d-%s.json",number,kind)),bytes,StandardOpenOption.CREATE_NEW,StandardOpenOption.WRITE);}
        catch(java.io.IOException failure){throw new IllegalStateException("MODEL_CAPTURE_UNAVAILABLE",failure);}
    }
}
