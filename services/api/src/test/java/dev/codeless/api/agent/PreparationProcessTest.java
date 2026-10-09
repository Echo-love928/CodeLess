package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class PreparationProcessTest {
    private final JsonMapper json=JsonMapper.builder().build();
    private Path marker(String mode) throws Exception {
        Path directory=Path.of("target/preparation-process-tests",mode+"-"+UUID.randomUUID());Files.createDirectories(directory);return directory.resolve("pids.json").toAbsolutePath();
    }
    private ProcessBuilder fixture(String mode,Path marker){return new ProcessBuilder("node","../../tests/agent/repair/fixtures/preparation-process.mjs",mode,marker.toString()).inheritIO();}
    private void waitMarker(Path marker) throws Exception {
        long until=System.nanoTime()+Duration.ofSeconds(5).toNanos();while(!Files.exists(marker)&&System.nanoTime()<until)Thread.sleep(10);assertThat(marker).exists();
    }
    private void stopped(Path marker,String outcome) throws Exception {
        var pids=json.readTree(Files.readString(marker));
        boolean rootAlive=ProcessHandle.of(pids.path("parent").asLong()).map(ProcessHandle::isAlive).orElse(false);
        boolean childAlive=ProcessHandle.of(pids.path("child").asLong()).map(ProcessHandle::isAlive).orElse(false);
        Files.writeString(marker.getParent().resolve("observed.json"),json.writeValueAsString(java.util.Map.of("fixture",true,"realProcesses",true,"modelCalls",0,"outcome",outcome,"rootAlive",rootAlive,"childAlive",childAlive)));
        assertThat(rootAlive).isFalse();assertThat(childAlive).isFalse();
    }
    @Test void normalRootAndChildAreReaped() throws Exception {
        var marker=marker("normal");try(var owned=new PreparationProcess(fixture("normal",marker))){assertThat(owned.await(Duration.ofSeconds(5))).isTrue();assertThat(owned.process().exitValue()).isZero();}stopped(marker,"EXIT_0");
    }
    @Test void nonzeroPreparationRemainsFailureAfterCleanup() throws Exception {
        var marker=marker("nonzero");try(var owned=new PreparationProcess(fixture("nonzero",marker))){assertThat(owned.await(Duration.ofSeconds(5))).isTrue();assertThat(owned.process().exitValue()).isEqualTo(7);}stopped(marker,"EXIT_7");
    }
    @Test void timeoutAssertionDoesNotBypassOwnedTreeCleanup() throws Exception {
        var marker=marker("timeout");
        assertThatThrownBy(()->{try(var owned=new PreparationProcess(fixture("blocked",marker))){waitMarker(marker);assertThat(owned.await(Duration.ofMillis(100))).as("original timeout assertion").isTrue();}})
            .isInstanceOf(AssertionError.class).hasMessageContaining("original timeout assertion");
        stopped(marker,"TIMEOUT_ASSERTION");
    }
    @Test void interruptionReclaimsTreeAndRestoresInterruptFlag() throws Exception {
        var marker=marker("interrupt");var result=new AtomicReference<Throwable>();var interrupted=new AtomicReference<Boolean>(false);
        Thread worker=new Thread(()->{try(var owned=new PreparationProcess(fixture("blocked",marker))){owned.await(Duration.ofSeconds(30));result.set(new AssertionError("expected interruption"));}
            catch(Throwable failure){result.set(failure);interrupted.set(Thread.currentThread().isInterrupted());}},"preparation-interruption-fixture");
        worker.start();try{waitMarker(marker);worker.interrupt();worker.join(7000);assertThat(worker.isAlive()).isFalse();assertThat(result.get()).isInstanceOf(InterruptedException.class);assertThat(interrupted.get()).isTrue();}
        finally{if(worker.isAlive()){worker.interrupt();worker.join(7000);}}
        stopped(marker,"INTERRUPTED_FLAG_RESTORED");
    }
}
