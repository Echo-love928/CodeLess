package dev.codeless.api.concurrency;

import java.io.Closeable;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;

/**
 * Test-only JDBC gate around the context's DataSource. The first statement whose SQL contains an armed marker pauses
 * (before or after it executes) until the test releases it, so a concurrent commit lands at one exact point between
 * two statements of a single request. A timing race only hits that point by luck; the gate makes it reproducible.
 * It never changes SQL, parameters or results.
 */
final class StatementGate {
    enum When { BEFORE, AFTER }

    static final class Armed {
        final String marker;
        final When when;
        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        volatile String sql;

        Armed(String marker, When when) {
            this.marker = marker;
            this.when = when;
        }

        boolean awaitEntered(long seconds) throws InterruptedException {
            return entered.await(seconds, TimeUnit.SECONDS);
        }

        void release() {
            release.countDown();
        }
    }

    private final AtomicReference<Armed> armed = new AtomicReference<>();

    Armed arm(String marker, When when) {
        Armed gate = new Armed(marker, when);
        if (!armed.compareAndSet(null, gate)) throw new IllegalStateException("gate already armed");
        return gate;
    }

    /** Disarms an unused gate and releases any statement still waiting on it. */
    void reset() {
        Armed gate = armed.getAndSet(null);
        if (gate != null) gate.release();
    }

    private Armed take(String sql, When when) {
        Armed gate = armed.get();
        if (gate == null || gate.when != when || !sql.contains(gate.marker)) return null;
        return armed.compareAndSet(gate, null) ? gate : null;
    }

    private static void pause(Armed gate, String sql) throws InterruptedException {
        gate.sql = sql;
        gate.entered.countDown();
        if (!gate.release.await(60, TimeUnit.SECONDS)) throw new IllegalStateException("statement gate was never released");
    }

    DataSource wrap(DataSource target) {
        List<Class<?>> types = new ArrayList<>(List.of(DataSource.class));
        if (target instanceof Closeable) types.add(Closeable.class);
        return proxy(types, new Wrapper(target) {
            @Override Object call(Method method, Object[] args) throws Throwable {
                Object result = super.call(method, args);
                return result instanceof Connection connection ? connection(connection) : result;
            }
        });
    }

    private Connection connection(Connection target) {
        return proxy(List.of(Connection.class), new Wrapper(target) {
            @Override Object call(Method method, Object[] args) throws Throwable {
                Object result = super.call(method, args);
                return result instanceof PreparedStatement statement && args != null && args.length > 0 && args[0] instanceof String sql
                        ? statement(statement, sql) : result;
            }
        });
    }

    private PreparedStatement statement(PreparedStatement target, String sql) {
        return proxy(List.of(PreparedStatement.class), new Wrapper(target) {
            @Override Object call(Method method, Object[] args) throws Throwable {
                boolean executes = method.getName().startsWith("execute") && (args == null || args.length == 0);
                Armed before = executes ? take(sql, When.BEFORE) : null;
                if (before != null) pause(before, sql);
                Object result = super.call(method, args);
                Armed after = executes ? take(sql, When.AFTER) : null;
                if (after != null) pause(after, sql);
                return result;
            }
        });
    }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(List<Class<?>> types, Wrapper handler) {
        return (T) Proxy.newProxyInstance(StatementGate.class.getClassLoader(), types.toArray(Class<?>[]::new), handler);
    }

    /** Delegates everything except identity: Spring keys transaction resources by the exact DataSource object. */
    private static class Wrapper implements InvocationHandler {
        private final Object target;

        Wrapper(Object target) {
            this.target = target;
        }

        @Override public final Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            if (method.getName().equals("equals") && args != null && args.length == 1) return proxy == args[0];
            if (method.getName().equals("hashCode") && (args == null || args.length == 0)) return System.identityHashCode(proxy);
            return call(method, args);
        }

        Object call(Method method, Object[] args) throws Throwable {
            try {
                return method.invoke(target, args);
            } catch (InvocationTargetException failure) {
                throw failure.getCause();
            }
        }
    }
}
