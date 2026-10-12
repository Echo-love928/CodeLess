package dev.codeless.api.versions;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class LocalVolumeSnapshotStoreTest {
    @TempDir Path temporary;
    final JsonMapper json=JsonMapper.builder().build();
    record Input(Path directory, String digest, JsonNode files) {}
    Input input() throws Exception {
        Path directory=Files.createTempDirectory(temporary,"input-");
        Path file=directory.resolve("src/pages/HomePage.vue");Files.createDirectories(file.getParent());
        byte[] content="<template>原版</template>".getBytes(java.nio.charset.StandardCharsets.UTF_8);Files.write(file,content);
        var entries=List.of(new SnapshotStore.Entry("src/pages/HomePage.vue",content.length,LocalVolumeSnapshotStore.hash(content)));
        return new Input(directory,LocalVolumeSnapshotStore.hash(json.writeValueAsBytes(entries)),json.valueToTree(entries));
    }
    @Test void immutableBytesSurviveDraftMutationAndStoreRestart() throws Exception {
        var store=new LocalVolumeSnapshotStore(temporary.resolve("volume"));var input=input();UUID id=UUID.randomUUID();
        store.freezeSource(id,input.directory(),input.digest(),input.files());
        Files.writeString(input.directory().resolve("src/pages/HomePage.vue"),"changed draft");
        var restarted=new LocalVolumeSnapshotStore(temporary.resolve("volume"));
        assertThat(restarted.readSource(id,input.digest(),"src/pages/HomePage.vue")).contains("原版");
        assertThatThrownBy(()->restarted.freezeSource(id,input.directory(),input.digest(),input.files()))
                .hasMessage("SNAPSHOT_ALREADY_FROZEN");
    }
    @Test void sourceCorruptionAndDigestMismatchFailClosed() throws Exception {
        var store=new LocalVolumeSnapshotStore(temporary.resolve("volume"));var input=input();UUID id=UUID.randomUUID();
        assertThatThrownBy(()->store.freezeSource(UUID.randomUUID(),input.directory(),"sha256:"+"0".repeat(64),input.files()))
                .hasMessage("SNAPSHOT_DIGEST_MISMATCH");
        var frozen=store.freezeSource(id,input.directory(),input.digest(),input.files());
        Files.writeString(frozen.directory().resolve("src/pages/HomePage.vue"),"tampered");
        assertThatThrownBy(()->store.readSource(id,input.digest(),"src/pages/HomePage.vue")).hasMessage("SNAPSHOT_DIGEST_MISMATCH");
    }
    @Test void traversalAliasesAndWindowsDevicesAreRejected() throws Exception {
        var store=new LocalVolumeSnapshotStore(temporary.resolve("volume"));var input=input();UUID id=UUID.randomUUID();
        store.freezeSource(id,input.directory(),input.digest(),input.files());
        for(String path:List.of("../source-manifest.json","/src/pages/HomePage.vue","C:/secret","src/pages/../pages/HomePage.vue",
                "src/pages/NUL.vue","src/pages/HomePage.vue:secret","src\\pages\\HomePage.vue"))
            assertThatThrownBy(()->store.readSource(id,input.digest(),path)).hasMessage("SNAPSHOT_PATH_REJECTED");
        assertThatThrownBy(()->store.readSource(id,input.digest(),"src/pages/Other.vue")).hasMessage("SNAPSHOT_FILE_NOT_FOUND");
    }
    @Test void unknownFailureExitRemainsNullAndReportCannotBeOverwritten() throws Exception {
        var store=new LocalVolumeSnapshotStore(temporary.resolve("volume"));var input=input();UUID id=UUID.randomUUID();
        store.freezeSource(id,input.directory(),input.digest(),input.files());
        var outcome=store.freezeOutcome(id,input.digest(),"FAILED",json.createObjectNode(),"RUNNER_UNAVAILABLE");
        assertThat(outcome.report().path("exitCode").isNull()).isTrue();assertThat(outcome.artifactDigest()).isNull();
        assertThat(store.outcome(id,input.digest(),"FAILED")).isEqualTo(outcome);
        assertThatThrownBy(()->store.freezeOutcome(id,input.digest(),"VERIFIED",json.createObjectNode(),null)).hasMessage("SNAPSHOT_ALREADY_FROZEN");
        assertThatThrownBy(()->store.outcome(id,input.digest(),"VERIFIED")).hasMessage("SNAPSHOT_DIGEST_MISMATCH");
    }
    @Test void artifactAndReportAreFrozenIndependentlyAndTamperingDetected() throws Exception {
        var store=new LocalVolumeSnapshotStore(temporary.resolve("volume"));var input=input();UUID id=UUID.randomUUID();
        store.freezeSource(id,input.directory(),input.digest(),input.files());
        Path artifact=Files.createDirectory(temporary.resolve("artifact"));byte[] html="<h1>build</h1>".getBytes();Files.write(artifact.resolve("index.html"),html);
        var entries=List.of(new SnapshotStore.Entry("index.html",html.length,LocalVolumeSnapshotStore.hash(html)));
        String digest=LocalVolumeSnapshotStore.hash(json.writeValueAsBytes(entries));UUID build=UUID.randomUUID();
        var result=json.valueToTree(Map.of("status","VERIFIED","sourceDigest",input.digest(),
                "build",Map.of("id",build,"status","SUCCEEDED","exitCode",0,"artifact",Map.of("directory",artifact.toString(),"digest",digest,"files",json.readTree(json.writeValueAsBytes(entries)))),
                "verification",Map.of("id",UUID.randomUUID(),"buildId",build,"sourceDigest",input.digest(),"artifactDigest",digest,"status","PASSED","workerExitCode",0)));
        var outcome=store.freezeOutcome(id,input.digest(),"VERIFIED",result,null);
        Files.writeString(artifact.resolve("index.html"),"changed runner output");
        assertThat(new LocalVolumeSnapshotStore(temporary.resolve("volume")).outcome(id,input.digest(),"VERIFIED")).isEqualTo(outcome);
        Files.writeString(temporary.resolve("volume").resolve(id.toString()).resolve("outcome/report.json"),"{}");
        assertThatThrownBy(()->store.outcome(id,input.digest(),"VERIFIED")).hasMessage("SNAPSHOT_DIGEST_MISMATCH");
    }
    @Test void linkedAncestorIsRejectedUsingRealLinkOrWindowsJunction() throws Exception {
        Path outside=Files.createDirectory(temporary.resolve("outside")),link=temporary.resolve("link");
        if(System.getProperty("os.name").startsWith("Windows")) {
            Process p=new ProcessBuilder("cmd.exe","/d","/c","mklink","/J",link.toString(),outside.toString()).start();
            assertThat(p.waitFor()).isZero();
        } else Files.createSymbolicLink(link,outside);
        try {
            var store=new LocalVolumeSnapshotStore(link.resolve("volume"));var input=input();
            assertThatThrownBy(()->store.freezeSource(UUID.randomUUID(),input.directory(),input.digest(),input.files())).hasMessage("SNAPSHOT_PATH_REJECTED");
            try(var contents=Files.list(outside)) {assertThat(contents.count()).isZero();}
        } finally {Files.delete(link);}
    }
    @Test void sourceLimitsAreRealUtf8Bytes() throws Exception {
        var input=input();Files.write(input.directory().resolve("src/pages/HomePage.vue"),new byte[131073]);
        var store=new LocalVolumeSnapshotStore(temporary.resolve("volume"));
        assertThatThrownBy(()->store.freezeSource(UUID.randomUUID(),input.directory(),input.digest(),input.files())).hasMessage("SNAPSHOT_LIMIT_EXCEEDED");
    }
}
