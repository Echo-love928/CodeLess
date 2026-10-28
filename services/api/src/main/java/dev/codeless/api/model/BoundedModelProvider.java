package dev.codeless.api.model;

import dev.codeless.api.tasks.TaskTiming;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Semaphore;
import org.springframework.ai.chat.prompt.Prompt;

/** Per API process, fail-fast, no hidden waiting queue. A cancelled task retains its slot until call returns. */
public final class BoundedModelProvider implements ModelProvider {
    private final ModelProvider delegate;
    private final Semaphore slots;
    public BoundedModelProvider(ModelProvider delegate,int concurrency) {
        if(concurrency<1||concurrency>10000) throw new IllegalArgumentException("model concurrency must be 1..10000");
        this.delegate=delegate; slots=new Semaphore(concurrency);
    }
    public String id() { return delegate.id(); }
    public String model() { return delegate.model(); }
    public Map<String,Object> requestMetadata(Prompt prompt,int maxOutputTokens) { return delegate.requestMetadata(prompt,maxOutputTokens); }
    public Reply call(Prompt prompt,int maxOutputTokens,Duration timeout) {
        if(!slots.tryAcquire()) throw new ModelFailure("MODEL_CAPACITY_EXCEEDED");
        long start=System.nanoTime();
        try { return delegate.call(prompt,maxOutputTokens,timeout); }
        finally { TaskTiming.recordModel(System.nanoTime()-start); slots.release(); }
    }
}
