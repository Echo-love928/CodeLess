package dev.codeless.api.agent;

import java.nio.file.*;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Real Node processes, explicit protocol fixture; no fabricated build/browser acceptance. */
class LocalBuildGatewayTest {
    @TempDir Path temporary;
    final JsonMapper json=JsonMapper.builder().build();
    record Observed(String code,boolean interrupted) {}
    record Fixture(LocalBuildGateway gateway,Path work) {}
    Fixture fixture(String mode) throws Exception {
        Path repository=temporary.resolve("repository"),root=temporary.resolve("private");
        Files.createDirectories(repository.resolve("services/api"));Files.createDirectories(root.resolve("work"));
        Files.copy(Path.of("../../tests/agent/fixtures/blocking-runner.mjs"),repository.resolve("services/api/agent-runner.mjs"));
        Files.writeString(root.resolve("work/mode.txt"),mode);
        return new Fixture(new LocalBuildGateway("node",repository,root),root.resolve("work"));
    }
    JsonNode draft() {return json.valueToTree(Map.of("sourceDirectory",temporary.toString(),"sourceDigest","sha256:"+"a".repeat(64),"actions",List.of()));}
    List<ProcessHandle> started(Fixture fixture) throws Exception {
        long until=System.nanoTime()+5_000_000_000L;
        Path marker=fixture.work().resolve("started.json");
        while(!Files.exists(marker) && System.nanoTime()<until) Thread.sleep(10);
        assertThat(marker).exists();
        var pids=json.readTree(Files.readString(marker));
        return List.of(ProcessHandle.of(pids.get("parent").asLong()).orElseThrow(),ProcessHandle.of(pids.get("descendant").asLong()).orElseThrow());
    }
    Thread worker(Fixture fixture,OffsetDateTime deadline,AtomicReference<Observed> observed) {
        Thread thread=new Thread(() -> {
            try {fixture.gateway().run(draft(),deadline);observed.set(new Observed("UNEXPECTED_SUCCESS",Thread.currentThread().isInterrupted()));}
            catch(AgentFailure failure){observed.set(new Observed(failure.getMessage(),Thread.currentThread().isInterrupted()));}
        },"gateway-lifecycle-test");
        thread.setDaemon(true);thread.start();return thread;
    }
    void terminated(List<ProcessHandle> handles) throws Exception {
        long until=System.nanoTime()+1_000_000_000L;
        while(handles.stream().anyMatch(ProcessHandle::isAlive) && System.nanoTime()<until) Thread.sleep(10);
        assertThat(handles).allMatch(handle -> !handle.isAlive());
    }
    void report(String name,Thread thread,List<ProcessHandle> handles,Observed observed) throws Exception {
        String configured=System.getenv("CODELESS_GATEWAY_EVIDENCE_DIR");
        Path target=configured==null?Path.of("target/gateway-lifecycle-evidence"):Path.of(configured);
        Files.createDirectories(target);
        Files.writeString(target.resolve(name+".json"),json.writeValueAsString(Map.of("protocolFixture",true,"realNodeProcesses",true,
            "gatewayReturned",!thread.isAlive(),"aliveProcessCount",handles.stream().filter(ProcessHandle::isAlive).count(),
            "outcome",observed==null?"UNKNOWN":observed.code(),"interruptPreserved",observed!=null && observed.interrupted())));
    }
    @Test void interruptionReturnsBeforeDeadlineAndTerminatesParentAndInheritedPipeDescendant() throws Exception {
        var fixture=fixture("blocking");var observed=new AtomicReference<Observed>();
        Thread thread=worker(fixture,OffsetDateTime.now().plusSeconds(2),observed);
        List<ProcessHandle> handles=started(fixture);
        try {
            thread.interrupt();thread.join(3500);if(!thread.isAlive()) terminated(handles);report("interruption",thread,handles,observed.get());
            assertThat(thread.isAlive()).as("must not await output readers before terminating owned processes").isFalse();
            assertThat(observed.get()).isEqualTo(new Observed("AGENT_RUNNER_INTERRUPTED",true));terminated(handles);
        } finally {handles.forEach(ProcessHandle::destroyForcibly);thread.interrupt();thread.join(3500);}
    }
    @Test void deadlineTerminatesBothProcessesAndReturnsTimeoutWithoutInterrupt() throws Exception {
        var fixture=fixture("blocking");var observed=new AtomicReference<Observed>();
        Thread thread=worker(fixture,OffsetDateTime.now().plusSeconds(2),observed);
        List<ProcessHandle> handles=started(fixture);
        try {
            thread.join(5000);if(!thread.isAlive()) terminated(handles);report("timeout",thread,handles,observed.get());assertThat(thread.isAlive()).isFalse();
            assertThat(observed.get()).isEqualTo(new Observed("AGENT_RUNNER_TIMEOUT",false));terminated(handles);
        } finally {handles.forEach(ProcessHandle::destroyForcibly);thread.interrupt();thread.join(3500);}
    }
    @Test void completedProtocolResponseStillReturnsNormally() throws Exception {
        assertThat(fixture("normal").gateway().run(draft(),OffsetDateTime.now().plusSeconds(5)).path("status").asText()).isEqualTo("VERIFIED");
        assertThat(Thread.currentThread().isInterrupted()).isFalse();
    }
    @Test void expiredDeadlineDoesNotLaunchAProcess() throws Exception {
        var fixture=fixture("blocking");
        assertThatThrownBy(() -> fixture.gateway().run(draft(),OffsetDateTime.now().minusSeconds(1)))
            .isInstanceOf(AgentFailure.class).hasMessage("AGENT_RUNNER_TIMEOUT");
        assertThat(fixture.work().resolve("started.json")).doesNotExist();
    }
}
