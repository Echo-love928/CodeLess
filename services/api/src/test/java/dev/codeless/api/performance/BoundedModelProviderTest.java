package dev.codeless.api.performance;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.model.*;
import java.time.Duration;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.prompt.Prompt;

class BoundedModelProviderTest {
    @Test void saturatedCallsFailImmediatelyAndSlotsSurviveCallerCancellation() throws Exception {
        var entered=new CountDownLatch(2);var release=new CountDownLatch(1);
        var live=new AtomicInteger();var peak=new AtomicInteger();
        ModelProvider delegate=new ModelProvider() {
            public String id(){return "deterministic-mock-blocked";} public String model(){return "capacity-fixture";}
            public Reply call(Prompt p,int tokens,Duration timeout){
                peak.accumulateAndGet(live.incrementAndGet(),Math::max);entered.countDown();
                boolean interrupted=false;
                try { while(true) try {release.await();break;} catch(InterruptedException e){interrupted=true;}
                    return new Reply("{}",Evidence.unknown());
                } finally {live.decrementAndGet();if(interrupted)Thread.currentThread().interrupt();}
            }
        };
        var provider=new BoundedModelProvider(delegate,2);
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            var first=pool.submit(()->provider.call(new Prompt("fixture"),256,Duration.ofSeconds(10)));
            var second=pool.submit(()->provider.call(new Prompt("fixture"),256,Duration.ofSeconds(10)));
            try {
                assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
                first.cancel(true); // delegate deliberately ignores cancellation until it actually returns
                for(int i=0;i<20;i++) {
                    long start=System.nanoTime();
                    assertThatThrownBy(()->provider.call(new Prompt("fixture"),256,Duration.ofSeconds(10)))
                            .isInstanceOf(ModelFailure.class).hasMessage("MODEL_CAPACITY_EXCEEDED");
                    assertThat(Duration.ofNanos(System.nanoTime()-start)).isLessThan(Duration.ofSeconds(1));
                }
                assertThat(peak.get()).isEqualTo(2);assertThat(live.get()).isEqualTo(2);
            } finally {release.countDown();}
            second.get(5,TimeUnit.SECONDS);
        }
        assertThat(provider.call(new Prompt("fixture"),256,Duration.ofSeconds(1)).evidence().usage().totalTokens()).isNull();
    }
    @Test void providerFailureReleasesSlotAndNeverFabricatesUsage() {
        var count=new AtomicInteger();
        var provider=new BoundedModelProvider(new ModelProvider(){
            public String id(){return "deterministic-mock-failure";}public String model(){return "fixture";}
            public Reply call(Prompt p,int n,Duration t){if(count.getAndIncrement()==0)throw new ModelFailure("MODEL_NETWORK");return new Reply("{}",Evidence.unknown());}
        },1);
        assertThatThrownBy(()->provider.call(new Prompt("x"),256,Duration.ofSeconds(1))).hasMessage("MODEL_NETWORK");
        assertThat(provider.call(new Prompt("x"),256,Duration.ofSeconds(1)).evidence().usage()).isEqualTo(ModelProvider.Usage.unknown());
    }
}
