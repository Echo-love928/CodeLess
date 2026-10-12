package dev.codeless.api.data;

import static org.assertj.core.api.Assertions.*;
import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

class VersionSourceMigrationTest extends PostgresTestBase {
    static final String DIGEST="sha256:"+"a".repeat(64);
    @Test void upgradeBackfillsOnlyUnambiguousSameApplicationBuildsAndFreezesProvenance() throws Exception {
        String schema="origin_"+UUID.randomUUID().toString().replace("-","");
        var config=Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())
                .defaultSchema(schema).schemas(schema);
        config.target("4").load().migrate();
        try(var connection=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())) {
            connection.createStatement().execute("SET search_path TO "+schema);
            var jdbc=new JdbcTemplate(new SingleConnectionDataSource(connection,true));
            UUID owner=UUID.randomUUID(),app=UUID.randomUUID(),other=UUID.randomUUID();
            jdbc.update("INSERT INTO platform_users(id,email,display_name,status) VALUES (?,?,?,'ACTIVE')",owner,owner+"@example.test","Origin owner");
            for(UUID application:new UUID[]{app,other})jdbc.update("INSERT INTO applications(id,owner_id,name,data_mode) VALUES (?,?,?,'STATIC')",application,owner,"Origin app");
            UUID first=task(jdbc,app),second=task(jdbc,app),foreign=task(jdbc,other);
            UUID verified=version(jdbc,app,1),failed=version(jdbc,app,2),unknown=version(jdbc,app,3),ambiguous=version(jdbc,app,4),crossApp=version(jdbc,app,5);
            UUID success=UUID.randomUUID();
            jdbc.update("INSERT INTO builds(id,task_id,version_id,status,exit_code,artifact_digest,completed_at) VALUES (?,?,?,'SUCCEEDED',0,?,now())",success,first,verified,DIGEST);
            jdbc.update("UPDATE application_versions SET status='VERIFIED',build_id=? WHERE id=?",success,verified);
            build(jdbc,first,failed);jdbc.update("UPDATE application_versions SET status='FAILED' WHERE id=?",failed);
            build(jdbc,first,ambiguous);build(jdbc,second,ambiguous);build(jdbc,foreign,crossApp);
            assertThat(config.target("5").load().migrate().migrationsExecuted).isEqualTo(1);
            assertThat(origin(jdbc,verified)).isEqualTo(first);assertThat(origin(jdbc,failed)).isEqualTo(first);
            for(UUID id:new UUID[]{unknown,ambiguous,crossApp})assertThat(origin(jdbc,id)).isNull();
            assertThat(jdbc.queryForObject("SELECT source_digest FROM application_versions WHERE id=?",String.class,verified)).isEqualTo(DIGEST);
            assertThat(jdbc.queryForObject("SELECT status FROM application_versions WHERE id=?",String.class,verified)).isEqualTo("VERIFIED");
            UUID fresh=UUID.randomUUID();
            jdbc.update("INSERT INTO application_versions(id,application_id,number,source_digest,status,source_task_id) VALUES (?,?,6,?,'DRAFT',?)",fresh,app,DIGEST,second);
            assertThat(origin(jdbc,fresh)).isEqualTo(second);
            assertThatThrownBy(()->jdbc.update("UPDATE application_versions SET source_task_id=? WHERE id=?",first,fresh)).hasMessageContaining("immutable");
            assertThatThrownBy(()->jdbc.update("UPDATE application_versions SET source_task_id=NULL WHERE id=?",fresh)).hasMessageContaining("immutable");
            assertThatThrownBy(()->jdbc.update("INSERT INTO application_versions(id,application_id,number,source_digest,status,source_task_id) VALUES (?,?,7,?,'DRAFT',?)",UUID.randomUUID(),app,DIGEST,foreign))
                    .hasMessageContaining("application_versions_source_task_fk");
            assertThatThrownBy(()->jdbc.update("UPDATE generation_tasks SET application_id=? WHERE id=?",other,second))
                    .hasMessageContaining("application_versions_source_task_fk");
            assertThat(config.target("5").load().migrate().migrationsExecuted).isZero();
        } finally {
            try(var connection=DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())) {
                connection.createStatement().execute("DROP SCHEMA "+schema+" CASCADE");
            }
        }
    }
    static UUID task(JdbcTemplate jdbc,UUID app) {UUID id=UUID.randomUUID();jdbc.update("INSERT INTO generation_tasks(id,application_id,prompt) VALUES (?,?,?)",id,app,"Origin fixture");return id;}
    static UUID version(JdbcTemplate jdbc,UUID app,int number) {UUID id=UUID.randomUUID();jdbc.update("INSERT INTO application_versions(id,application_id,number,source_digest,status) VALUES (?,?,?,?,'DRAFT')",id,app,number,DIGEST);return id;}
    static void build(JdbcTemplate jdbc,UUID task,UUID version) {jdbc.update("INSERT INTO builds(id,task_id,version_id,status,exit_code,completed_at) VALUES (?,?,?,'FAILED',2,now())",UUID.randomUUID(),task,version);}
    static UUID origin(JdbcTemplate jdbc,UUID version) {return jdbc.queryForObject("SELECT source_task_id FROM application_versions WHERE id=?",UUID.class,version);}
}
