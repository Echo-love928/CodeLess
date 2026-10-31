package dev.codeless.api.cover;

import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import tools.jackson.databind.JsonNode;

/** Fixed installed command, scrubbed environment, one publication and a hard outer deadline. */
public final class NodeCoverGateway implements CoverGateway {
    private final Path node,entry;private final Map<String,String> environment;
    public NodeCoverGateway(Path node,Path entry,Path hostingRoot,Path queueRoot,String publicOrigin,String platformOrigin,String previewOrigin) {
        try {for(var p:List.of(node,entry)) {if(!p.isAbsolute()) throw new IllegalArgumentException();CoverStore.safe(p,false);}
            CoverStore.safe(hostingRoot,true);CoverStore.safe(queueRoot,true);
            var hosting=hostingRoot.toRealPath();var queue=queueRoot.toRealPath();
            if(hosting.startsWith(queue) || queue.startsWith(hosting)) throw new IllegalArgumentException();
            if(!Files.isExecutable(node)) throw new IllegalArgumentException();
        } catch(Exception e) {throw new IllegalArgumentException("COVER_PATH_CONFIG_INVALID");}
        this.node=node;this.entry=entry;
        var env=new HashMap<String,String>();
        for(var key:List.of("PATH","Path","SystemRoot","TEMP","TMP","USERPROFILE","USERNAME","LOCALAPPDATA","HOME","PLAYWRIGHT_BROWSERS_PATH")) {
            var value=System.getenv(key);if(value!=null) env.put(key,value);
        }
        env.put("CODELESS_HOSTING_ROOT",hostingRoot.toString());env.put("CODELESS_COVER_QUEUE_ROOT",queueRoot.toString());
        env.put("CODELESS_PUBLICATION_ORIGIN",publicOrigin);env.put("CODELESS_PLATFORM_ORIGIN",platformOrigin);env.put("CODELESS_PREVIEW_ORIGIN",previewOrigin);
        environment=Map.copyOf(env);
    }
    @Override public JsonNode capture(Binding binding,Instant deadline) {
        Process child=null;var executor=Executors.newVirtualThreadPerTaskExecutor();
        try {
            var now=Instant.now();if(deadline==null || !deadline.isAfter(now.plusSeconds(6)) || deadline.isAfter(now.plusSeconds(45))) throw new IllegalStateException();
            var bytes=CoverStore.JSON.writeValueAsBytes(Map.of("action","capture","binding",binding,"deadline",deadline.toString()));
            if(bytes.length>8192) throw new IllegalStateException();
            var builder=new ProcessBuilder(node.toString(),entry.toString());builder.environment().clear();builder.environment().putAll(environment);
            child=builder.redirectError(ProcessBuilder.Redirect.DISCARD).start();var process=child;
            var output=executor.submit(()->{
                try(var stdin=process.getOutputStream()) {stdin.write(bytes);}
                var result=process.getInputStream().readNBytes(8193);
                if(result.length>8192 || process.waitFor()!=0) throw new IllegalStateException();
                return CoverStore.JSON.readTree(result);
            });
            var response=output.get(Math.max(1,deadline.toEpochMilli()-System.currentTimeMillis()),TimeUnit.MILLISECONDS);
            if(response==null || !response.isObject() || !response.propertyNames().equals(Set.of("record")) || !response.path("record").isObject()) throw new IllegalStateException();
            return response.path("record");
        } catch(Exception failure) {
            if(failure instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new IllegalStateException("COVER_PROCESS_UNCONFIRMED");
        } finally {
            if(child!=null) {
                // Retain handles before terminating the parent, which may otherwise orphan children.
                var descendants=child.descendants().toList();descendants.forEach(ProcessHandle::destroyForcibly);
                if(child.isAlive()) child.destroyForcibly();
                try {child.getInputStream().close();child.getOutputStream().close();} catch(Exception ignored) {}
            }
            executor.shutdownNow();
        }
    }
}
