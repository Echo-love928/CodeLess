package dev.codeless.api.preview;

import java.io.IOException;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;
import tools.jackson.databind.json.JsonMapper;

/** Test-private ownership, bounded stop and independent project cleanup. No model requests or global process matching. */
final class PreviewAcceptanceProcess implements AutoCloseable {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final Process process;
    private final Path stop,result,log,evidence;
    private final String nonce;
    private final Map<String,String> environment;
    private final Path cwd;
    private boolean closed;
    PreviewAcceptanceProcess(ProcessBuilder target,Path directory,Path evidence) throws IOException {
        Files.createDirectories(directory);this.evidence=evidence;cwd=target.directory()==null?Path.of(".").toAbsolutePath().normalize():target.directory().toPath().toAbsolutePath().normalize();
        environment=new HashMap<>(target.environment());environment.remove("CODELESS_MODEL_API_KEY");environment.remove("CODELESS_MODEL_NAME");
        nonce=UUID.randomUUID().toString();environment.put("CODELESS_PREVIEW_CLEANUP_NONCE",nonce);
        stop=directory.resolve("stop");result=directory.resolve("process-result.json");log=target.redirectOutput().file()!=null?target.redirectOutput().file().toPath().toAbsolutePath():directory.resolve("target.log");
        Path manifest=directory.resolve("command.json");
        Files.writeString(manifest,JSON.writeValueAsString(Map.of("nonce",nonce,"cwd",cwd.toString(),"command",target.command(),"stop",stop.toAbsolutePath().toString(),"result",result.toAbsolutePath().toString(),"log",log.toAbsolutePath().toString())),StandardOpenOption.CREATE_NEW);
        String repository=cwd.resolve("../..").normalize().toString();
        boolean windows=System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win");
        var command=windows?List.of("pwsh","-NoProfile","-File",Path.of(repository,"tests/e2e/generation/owned-process.ps1").toString(),"-Manifest",manifest.toAbsolutePath().toString()):
            List.of("setsid","node",Path.of(repository,"tests/e2e/generation/owned-process.mjs").toString(),manifest.toAbsolutePath().toString());
        var builder=new ProcessBuilder(command).directory(cwd.toFile()).redirectErrorStream(true).redirectOutput(directory.resolve("supervisor.log").toFile());
        builder.environment().clear();builder.environment().putAll(environment);process=builder.start();
    }
    boolean await(Duration timeout) throws InterruptedException {try{return process.waitFor(timeout.toNanos(),TimeUnit.NANOSECONDS);}catch(InterruptedException error){Thread.currentThread().interrupt();throw error;}}
    int exitValue(){return process.exitValue();}
    Path log(){return log;}
    public void close() throws IOException {
        if(closed)return;closed=true;
        boolean interrupted=Thread.interrupted();IOException failure=null;
        try{
            try{
                if(process.isAlive())try{Files.writeString(stop,"stop",StandardOpenOption.CREATE_NEW);}catch(IOException error){failure=error;process.destroy();}
                long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);
                while(process.isAlive()&&System.nanoTime()<end)try{process.waitFor(50,TimeUnit.MILLISECONDS);}catch(InterruptedException error){interrupted=true;}
                if(process.isAlive()){process.destroyForcibly();throw new IOException("Owned supervisor stop not confirmed");}
                var state=JSON.readTree(Files.readString(result));
                if(!nonce.equals(state.path("nonce").asText())||!state.path("complete").asBoolean()||state.path("remaining").asInt(-1)!=0)throw new IOException("Owned process cleanup not confirmed");
            }catch(Exception error){IOException observed=error instanceof IOException io?io:new IOException("Owned process report invalid",error);if(failure==null)failure=observed;else failure.addSuppressed(observed);}
            // Never let process stopping, report parsing or interrupt state bypass project cleanup.
            if(evidence!=null){
                try{
                    var cleanup=new ProcessBuilder("node","../../tests/e2e/generation/platform-cleanup.mjs","--owned-cleanup",evidence.toString(),nonce).directory(cwd.toFile())
                        .redirectErrorStream(true).redirectOutput(evidence.resolve("java-project-cleanup.log").toFile());
                    cleanup.environment().clear();cleanup.environment().putAll(environment);
                    try(var child=new PreviewAcceptanceProcess(cleanup,evidence.resolve("project-cleanup-process"),null)) {
                        long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(90);
                        while(child.process.isAlive()&&System.nanoTime()<end)try{child.await(Duration.ofMillis(50));}catch(InterruptedException error){interrupted=true;Thread.interrupted();}
                        if(child.process.isAlive()||child.exitValue()!=0)throw new IOException("Owned project cleanup failed or UNKNOWN");
                    }
                }catch(IOException error){if(failure==null)failure=error;else failure.addSuppressed(error);}
            }
        }finally{if(interrupted)Thread.currentThread().interrupt();}
        if(failure!=null)throw failure;
    }
}
