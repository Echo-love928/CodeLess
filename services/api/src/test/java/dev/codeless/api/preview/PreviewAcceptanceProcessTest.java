package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class PreviewAcceptanceProcessTest {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private Path directory(String mode) throws Exception {var path=Path.of("target/b-shared-process",mode+"-"+UUID.randomUUID()).toAbsolutePath();Files.createDirectories(path);return path;}
    private ProcessBuilder command(String mode,Path dir){return new ProcessBuilder("node","../../tests/e2e/generation/fixtures/process-tree.mjs",mode,dir.resolve("pids.json").toString());}
    private void ready(Path dir) throws Exception {long end=System.nanoTime()+Duration.ofSeconds(8).toNanos();while(!Files.exists(dir.resolve("pids.json"))&&System.nanoTime()<end)Thread.sleep(10);assertThat(dir.resolve("pids.json")).exists();}
    private void stopped(Path dir) throws Exception {
        var pids=JSON.readTree(Files.readString(dir.resolve("pids.json")));var observed=new LinkedHashMap<String,Object>();observed.put("modelCalls",0);
        for(String name:List.of("root","branch","leaf")){boolean alive=ProcessHandle.of(pids.path(name).asLong()).map(ProcessHandle::isAlive).orElse(false);observed.put(name+"Alive",alive);assertThat(alive).as(name+" stopped").isFalse();}
        Files.writeString(dir.resolve("observed.json"),JSON.writeValueAsString(observed));
        var result=JSON.readTree(Files.readString(dir.resolve("process-result.json")));assertThat(result.path("complete").asBoolean()).isTrue();assertThat(result.path("remaining").asInt(-1)).isZero();
    }
    @Test void rootZeroReapsOrphanDescendants() throws Exception {var dir=directory("zero");try(var owned=new PreviewAcceptanceProcess(command("normal",dir),dir,null)){assertThat(owned.await(Duration.ofSeconds(10))).isTrue();assertThat(owned.exitValue()).isZero();}stopped(dir);}
    @Test void rootSevenRemainsSevenAfterWholeTreeCleanup() throws Exception {var dir=directory("seven");try(var owned=new PreviewAcceptanceProcess(command("nonzero",dir),dir,null)){assertThat(owned.await(Duration.ofSeconds(10))).isTrue();assertThat(owned.exitValue()).isEqualTo(7);}stopped(dir);}
    @Test void timeoutAssertionAlwaysStopsRootBranchAndLeaf() throws Exception {var dir=directory("timeout");assertThatThrownBy(()->{try(var owned=new PreviewAcceptanceProcess(command("blocked",dir),dir,null)){ready(dir);assertThat(owned.await(Duration.ofMillis(100))).as("original timeout").isTrue();}}).isInstanceOf(AssertionError.class).hasMessageContaining("original timeout");stopped(dir);}
    @Test void parentExceptionIsNotReplacedByCleanup() throws Exception {var dir=directory("parent");assertThatThrownBy(()->{try(var owned=new PreviewAcceptanceProcess(command("blocked",dir),dir,null)){ready(dir);throw new IllegalStateException("original parent");}}).isInstanceOf(IllegalStateException.class).hasMessage("original parent");stopped(dir);}
    @Test void interruptionStopsTreeAndRetainsInterrupt() throws Exception {
        var dir=directory("interrupt");var thrown=new AtomicReference<Throwable>();var flag=new AtomicReference<Boolean>();
        Thread worker=new Thread(()->{try(var owned=new PreviewAcceptanceProcess(command("blocked",dir),dir,null)){owned.await(Duration.ofSeconds(30));}catch(Throwable failure){thrown.set(failure);flag.set(Thread.currentThread().isInterrupted());}});
        worker.start();try{ready(dir);worker.interrupt();worker.join(15000);assertThat(worker.isAlive()).isFalse();assertThat(thrown.get()).isInstanceOf(InterruptedException.class);assertThat(flag.get()).isTrue();}finally{if(worker.isAlive()){worker.interrupt();worker.join(15000);}}
        stopped(dir);
    }
    @Test void unavailableProcessReportStillRunsProjectCleanupAndPreservesParent() throws Exception {
        var dir=directory("report");var evidence=dir.resolve("evidence");Files.createDirectories(evidence);
        Throwable original=catchThrowable(()->{try(var owned=new PreviewAcceptanceProcess(command("blocked",dir),dir,evidence)){ready(dir);Files.createDirectory(dir.resolve("process-result.json"));throw new IllegalStateException("original report fault");}});
        assertThat(original).isInstanceOf(IllegalStateException.class).hasMessage("original report fault");
        assertThat(original.getSuppressed()).hasSize(1);assertThat(original.getSuppressed()[0]).isInstanceOf(java.io.IOException.class);
        var fallback=JSON.readTree(Files.readString(evidence.resolve("java-project-cleanup.json")));assertThat(fallback.path("state").asText()).isEqualTo("NOT_CREATED");assertThat(fallback.path("complete").asBoolean()).isTrue();
        var pids=JSON.readTree(Files.readString(dir.resolve("pids.json")));for(String name:List.of("root","branch","leaf"))assertThat(ProcessHandle.of(pids.path(name).asLong()).map(ProcessHandle::isAlive).orElse(false)).isFalse();
    }
    @Test void sharedNodeCleanupRegressionsRemainInTheApiGate() throws Exception {
        var dir=directory("node-regressions");var builder=new ProcessBuilder("node","--test","../../tests/e2e/generation/shared-cleanup.regression.mjs","../../tests/e2e/generation/project-cleanup.regression.mjs");
        try(var owned=new PreviewAcceptanceProcess(builder,dir,null)){assertThat(owned.await(Duration.ofSeconds(30))).as(Files.exists(owned.log())?Files.readString(owned.log()):"node regression log unavailable").isTrue();assertThat(owned.exitValue()).as(Files.readString(owned.log())).isZero();}
    }

    @Test void stopSignalWriteFailureStillReclaimsAndRunsProjectCleanup() throws Exception {
        var dir=directory("signal-write");var evidence=dir.resolve("evidence");Files.createDirectories(evidence);
        Throwable original=catchThrowable(()->{try(var owned=new PreviewAcceptanceProcess(command("blocked",dir),dir,evidence)){ready(dir);Files.createDirectory(dir.resolve("stop"));throw new IllegalStateException("original signal fault");}});
        assertThat(original).isInstanceOf(IllegalStateException.class).hasMessage("original signal fault");assertThat(original.getSuppressed()).hasSize(1);
        var fallback=JSON.readTree(Files.readString(evidence.resolve("java-project-cleanup.json")));assertThat(fallback.path("complete").asBoolean()).isTrue();
        var pids=JSON.readTree(Files.readString(dir.resolve("pids.json")));for(String name:List.of("root","branch","leaf"))assertThat(ProcessHandle.of(pids.path(name).asLong()).map(ProcessHandle::isAlive).orElse(false)).isFalse();
        var cleanupProcess=JSON.readTree(Files.readString(evidence.resolve("project-cleanup-process/process-result.json")));assertThat(cleanupProcess.path("complete").asBoolean()).isTrue();assertThat(cleanupProcess.path("remaining").asInt(-1)).isZero();
    }

}
