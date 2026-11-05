package dev.codeless.api.performance;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.DataMode;
import dev.codeless.api.tasks.CapacityPolicy;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Fresh owners and a real transaction: unrelated suite fixtures never consume this test's quota. */
class DailyTaskQuotaTest extends PostgresTestBase {
    @Autowired JdbcClient jdbc;
    @Autowired PlatformRepository repository;
    @Autowired PlatformTransactionManager manager;
    private CapacityPolicy policy(int limit) {
        return new CapacityPolicy(jdbc,new MockEnvironment()
            .withProperty("codeless.capacity.user-daily-tasks",Integer.toString(limit))
            .withProperty("codeless.capacity.queue","10000")
            .withProperty("codeless.capacity.user-active","10000")
            .withProperty("codeless.capacity.app-active","10000"));
    }
    private UUID owner() {
        UUID id=UUID.randomUUID();repository.createUser(id,id+"@daily-quota.test","Daily quota fixture");return id;
    }
    private UUID app(UUID owner) {
        UUID id=UUID.randomUUID();repository.createApplication(id,owner,"Daily quota fixture",DataMode.STATIC);return id;
    }
    private void admit(CapacityPolicy policy,UUID app) {
        new TransactionTemplate(manager).executeWithoutResult(status->{
            policy.admit(app);
            // Cancelled/failed work still consumed admission and must not refund the daily budget.
            jdbc.sql("INSERT INTO generation_tasks(id,application_id,prompt,status,failure_code) VALUES (?,?,'quota fixture','FAILED','CANCELLED')")
                .params(UUID.randomUUID(),app).update();
        });
    }
    @Test void dailyLimitSpansApplicationsRetainsCancelledWorkAndResetsAtBeijingMidnight() {
        UUID owner=owner(),first=app(owner),second=app(owner);var policy=policy(2);
        jdbc.sql("INSERT INTO generation_tasks(id,application_id,prompt,status,failure_code,created_at) VALUES (?,?,'previous day','FAILED','CANCELLED',(date_trunc('day',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')-interval '1 second')")
            .params(UUID.randomUUID(),first).update();
        admit(policy,first);admit(policy,second);
        assertThatThrownBy(()->admit(policy,second)).isInstanceOfSatisfying(AuthFailure.class,f->{
            assertThat(f.code()).isEqualTo("USER_DAILY_TASK_LIMIT");assertThat(f.status().value()).isEqualTo(429);
        });
        admit(policy,app(owner()));
    }
    @Test void concurrentApplicationsCannotBothTakeTheLastDailySlot() throws Exception {
        UUID owner=owner(),first=app(owner),second=app(owner);var policy=policy(1);
        var ready=new CountDownLatch(2);var start=new CountDownLatch(1);
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            var futures=new ArrayList<Future<String>>();
            for(var app:List.of(first,second)) futures.add(pool.submit(()->{
                ready.countDown();assertThat(start.await(5,TimeUnit.SECONDS)).isTrue();
                try {admit(policy,app);return "ACCEPTED";} catch(AuthFailure rejected) {return rejected.code();}
            }));
            assertThat(ready.await(5,TimeUnit.SECONDS)).isTrue();start.countDown();
            assertThat(List.of(futures.get(0).get(5,TimeUnit.SECONDS),futures.get(1).get(5,TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder("ACCEPTED","USER_DAILY_TASK_LIMIT");
        }
    }
}
