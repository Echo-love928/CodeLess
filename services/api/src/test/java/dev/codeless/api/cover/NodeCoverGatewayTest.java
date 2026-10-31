package dev.codeless.api.cover;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

/** Installed-process protocol fixtures, not screenshot or REAL model quality evidence. */
class NodeCoverGatewayTest {
    @TempDir Path root;
    CoverGateway.Binding binding() {
        var id=UUID.randomUUID();return new CoverGateway.Binding(id,UUID.randomUUID(),UUID.randomUUID(),"PUBLISHED","sha256:"+"a".repeat(64),"sha256:"+"b".repeat(64),
                "https://d"+id.toString().replace("-","")+".sites.codeless-public.test/","/tasks");
    }
    Path node() {
        for(var part:System.getenv("PATH").split(java.io.File.pathSeparator)) {
            var file=Path.of(part).resolve(System.getProperty("os.name").startsWith("Windows")?"node.exe":"node");if(Files.isRegularFile(file)) return file.toAbsolutePath();
        }
        throw new IllegalStateException("Locked node executable required");
    }
    NodeCoverGateway gateway(String script) throws Exception {
        var entry=root.resolve("gateway-"+UUID.randomUUID()+".mjs");Files.writeString(entry,script);
        var hosting=root.resolve("hosting");var queue=root.resolve("queue");Files.createDirectories(hosting);Files.createDirectories(queue);
        return new NodeCoverGateway(node(),entry,hosting,queue,"https://sites.codeless-public.test","https://platform.codeless.test","https://preview.codeless-preview.test");
    }
    @Test void childReceivesOnlyAllowlistedEnvironmentAndClosedCaptureInput() throws Exception {
        var value=gateway("let raw='';for await(const c of process.stdin)raw+=c;const input=JSON.parse(raw);process.stdout.write(JSON.stringify({record:{keys:Object.keys(process.env),input}}));")
                .capture(binding(),Instant.now().plusSeconds(10));
        var allowed=Set.of("PATH","Path","SystemRoot","TEMP","TMP","USERPROFILE","USERNAME","LOCALAPPDATA","HOME","PLAYWRIGHT_BROWSERS_PATH",
                "CODELESS_HOSTING_ROOT","CODELESS_COVER_QUEUE_ROOT","CODELESS_PUBLICATION_ORIGIN","CODELESS_PLATFORM_ORIGIN","CODELESS_PREVIEW_ORIGIN");
        for(var key:value.path("keys")) assertThat(allowed).contains(key.asText());
        assertThat(value.path("input").propertyNames()).containsExactlyInAnyOrder("action","binding","deadline");
        assertThat(value.path("input").path("binding").path("entryPath").asText()).isEqualTo("/tasks");
    }
    @Test void malformedDuplicateTrailingAndNonzeroOutputsRemainUnconfirmed() throws Exception {
        for(var script:List.of("process.stdout.write('{\"record\":{},\"record\":{}}')","process.stdout.write('{\"record\":{}} {}')","process.stdout.write('{\"record\":{}}');process.exitCode=1"))
            assertThatThrownBy(()->gateway(script).capture(binding(),Instant.now().plusSeconds(10))).hasMessage("COVER_PROCESS_UNCONFIRMED");
    }
    @Test void hardDeadlineTerminatesTheInstalledChild() throws Exception {
        var marker=root.resolve("pid.txt");
        var adapter=gateway("import{writeFileSync}from'node:fs';writeFileSync("+CoverStore.JSON.writeValueAsString(marker.toString())+",String(process.pid));setInterval(()=>{},1000);");
        var start=Instant.now();assertThatThrownBy(()->adapter.capture(binding(),Instant.now().plusSeconds(7))).hasMessage("COVER_PROCESS_UNCONFIRMED");
        assertThat(java.time.Duration.between(start,Instant.now()).toSeconds()).isLessThan(12);
        var pid=Long.parseLong(Files.readString(marker));
        for(int i=0;i<20 && ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false);i++) Thread.sleep(50);
        assertThat(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false)).isFalse();
    }
}
