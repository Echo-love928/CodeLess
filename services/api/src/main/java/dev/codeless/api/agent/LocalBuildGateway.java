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
        try (var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            long timeout=Math.min(240000,Duration.between(Instant.now(),deadline.toInstant()).toMillis());
            if (timeout<=0) throw new AgentFailure("AGENT_RUNNER_TIMEOUT");
            var builder=new ProcessBuilder(node,bridge.toString(),work.toString(),artifacts.toString(),evidence.toString(),receipts.toString());
            var environment=builder.environment();
            var inherited=new HashMap<>(environment);environment.clear();
            for(String name:List.of("PATH","Path","SystemRoot","WINDIR","TEMP","TMP","TMPDIR","HOME","USERPROFILE","LOCALAPPDATA","PLAYWRIGHT_BROWSERS_PATH"))
                if(inherited.containsKey(name)) environment.put(name,inherited.get(name));
            child=builder.start();
            Process running=child;
            var stdout=executor.submit(() -> running.getInputStream().readNBytes(2*1024*1024+1));
            var stderr=executor.submit(() -> { running.getErrorStream().transferTo(java.io.OutputStream.nullOutputStream());return true; });
            child.getOutputStream().write(json.writeValueAsString(Map.of("sourceDirectory",draft.path("sourceDirectory").asText(),
                    "sourceDigest",draft.path("sourceDigest").asText(),"actions",draft.path("actions"))).getBytes(StandardCharsets.UTF_8));
            child.getOutputStream().close();
            if(!child.waitFor(timeout,TimeUnit.MILLISECONDS)) {
                // Owned descendants only. Docker cleanup after external host termination is unknown,
                // never reported as successful; the deployment orphan reaper remains required.
                child.descendants().forEach(ProcessHandle::destroyForcibly);child.destroyForcibly();
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
        finally {if(child!=null && child.isAlive()) {child.descendants().forEach(ProcessHandle::destroyForcibly);child.destroyForcibly();}}
    }
}
