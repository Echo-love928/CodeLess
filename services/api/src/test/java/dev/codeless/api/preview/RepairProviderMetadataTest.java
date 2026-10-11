package dev.codeless.api.preview;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.model.ModelProvider;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.prompt.Prompt;

class RepairProviderMetadataTest {
    @Test void paidFaultAdapterForwardsMetadataWithoutCallingTheModelOrInjectingTheFault() {
        var calls=new AtomicInteger();var metadata=Map.<String,Object>of("kind","EXPLICIT_OFFLINE_FIXTURE","bodyDigest","sha256:"+"a".repeat(64));
        var delegate=new ModelProvider() {
            public String id(){return "deterministic-mock";}public String model(){return "metadata-only-fixture";}
            public Map<String,Object> requestMetadata(Prompt prompt,int max){assertThat(max).isEqualTo(4096);return metadata;}
            public Reply call(Prompt prompt,int max,Duration timeout){calls.incrementAndGet();throw new AssertionError("Metadata cannot call a model");}
        };
        var adapter=new RealRepairPreviewPlatformAcceptanceIT.RealFaultProvider(delegate,null,null,null,Path.of("target/metadata-only"));
        assertThat(adapter.requestMetadata(new Prompt("json fixture"),4096)).isEqualTo(metadata);
        assertThat(calls).hasValue(0);assertThat(adapter.injected).hasValue(0);
    }
}
