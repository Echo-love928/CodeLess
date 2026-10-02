package dev.codeless.api.tasks;

import dev.codeless.api.auth.AuthFailure;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Polling durable events also works across API instances; no unbounded per-client event queue. */
@Service
public class TaskEventStreams {
    static final int MAX_CONNECTIONS = 64;
    private final TaskEventReplay replay;
    private final long pollMs;
    private final long heartbeatMs;
    private final ScheduledThreadPoolExecutor executor = new ScheduledThreadPoolExecutor(4, runnable -> {
        Thread thread = new Thread(runnable, "task-sse");
        thread.setDaemon(true);
        return thread;
    });
    private final AtomicInteger connections = new AtomicInteger();
    private final Set<Connection> active = ConcurrentHashMap.newKeySet();

    public TaskEventStreams(TaskEventReplay replay,
            @Value("${codeless.events.poll-ms:500}") long pollMs,
            @Value("${codeless.events.heartbeat-ms:15000}") long heartbeatMs) {
        if (pollMs < 10 || heartbeatMs < 10) throw new IllegalArgumentException("Invalid SSE timing");
        this.replay = replay;
        this.pollMs = pollMs;
        this.heartbeatMs = heartbeatMs;
        executor.setRemoveOnCancelPolicy(true);
    }

    public SseEmitter open(UUID owner, UUID task, int cursor, BooleanSupplier sessionValid) {
        // All errors, including backlog/ownership, must be HTTP JSON before streaming starts.
        TaskEventReplay.Snapshot initial = replay.read(owner, task, cursor);
        if (connections.incrementAndGet() > MAX_CONNECTIONS) {
            connections.decrementAndGet();
            throw new AuthFailure(HttpStatus.SERVICE_UNAVAILABLE, "EVENT_STREAM_CAPACITY");
        }
        Connection connection = new Connection(owner, task, cursor, sessionValid, initial);
        active.add(connection);
        connection.emitter.onCompletion(connection::release);
        connection.emitter.onTimeout(connection::close);
        connection.emitter.onError(error -> connection.release());
        try {
            connection.start();
        } catch (RuntimeException exception) {
            connection.release();
            throw exception;
        }
        return connection.emitter;
    }

    private final class Connection implements Runnable {
        final UUID owner;
        final UUID task;
        final BooleanSupplier sessionValid;
        final SseEmitter emitter = new SseEmitter(60_000L);
        final AtomicBoolean closed = new AtomicBoolean();
        TaskEventReplay.Snapshot initial;
        int cursor;
        long heartbeatAt;
        volatile ScheduledFuture<?> future;

        Connection(UUID owner, UUID task, int cursor, BooleanSupplier sessionValid,
                   TaskEventReplay.Snapshot initial) {
            this.owner = owner;
            this.task = task;
            this.cursor = cursor;
            this.sessionValid = sessionValid;
            this.initial = initial;
        }

        synchronized void start() {
            future = executor.scheduleWithFixedDelay(this, 0, pollMs, TimeUnit.MILLISECONDS);
        }

        @Override public synchronized void run() {
            if (closed.get()) return;
            try {
                if (!sessionValid.getAsBoolean()) { close(); return; }
                TaskEventReplay.Snapshot snapshot;
                if (initial != null) { snapshot = initial; initial = null; }
                else { snapshot = replay.read(owner, task, cursor); }
                for (var event : snapshot.events()) {
                    emitter.send(SseEmitter.event().id(Integer.toString(event.sequence()))
                            .name("task-event").data(event, MediaType.APPLICATION_JSON));
                    cursor = event.sequence();
                }
                if (snapshot.terminal()) { close(); return; }
                long now = System.nanoTime();
                if (now >= heartbeatAt) {
                    emitter.send(SseEmitter.event().comment("heartbeat").reconnectTime(1000));
                    heartbeatAt = now + TimeUnit.MILLISECONDS.toNanos(heartbeatMs);
                }
            } catch (AuthFailure exception) {
                try {
                    emitter.send(SseEmitter.event().name("stream-error")
                            .data(java.util.Map.of("code", exception.code()), MediaType.APPLICATION_JSON));
                } catch (IOException | IllegalStateException ignored) { /* client disconnected */ }
                close();
            } catch (IOException exception) {
                release();
                emitter.complete();
            } catch (RuntimeException exception) {
                try {
                    emitter.send(SseEmitter.event().name("stream-error")
                            .data(java.util.Map.of("code", "EVENT_STREAM_FAILED"), MediaType.APPLICATION_JSON));
                } catch (IOException | IllegalStateException ignored) { /* client disconnected */ }
                close();
            }
        }

        void close() { release(); emitter.complete(); }

        void release() {
            if (closed.compareAndSet(false, true)) {
                if (future != null) future.cancel(false);
                active.remove(this);
                connections.decrementAndGet();
            }
        }
    }

    @PreDestroy void shutdown() {
        active.forEach(Connection::close);
        executor.shutdownNow();
    }
}
