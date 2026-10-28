package dev.codeless.api.performance;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.DataMode;
import dev.codeless.api.tasks.TaskQueueService;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** Local calibration of the shipped queue=32/user=16/app=8 settings with real PostgreSQL, not model quality. */
class DefaultCapacityCalibrationTest extends PostgresTestBase {
    @Autowired PlatformRepository repository;
    @Autowired TaskQueueService queue;
    @Autowired JdbcTemplate jdbc;
    @BeforeEach @AfterEach void clean() {
        jdbc.update("UPDATE generation_tasks SET queue_state='FINISHED',lease_token=NULL,lease_expires_at=NULL WHERE queue_state IN ('QUEUED','RUNNING')");
    }
    @Test void shippedLimitsHaveReproducibleHeadroomAndExplicitRejections() throws Exception {
        var admission=new ArrayList<Double>(); var reads=new ArrayList<Double>();var ids=new ArrayList<UUID>();
        var owners=new ArrayList<UUID>();
        for(int i=0;i<33;i++) {
            UUID owner=UUID.randomUUID(), app=UUID.randomUUID();
            repository.createUser(owner,owner+"@calibration.test","fixture");
            repository.createApplication(app,owner,"calibration",DataMode.MOCK);
            long start=System.nanoTime();
            if(i<32) {ids.add(queue.create(owner,app,"capacity fixture",null).id());owners.add(owner);admission.add(ApiCapacityMeasurementTest.ms(start));}
            else assertThatThrownBy(()->queue.create(owner,app,"capacity fixture",null)).isInstanceOf(AuthFailure.class).hasMessage("TASK_QUEUE_FULL");
        }
        for(int i=0;i<100;i++) {
            int index=i%32;long start=System.nanoTime();assertThat(queue.find(owners.get(index),ids.get(index))).isPresent();reads.add(ApiCapacityMeasurementTest.ms(start));
        }
        ApiCapacityMeasurementTest.evidence("default-calibration",Map.of("queueLimit",32,"admitted",32,"rejected",1,
                "admissionMs",admission,"queryMsAtQueueDepth32",reads,"querySamples",100,"providerCalls",0,"buildMs","NOT_EXECUTED"));
        clean();
        UUID owner=UUID.randomUUID();repository.createUser(owner,owner+"@calibration.test","fixture");
        UUID a=UUID.randomUUID(),b=UUID.randomUUID(),c=UUID.randomUUID();
        for(UUID app:List.of(a,b,c))repository.createApplication(app,owner,"calibration",DataMode.MOCK);
        for(int i=0;i<8;i++)queue.create(owner,a,"capacity fixture",null);
        assertThatThrownBy(()->queue.create(owner,a,"capacity fixture",null)).hasMessage("APPLICATION_TASK_LIMIT");
        for(int i=0;i<8;i++)queue.create(owner,b,"capacity fixture",null);
        assertThatThrownBy(()->queue.create(owner,c,"capacity fixture",null)).hasMessage("USER_TASK_LIMIT");
    }
}
