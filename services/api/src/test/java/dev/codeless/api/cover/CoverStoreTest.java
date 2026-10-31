package dev.codeless.api.cover;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.auth.AuthFailure;
import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class CoverStoreTest {
    @TempDir Path root;
    final UUID id=UUID.randomUUID(),app=UUID.randomUUID(),version=UUID.randomUUID();
    final String source="sha256:"+"a".repeat(64),artifact="sha256:"+"b".repeat(64);
    CoverGateway.Binding binding(String path) {return new CoverGateway.Binding(id,app,version,"PUBLISHED",source,artifact,"https://d"+id.toString().replace("-","")+".sites.test/",path);}
    String seed(String path) throws Exception {
        Files.createDirectory(root.resolve(id.toString()));
        var png=root.resolve(id+"/cover.png");ImageIO.write(new BufferedImage(1280,720,BufferedImage.TYPE_INT_RGB),"png",png.toFile());
        var bytes=Files.readAllBytes(png);var hash="sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        var n=CoverStore.JSON.createObjectNode();n.put("deploymentId",id.toString());n.put("applicationId",app.toString());n.put("versionId",version.toString());
        n.put("sourceDigest",source);n.put("artifactDigest",artifact);if(path!=null) n.put("entryPath",path);n.put("status","SUCCEEDED");n.put("attempts",1);
        n.putNull("failureCode");n.put("imageDigest",hash);n.put("imageBytes",bytes.length);n.put("completedAt",1);
        Files.writeString(root.resolve(id+"/job.json"),n.toString());return hash;
    }
    @Test void checkedPngAndExplicitNullsAreReturnedWithoutWriting() throws Exception {
        var hash=seed("/tasks");var before=Files.readAllBytes(root.resolve(id+"/job.json"));var store=new CoverStore(root);
        assertThat(store.metadata(binding("/tasks")).status()).isEqualTo("SUCCEEDED");
        assertThat(store.image(binding("/tasks"),hash)).isEqualTo(Files.readAllBytes(root.resolve(id+"/cover.png")));
        assertThat(CoverStore.JSON.valueToTree(store.metadata(binding("/tasks"))).get("failureCode").isNull()).isTrue();
        assertThat(Files.readAllBytes(root.resolve(id+"/job.json"))).isEqualTo(before);
        assertThatThrownBy(()->store.image(binding("/tasks"),"sha256:"+"0".repeat(64))).isInstanceOfSatisfying(AuthFailure.class,f->assertThat(f.status().value()).isEqualTo(404));
    }
    @Test void legacyRootCannotBeRelabelledAsFunctionalEntry() throws Exception {
        seed(null);var store=new CoverStore(root);assertThat(store.metadata(binding("/")).entryPath()).isEqualTo("/");
        assertThatThrownBy(()->store.metadata(binding("/tasks"))).isInstanceOfSatisfying(AuthFailure.class,f->assertThat(f.status().value()).isEqualTo(404));
    }
    @Test void malformedDuplicateTailTruncatedAndCorruptImagesFailClosed() throws Exception {
        seed("/tasks");var path=root.resolve(id+"/job.json");var original=Files.readString(path);var store=new CoverStore(root);
        for(var bad:List.of(original.substring(0,original.length()-1),original+" {}",original.replace("\"attempts\":1","\"attempts\":1,\"attempts\":0"))) {
            Files.writeString(path,bad);assertThatThrownBy(()->store.metadata(binding("/tasks"))).isInstanceOfSatisfying(AuthFailure.class,f->assertThat(f.status().value()).isEqualTo(503));
        }
        Files.writeString(path,original);Files.write(root.resolve(id+"/cover.png"),new byte[24]);
        assertThatThrownBy(()->store.metadata(binding("/tasks"))).isInstanceOfSatisfying(AuthFailure.class,f->assertThat(f.status().value()).isEqualTo(503));
    }
    @Test void missingJobDoesNotEnqueueOrCreateFiles() throws Exception {
        assertThatThrownBy(()->new CoverStore(root).metadata(binding("/"))).isInstanceOfSatisfying(AuthFailure.class,f->assertThat(f.status().value()).isEqualTo(404));
        try(var files=Files.list(root)) {assertThat(files.toList()).isEmpty();}
    }
}
