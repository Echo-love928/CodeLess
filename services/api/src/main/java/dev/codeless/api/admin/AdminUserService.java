package dev.codeless.api.admin;

import dev.codeless.api.auth.AuthFailure;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminUserService {
    private final dev.codeless.api.tasks.TaskQueueService tasks;
    private final dev.codeless.api.apps.ApplicationService applications;
    private final JdbcClient jdbc;
    private final BCryptPasswordEncoder encoder;
    public AdminUserService(JdbcClient jdbc,BCryptPasswordEncoder encoder, dev.codeless.api.tasks.TaskQueueService tasks,dev.codeless.api.apps.ApplicationService applications) {this.jdbc=jdbc;this.encoder=encoder;this.tasks=tasks;this.applications=applications;}
    private static void invalid() {throw new AuthFailure(HttpStatus.BAD_REQUEST,"INVALID_REQUEST");}
    private String password(String value) {
        if(value==null || value.codePointCount(0,value.length())<12 || value.getBytes(StandardCharsets.UTF_8).length>72) invalid();
        return encoder.encode(value);
    }
    private void lock() {jdbc.sql("SELECT pg_advisory_xact_lock(22002,1)").query((rs,n)->true).single();}
    private void audit(UUID actor,UUID target,String action,String before,String after) {
        jdbc.sql("INSERT INTO admin_user_actions(id,actor_id,target_id,action,previous_status,resulting_status) VALUES (?,?,?,?,?,?)")
            .params(UUID.randomUUID(),actor,target,action,before,after).update();
    }
    @Transactional
    public UUID create(UUID actor,String email,String displayName,String password,String role,boolean isTest) {
        if(email==null || displayName==null || role==null) invalid();
        email=email.strip().toLowerCase(Locale.ROOT);displayName=displayName.strip();
        if(email.length()>320 || !email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") || displayName.isEmpty() || displayName.codePointCount(0,displayName.length())>120
                || displayName.codePoints().anyMatch(Character::isISOControl) || !java.util.Set.of("USER","ADMIN").contains(role)) invalid();
        String hash=password(password);lock();
        if(jdbc.sql("SELECT EXISTS(SELECT 1 FROM platform_users WHERE lower(email)=?)").param(email).query(Boolean.class).single())
            throw new AuthFailure(HttpStatus.CONFLICT,"EMAIL_ALREADY_EXISTS");
        UUID id=UUID.randomUUID();
        jdbc.sql("INSERT INTO platform_users(id,email,display_name,status,is_test) VALUES (?,?,?,'ACTIVE',?)").params(id,email,displayName,isTest).update();
        jdbc.sql("INSERT INTO auth_credentials(user_id,password_hash,role) VALUES (?,?,?)").params(id,hash,role).update();
        audit(actor,id,"USER_CREATE","NEW","ACTIVE");return id;
    }
    @Transactional
    public void update(UUID actor,UUID id,String status,boolean isTest) {
        if(!java.util.Set.of("ACTIVE","DISABLED").contains(status)) invalid();lock();
        var row=jdbc.sql("SELECT u.status,c.role FROM platform_users u JOIN auth_credentials c ON c.user_id=u.id WHERE u.id=? FOR UPDATE OF u,c")
            .param(id).query((rs,n)->new String[]{rs.getString(1),rs.getString(2)}).optional()
            .orElseThrow(()->new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND"));
        if("DISABLED".equals(status) && "ACTIVE".equals(row[0])) {
            if(actor.equals(id)) throw new AuthFailure(HttpStatus.CONFLICT,"CANNOT_DISABLE_SELF");
            if("ADMIN".equals(row[1]) && jdbc.sql("SELECT count(*) FROM platform_users u JOIN auth_credentials c ON c.user_id=u.id WHERE u.status='ACTIVE' AND c.role='ADMIN'").query(Long.class).single()<=1)
                throw new AuthFailure(HttpStatus.CONFLICT,"LAST_ACTIVE_ADMIN");
            jdbc.sql("UPDATE auth_credentials SET session_version=session_version+1,updated_at=now() WHERE user_id=?").param(id).update();
        }
        jdbc.sql("UPDATE platform_users SET status=?,is_test=?,updated_at=now(),row_version=row_version+1 WHERE id=?").params(status,isTest,id).update();
        audit(actor,id,"USER_UPDATE",row[0],status);
        audit(actor,id,"USER_CLASSIFY","CLASSIFICATION",isTest?"TEST":"PRODUCTION");
    }
    @Transactional
    public void cleanupTestUser(UUID actor,UUID id) {
        lock();
        boolean test=jdbc.sql("SELECT is_test FROM platform_users WHERE id=? FOR UPDATE").param(id).query(Boolean.class).optional().orElse(false);
        if(!test || actor.equals(id)) throw new AuthFailure(HttpStatus.CONFLICT,"TEST_ACCOUNT_REQUIRED");
        var owned=jdbc.sql("SELECT id FROM applications WHERE owner_id=? ORDER BY id").param(id).query(UUID.class).list();
        for(var app:owned) {
            for(var task:jdbc.sql("SELECT id FROM generation_tasks WHERE application_id=? AND status NOT IN ('READY','FAILED')").param(app).query(UUID.class).list()) tasks.cancel(id,task);
            applications.archive(id,app,true);
        }
        update(actor,id,"DISABLED",true);
        audit(actor,id,"TEST_ACCOUNT_CLEANUP","TEST_DATA","ARCHIVED");
    }
    @Transactional
    public void reset(UUID actor,UUID id,String password) {
        String hash=password(password);lock();
        int updated=jdbc.sql("UPDATE auth_credentials SET password_hash=?,session_version=session_version+1,updated_at=now() WHERE user_id=?").params(hash,id).update();
        if(updated!=1) throw new AuthFailure(HttpStatus.NOT_FOUND,"NOT_FOUND");
        audit(actor,id,"PASSWORD_RESET","REDACTED","REDACTED");
    }
}
