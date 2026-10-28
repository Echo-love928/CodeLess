package dev.codeless.api.tasks;

import dev.codeless.api.auth.AuthFailure;
import java.util.UUID;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Shared by normal generation and edits. Count and insertion hold one short database transaction. */
@Component
public final class CapacityPolicy {
    private final JdbcClient jdbc;
    private final int queue, user, app;
    public CapacityPolicy(JdbcClient jdbc, Environment environment) {
        this.jdbc=jdbc;
        queue=limit(environment,"queue",32); user=limit(environment,"user-active",16); app=limit(environment,"app-active",8);
    }
    public static int limit(Environment environment,String name,int fallback) {
        int value=environment.getProperty("codeless.capacity."+name,Integer.class,fallback);
        if(value<1||value>10000) throw new IllegalStateException("codeless.capacity."+name+" must be 1..10000");
        return value;
    }
    public void admit(UUID application) {
        if(!TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Task admission requires an insertion transaction");
        // Bound admission lock waiting; ordinary short bursts need not fail due to an unrelated insertion.
        // No model, runner or filesystem operation holds this lock. Restore the caller's timeout after acquiring it.
        String previous=jdbc.sql("SELECT current_setting('lock_timeout')").query(String.class).single();
        jdbc.sql("SELECT set_config('lock_timeout','1s',true)").query(String.class).single();
        try { jdbc.sql("SELECT pg_advisory_xact_lock(22001, 1)").query((rs,n)->true).single(); }
        catch(org.springframework.dao.DataAccessException busy) {
            // JdbcClient's translation of SELECT/function failures may be UncategorizedSQLException.
            for(Throwable cause=busy;cause!=null;cause=cause.getCause())
                if(cause instanceof java.sql.SQLException sql && "55P03".equals(sql.getSQLState()))
                    throw new AuthFailure(HttpStatus.SERVICE_UNAVAILABLE,"TASK_ADMISSION_BUSY");
            throw busy;
        }
        jdbc.sql("SELECT set_config('lock_timeout',?,true)").param(previous).query(String.class).single();
        long[] counts=jdbc.sql("""
                SELECT count(*) FILTER(WHERE t.queue_state='QUEUED') AS queued,
                    count(*) FILTER(WHERE a.owner_id=target.owner_id) AS owned,
                    count(*) FILTER(WHERE t.application_id=target.id) AS application
                FROM applications target
                LEFT JOIN generation_tasks t ON t.queue_state IN ('QUEUED','RUNNING')
                LEFT JOIN applications a ON a.id=t.application_id
                WHERE target.id=?
                """).param(application).query((rs,n)->new long[]{rs.getLong(1),rs.getLong(2),rs.getLong(3)}).single();
        if(counts[2]>=app) throw new AuthFailure(HttpStatus.TOO_MANY_REQUESTS,"APPLICATION_TASK_LIMIT");
        if(counts[1]>=user) throw new AuthFailure(HttpStatus.TOO_MANY_REQUESTS,"USER_TASK_LIMIT");
        if(counts[0]>=queue) throw new AuthFailure(HttpStatus.SERVICE_UNAVAILABLE,"TASK_QUEUE_FULL");
    }
}
