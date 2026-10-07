package dev.codeless.api.agent;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Launches one fixed internal Node entry with an environment allowlist and a bounded result. */
public final class LocalBuildGateway implements BuildGateway {
    private final String node;
    private final Path bridge, work, artifacts, evidence, receipts;
    private final JsonMapper json=JsonMapper.builder().build();
    public LocalBuildGateway(String node, Path repository, Path root) {
        this.node=node;bridge=repository.toAbsolutePath().normalize().resolve("services/api/agent-runner.mjs");
        work=root.resolve("work");artifacts=root.resolve("artifacts");evidence=root.resolve("evidence");receipts=root.resolve("receipts");
    }
    public JsonNode run(JsonNode draft, OffsetDateTime deadline) {
        Process child=null;
        var executor=Executors.newVirtualThreadPerTaskExecutor();
        Future<byte[]> stdout=null;Future<Boolean> stderr=null;
        try {
            long timeout=Math.min(240000,Duration.between(Instant.now(),deadline.toInstant()).toMillis());
            if (timeout<=0) throw new AgentFailure("AGENT_RUNNER_TIMEOUT");
            var builder=new ProcessBuilder(node,bridge.toString(),work.toString(),artifacts.toString(),evidence.toString(),receipts.toString());
            var environment=builder.environment();
            var inherited=new HashMap<>(environment);environment.clear();
            for(String name:List.of("PATH","Path","SystemRoot","WINDIR","TEMP","TMP","TMPDIR","HOME","USERPROFILE","LOCALAPPDATA","PLAYWRIGHT_BROWSERS_PATH"))
                if(inherited.containsKey(name)) environment.put(name,inherited.get(name));
            child=builder.start();
            Process running=child;
            stdout=executor.submit(() -> running.getInputStream().readNBytes(2*1024*1024+1));
            stderr=executor.submit(() -> { running.getErrorStream().transferTo(java.io.OutputStream.nullOutputStream());return true; });
            child.getOutputStream().write(json.writeValueAsString(Map.of("sourceDirectory",draft.path("sourceDirectory").asText(),
                    "sourceDigest",draft.path("sourceDigest").asText(),"actions",draft.path("actions"))).getBytes(StandardCharsets.UTF_8));
            child.getOutputStream().close();
            if(!child.waitFor(timeout,TimeUnit.MILLISECONDS)) {
                throw new AgentFailure("AGENT_RUNNER_TIMEOUT");
            }
            byte[] bytes=stdout.get(5,TimeUnit.SECONDS);stderr.get(5,TimeUnit.SECONDS);
            if(bytes.length>2*1024*1024) throw new AgentFailure("AGENT_RUNNER_RESULT_LIMIT");
            JsonNode result=json.readTree(bytes);
            if(result==null || !result.isObject() || ("VERIFIED".equals(result.path("status").asText())?child.exitValue()!=0:child.exitValue()!=1))
                throw new AgentFailure("AGENT_RUNNER_RESULT_INVALID");
            return result;
        } catch(AgentFailure failure) {throw failure;}
        catch(InterruptedException failure) {Thread.currentThread().interrupt();throw new AgentFailure("AGENT_RUNNER_INTERRUPTED");}
        catch(Exception failure) {throw new AgentFailure("AGENT_RUNNER_UNAVAILABLE");}
        finally {
            // Kill owned processes before waiting for anything that may be reading their pipes.
            // Executor.close() waits for those reads and can prevent interruption cleanup entirely.
            // Docker cleanup after host termination is still unknown; its orphan reaper is required.
            boolean interrupted=Thread.interrupted();
            try {
                if(child!=null) {
                    var descendants=child.descendants().toList();
                    descendants.forEach(ProcessHandle::destroyForcibly);
                    // Give the still-live parent a bounded chance to reap its children on Unix.
                    // Killing it first can leave orphan zombies even after a successful signal.
                    long until=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(250);
                    while(descendants.stream().anyMatch(ProcessHandle::isAlive) && System.nanoTime()<until) {
                        try {Thread.sleep(10);} catch(InterruptedException failure) {interrupted=true;}
                    }
                    if(child.isAlive()) child.destroyForcibly();
                }
            } finally {
                if(stdout!=null) stdout.cancel(true);
                if(stderr!=null) stderr.cancel(true);
                // Pipe I/O need not respond to thread interrupts; never join it without a bound.
                executor.shutdownNow();
                if(interrupted) Thread.currentThread().interrupt();
            }
        }
    }
}
