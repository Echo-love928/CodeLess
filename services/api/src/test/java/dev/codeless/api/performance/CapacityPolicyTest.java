package dev.codeless.api.performance;
import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.tasks.CapacityPolicy;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
class CapacityPolicyTest {
    @Test void dailyQuotaKeepsItsProductionDefault() {
        assertThat(new CapacityPolicy(null,new MockEnvironment()).dailyLimit()).isEqualTo(10);
        assertThat(new CapacityPolicy(null,new MockEnvironment().withProperty("codeless.capacity.user-daily-tasks","2")).dailyLimit()).isEqualTo(2);
    }
    @Test void zeroNegativeAndUnboundedConfigurationsFailClosed() {
        for(String name:new String[]{"queue","user-active","app-active","model-concurrency","user-daily-tasks"}) {
            for(String value:new String[]{"0","-1","10001"})
                assertThatThrownBy(()->CapacityPolicy.limit(new MockEnvironment().withProperty("codeless.capacity."+name,value),name,2))
                        .isInstanceOf(IllegalStateException.class);
        }
    }
}
