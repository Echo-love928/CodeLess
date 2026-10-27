package dev.codeless.api.performance;
import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.tasks.TaskTiming;
import java.util.UUID;
import org.junit.jupiter.api.Test;
class TaskTimingTest {
    @Test void missingOrInvalidRunnerTimeStaysUnknownRatherThanZero() {
        var json=tools.jackson.databind.json.JsonMapper.builder().build();
        var known=TaskTiming.runnerDurations(json.readTree("{\"build\":{\"createdAt\":\"2026-10-27T00:00:00Z\",\"completedAt\":\"2026-10-27T00:00:02Z\"}}"));
        assertThat(known.buildMs()).isEqualTo(2000);assertThat(known.browserMs()).isNull();
        var invalid=TaskTiming.runnerDurations(json.readTree("{\"build\":{\"createdAt\":\"bad\",\"completedAt\":\"bad\"}}"));
        assertThat(invalid.buildMs()).isNull();assertThat(invalid.browserMs()).isNull();
    }
    @Test void failingCallsRemainMeasuredAndNextTaskCannotInheritThreadState() throws Exception {
        try(var task=TaskTiming.begin(UUID.randomUUID())) {
            long start=System.nanoTime();
            try {Thread.sleep(20);throw new IllegalStateException("fixture");}
            catch(IllegalStateException expected) {TaskTiming.recordModel(System.nanoTime()-start);}
            start=System.nanoTime();Thread.sleep(10);TaskTiming.recordRunner(System.nanoTime()-start);
            var sample=task.sample();
            assertThat(sample.modelMs()).isGreaterThanOrEqualTo(20);
            assertThat(sample.buildVerifyMs()).isGreaterThanOrEqualTo(10);
            assertThat(sample.businessMs()).isGreaterThanOrEqualTo(0);
            assertThat(sample.executionMs()).isCloseTo(sample.businessMs()+sample.modelMs()+sample.buildVerifyMs(),within(0.001));
        }
        try(var next=TaskTiming.begin(UUID.randomUUID())) {
            assertThat(next.sample().modelCalls()).isZero();assertThat(next.sample().runnerCalls()).isZero();
        }
    }
}
