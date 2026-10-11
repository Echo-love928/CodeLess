package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

/** Opt-in interrupt of the original Java await after this run's real ingress exists. */
class PreviewAcceptanceInterruptIT extends PreviewPlatformIntegrationTest {
    @Override @Test void realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures() throws Exception {
        var failure=new AtomicReference<Throwable>();var interrupted=new AtomicReference<Boolean>();
        Thread worker=new Thread(()->{try{super.realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures();}catch(Throwable error){failure.set(error);interrupted.set(Thread.currentThread().isInterrupted());}},"owned-preview-interrupt");
        worker.start();String project=null;boolean ingressObserved=false;
        try{
            long end=System.nanoTime()+Duration.ofSeconds(90).toNanos();
            while(System.nanoTime()<end&&worker.isAlive()){
                Path owner=ROOT.resolve("evidence/cleanup-owner.json");
                if(Files.exists(owner)){
                    var binding=json.readTree(Files.readString(owner));project=binding.path("project").asText();
                    assertThat(project).matches("codeless-preview-test-[a-f0-9-]{36}");
                    var query=new ProcessBuilder("docker","ps","--filter","label=com.docker.compose.project="+project,"--format","{{.ID}}").redirectErrorStream(true).start();
                    boolean ended=query.waitFor(5,java.util.concurrent.TimeUnit.SECONDS);if(!ended)query.destroyForcibly();
                    if(ended&&query.exitValue()==0&&!new String(query.getInputStream().readAllBytes()).isBlank()){ingressObserved=true;break;}
                }
                Thread.sleep(50);
            }
            assertThat(project).isNotNull();assertThat(ingressObserved).isTrue();worker.interrupt();worker.join(20000);assertThat(worker.isAlive()).isFalse();
            assertThat(failure.get()).isInstanceOf(InterruptedException.class);assertThat(interrupted.get()).isTrue();
        }finally{if(worker.isAlive()){worker.interrupt();worker.join(20000);}}
        var fallback=json.readTree(Files.readString(ROOT.resolve("evidence/java-project-cleanup.json")));
        assertThat(fallback.path("complete").asBoolean()).isTrue();assertThat(fallback.path("project").asText()).isEqualTo(project);
        for(String kind:java.util.List.of("containers","networks"))assertThat(fallback.path(kind).path("remaining").asInt(-1)).isZero();
        var process=json.readTree(Files.readString(ROOT.resolve("acceptance-process/process-result.json")));
        assertThat(process.path("stopRequested").asBoolean()).isTrue();assertThat(process.path("remaining").asInt(-1)).isZero();
        Files.writeString(ROOT.resolve("evidence/B-shared-interruption.json"),json.writeValueAsString(java.util.Map.of("fixture",true,"realDocker",true,"modelCallsPaid",0,"completePlatformAcceptancePassed",false,"originalFailure","InterruptedException","interruptRestored",true,"usage","UNKNOWN interrupted task","fallback",fallback,"process",process)));
    }
}
