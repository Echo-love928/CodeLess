package dev.codeless.api.tasks;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Monotonic worker envelope; missing close after a crash means unknown, never a zero-duration success. */
public final class TaskTiming implements AutoCloseable {
    private static final Logger log=LoggerFactory.getLogger(TaskTiming.class);
    private static final ThreadLocal<TaskTiming> CURRENT=new ThreadLocal<>();
    private final UUID task;
    private final long start=System.nanoTime();
    private long modelNanos,runnerNanos;
    private int modelCalls,runnerCalls;
    private boolean closed;
    private TaskTiming(UUID task) { this.task=task; }
    public static TaskTiming begin(UUID task) {
        if(CURRENT.get()!=null) throw new IllegalStateException("Nested task timing");
        var timing=new TaskTiming(task); CURRENT.set(timing); return timing;
    }
    public static void recordModel(long nanos) { var t=CURRENT.get(); if(t!=null){t.modelNanos+=nanos;t.modelCalls++;} }
    public static void recordRunner(long nanos) { var t=CURRENT.get(); if(t!=null){t.runnerNanos+=nanos;t.runnerCalls++;} }
    public record RunnerDurations(Long buildMs,Long browserMs) {}
    public static RunnerDurations runnerDurations(tools.jackson.databind.JsonNode receipt) {
        return new RunnerDurations(observedMillis(receipt.path("build"),"createdAt"),
                observedMillis(receipt.path("verification"),"startedAt"));
    }
    private static Long observedMillis(tools.jackson.databind.JsonNode part,String start) {
        try {
            long millis=java.time.Duration.between(java.time.Instant.parse(part.path(start).asText()),
                    java.time.Instant.parse(part.path("completedAt").asText())).toMillis();
            return millis<0?null:millis;
        } catch(java.time.DateTimeException | ArithmeticException invalid) { return null; }
    }
    /** Only called after the runner receipt and evidence were validated; absence is unknown. */
    public static void recordRunnerReceipt(UUID task,tools.jackson.databind.JsonNode receipt) {
        var d=runnerDurations(receipt);
        log.info("API_BUILD_TIMING taskId={} executionId={} buildMs={} browserMs={}",task,
                receipt.path("executionId").asText(),d.buildMs(),d.browserMs());
    }
    public record Sample(UUID taskId,double executionMs,double businessMs,double modelMs,double buildVerifyMs,int modelCalls,int runnerCalls) {}
    public Sample sample() {
        long total=System.nanoTime()-start;
        return new Sample(task,total/1e6,(total-modelNanos-runnerNanos)/1e6,modelNanos/1e6,runnerNanos/1e6,modelCalls,runnerCalls);
    }
    public void close() {
        if(closed)return; closed=true;
        try {
            var s=sample();
            log.info("API_TASK_TIMING taskId={} executionMs={} businessMs={} modelMs={} buildVerifyMs={} modelCalls={} runnerCalls={}",
                    task,s.executionMs(),s.businessMs(),s.modelMs(),s.buildVerifyMs(),s.modelCalls(),s.runnerCalls());
        } finally { CURRENT.remove(); }
    }
}
