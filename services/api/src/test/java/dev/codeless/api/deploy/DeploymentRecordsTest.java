package dev.codeless.api.deploy;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DeploymentRecordsTest {
    @TempDir Path temporary;
    DeploymentRecords.Binding binding() {
        return new DeploymentRecords.Binding(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),
                "sha256:"+"a".repeat(64),"sha256:"+"b".repeat(64),"sha256:"+"c".repeat(64));
    }
    @Test void durableLedgerRejectsTerminalRewriteAndBrokenHistory() throws Exception {
        var b=binding();var store=new DeploymentRecords(temporary);store.create(b);store.append(b.id(),"PUBLISHING",null);
        var restarted=new DeploymentRecords(temporary);assertThat(restarted.binding(b.id())).isEqualTo(b);
        restarted.append(b.id(),"FAILED","DEPLOYMENT_INTERRUPTED");
        assertThatThrownBy(()->restarted.append(b.id(),"SUCCEEDED",null)).hasMessage("DEPLOYMENT_RECORD_UNAVAILABLE");
        assertThatThrownBy(()->restarted.create(b)).hasMessage("DEPLOYMENT_RECORD_UNAVAILABLE");
        Files.writeString(temporary.resolve(b.id().toString()).resolve("1.json"),"{}");
        assertThatThrownBy(()->restarted.events(b.id())).hasMessage("DEPLOYMENT_RECORD_UNAVAILABLE");
    }
    @Test void realLinkedAncestorCannotWriteOutsidePrivateVolume() throws Exception {
        Path outside=Files.createDirectory(temporary.resolve("outside")),link=temporary.resolve("link");
        if(System.getProperty("os.name").startsWith("Windows")) {
            var p=new ProcessBuilder("cmd.exe","/d","/c","mklink","/J",link.toString(),outside.toString()).start();assertThat(p.waitFor()).isZero();
        } else Files.createSymbolicLink(link,outside);
        try {
            assertThatThrownBy(()->new DeploymentRecords(link.resolve("volume")).create(binding())).hasMessage("DEPLOYMENT_RECORD_UNAVAILABLE");
            try(var paths=Files.list(outside)) {assertThat(paths.count()).isZero();}
        } finally {Files.delete(link);}
    }
    @Test void defaultHostingFailsWithoutNetworkAndPayloadHasNoMutableByteAlias() {
        byte[] bytes={1,2,3};var asset=new DeploymentGateway.Asset("index.html","hash",bytes);bytes[0]=9;
        byte[] read=asset.bytes();read[0]=8;assertThat(asset.bytes()).containsExactly(1,2,3);
        var payload=new DeploymentGateway.Payload(UUID.randomUUID(),UUID.randomUUID(),"hash",List.of(asset));
        var hosting=new DeploymentConfiguration().unavailableHosting();
        assertThatThrownBy(()->hosting.publish(payload,Instant.now())).hasMessage("HOSTING_UNAVAILABLE");
        assertThatThrownBy(()->hosting.probe(payload,"https://example.test",Instant.now())).hasMessage("HOSTING_UNAVAILABLE");
    }
}
