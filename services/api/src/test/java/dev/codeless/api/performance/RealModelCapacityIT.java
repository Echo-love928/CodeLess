package dev.codeless.api.performance;

import static org.assertj.core.api.Assertions.assertThat;

import dev.codeless.api.model.*;
import dev.codeless.api.tasks.TaskQueueService;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.test.context.*;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.json.JsonMapper;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** Opt-in PLAN/provider capacity measurement, never discovered by the default *Test gate. No build/READY claims. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties={"CODELESS_DEMO_PASSWORD=demo-password-for-test-only", "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only", "CODELESS_COOKIE_SECURE=false"})
@Import(RealModelCapacityIT.Measurement.class)
@ActiveProfiles("test")
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class RealModelCapacityIT {
    static final JsonMapper JSON=JsonMapper.builder().build();
    static final boolean REAL="REAL".equals(System.getenv("CODELESS_CAPACITY_MODE"));
    static final Path PRIVATE=Path.of(required("CODELESS_CAPACITY_PRIVATE_ROOT")).toAbsolutePath().normalize();
    static final PostgreSQLContainer DATABASE=new PostgreSQLContainer(DockerImageName.parse("postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("capacity_test").withUsername("capacity_test").withPassword("local-test-only")
            .withCreateContainerCmdModifier(cmd->cmd.getHostConfig().withMemory(384L*1024*1024).withMemorySwap(384L*1024*1024).withNanoCPUs(500_000_000L));
    static { DATABASE.start(); }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("codeless.model.provider",()->REAL?"deepseek":"deterministic-mock");
        r.add("codeless.model.audit-root",()->PRIVATE.resolve("model-audit").toString());
        r.add("spring.datasource.url",DATABASE::getJdbcUrl);r.add("spring.datasource.username",DATABASE::getUsername);r.add("spring.datasource.password",DATABASE::getPassword);
        r.add("CODELESS_DATABASE_URL",()->"jdbc:postgresql://127.0.0.1:1/must_not_connect");
        r.add("codeless.admin.audit-root",()->PRIVATE.resolve("admin-audit").toString());
        r.add("codeless.capacity.model-concurrency",()->2);
        r.add("codeless.capacity.queue",()->32); r.add("codeless.capacity.user-active",()->16); r.add("codeless.capacity.app-active",()->8);
    }
    @TestConfiguration static class Measurement {
        @Bean @Primary Tracking measuredProvider(@Qualifier("modelProvider") ModelProvider production) {
            return new Tracking(REAL?production:new BoundedModelProvider(new SlowMock(),2));
        }
    }
    static class SlowMock implements ModelProvider {
        final ModelProvider base=new MockModelProvider();
        public String id(){return "deterministic-mock-capacity-preparation";} public String model(){return base.model();}
        public Reply call(Prompt p,int tokens,Duration timeout) {
            if(timeout.toMillis()==1) throw new ModelFailure("MODEL_TIMEOUT");
            try {Thread.sleep(2500);}catch(InterruptedException e){Thread.currentThread().interrupt();throw new ModelFailure("MODEL_INTERRUPTED");}
            return base.call(p,tokens,timeout);
        }
    }
    static class Tracking implements ModelProvider {
        final ModelProvider production;
        final List<Map<String,Object>> calls=new CopyOnWriteArrayList<>();
        final AtomicInteger attempted=new AtomicInteger();
        Tracking(ModelProvider p){production=p;}
        public String id(){return production.id();} public String model(){return production.model();}
        public Map<String,Object> requestMetadata(Prompt p,int tokens){return production.requestMetadata(p,tokens);}
        public Reply call(Prompt p,int tokens,Duration timeout) {
            int bytes=p.getInstructions().stream().mapToInt(m->m.getText().getBytes(StandardCharsets.UTF_8).length).sum();
            int index=attempted.incrementAndGet();
            if(bytes+512>33280 || tokens>4096 || index>8)throw new ModelFailure("MEASUREMENT_BUDGET_STOP");
            var raw=new ConcurrentHashMap<String,Object>();raw.put("index",index);raw.put("startNanos",System.nanoTime());
            raw.put("inputByteReservation",bytes+512);raw.put("maxOutputTokens",tokens);raw.put("timeoutMs",timeout.toMillis());
            raw.put("requestMessages",p.getInstructions().stream().map(m->Map.of("role",m.getMessageType().name(),"content",m.getText())).toList());
            calls.add(raw);
            try {
                var reply=production.call(p,tokens,timeout);raw.put("reply",reply);raw.put("outcome","RETURNED");return reply;
            }catch(ModelFailure f){raw.put("outcome",f.code());raw.put("evidence",f.evidence());throw f;}
            finally {raw.put("endNanos",System.nanoTime());}
        }
        long outstanding(){return calls.stream().filter(c->!c.containsKey("endNanos")).count();}
    }
    @LocalServerPort int port;
    @Autowired Tracking provider;
    @Autowired PlanModelService plans;
    @Autowired TaskQueueService queue;
    @Autowired dev.codeless.api.auth.AuthAccountRepository accounts;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwords;
    final List<Map<String,Object>> http=new ArrayList<>();
    final Map<String,Object> assertions=new LinkedHashMap<>();
    final List<UUID> created=new ArrayList<>();
    final String prompt="Create one static Vue profile page with a heading, biography, contact information and a list of three projects. Use only static data. Return the requested JSON plan.";

    final class Browser implements AutoCloseable {
        final HttpClient client=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).connectTimeout(Duration.ofSeconds(3)).build();
        String csrf;
        Browser(String email) throws Exception {
            csrf=JSON.readTree(get("/auth/csrf").body()).path("token").asText();
            assertThat(post("/auth/login",Map.of("email",email,"password","demo-password-for-test-only")).statusCode()).isEqualTo(200);
        }
        HttpRequest.Builder request(String p){return HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v0"+p)).timeout(Duration.ofSeconds(5));}
        HttpResponse<String> get(String p)throws Exception{return client.send(request(p).GET().build(),HttpResponse.BodyHandlers.ofString());}
        HttpResponse<String> post(String p,Object b)throws Exception{return client.send(request(p).header("Content-Type","application/json").header("X-CSRF-Token",csrf).POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(b))).build(),HttpResponse.BodyHandlers.ofString());}
        UUID app()throws Exception {var r=post("/applications",Map.of("name","D22 isolated capacity","dataMode","STATIC"));assertThat(r.statusCode()).isEqualTo(201);return UUID.fromString(JSON.readTree(r.body()).path("id").asText());}
        UUID task(UUID app)throws Exception {var r=post("/tasks",Map.of("applicationId",app,"prompt",prompt));assertThat(r.statusCode()).isEqualTo(202);var id=UUID.fromString(JSON.readTree(r.body()).path("id").asText());created.add(id);return id;}
        void cancel(UUID task)throws Exception {assertThat(post("/tasks/"+task+"/cancel",Map.of()).statusCode()).isEqualTo(200);}
        public void close(){client.shutdownNow();}
    }
    Object generate(TaskQueueService.Claim c) {
        try{return plans.generate(c.taskId(),c.token());}catch(ModelFailure f){return f.code();}
    }
    void reject(TaskQueueService.Claim c) {
        long begin=System.nanoTime();assertThat(generate(c)).isEqualTo("MODEL_CAPACITY_EXCEEDED");
        assertions.put("modelRejectionMs-"+provider.attempted.get(),(System.nanoTime()-begin)/1e6);
    }
    @Test void measureSingleProcessCandidate() throws Exception {
        if(!Set.of("REAL","MOCK").contains(required("CODELESS_CAPACITY_MODE")))throw new IllegalStateException("Explicit REAL or MOCK mode required");
        if(REAL && !"USER_APPROVED_RMB_2".equals(System.getenv("CODELESS_CAPACITY_APPROVAL")))throw new IllegalStateException("Paid calls require explicit authorization");
        if(REAL){assertThat(provider.production).isInstanceOf(BoundedModelProvider.class);assertThat(provider.id()).isEqualTo("deepseek");assertThat(provider.model()).isEqualTo("deepseek-flash");}
        assertThat(DATABASE.getContainerInfo().getHostConfig().getMemory()).isEqualTo(384L*1024*1024);
        assertThat(DATABASE.getContainerInfo().getHostConfig().getNanoCPUs()).isEqualTo(500_000_000L);
        Files.createDirectories(PRIVATE);privateMode(PRIVATE,true);
        long begin=System.nanoTime();Throwable failed=null;
        try(var browser=new Browser("demo@codeless.local");var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            // Prepare all backlog apps before starting paid calls: setup does not consume overlap time.
            var actors=new ArrayList<Browser>();actors.add(browser);
            try {
                for(int i=0;i<2;i++){String email="capacity-"+UUID.randomUUID()+"@test.local";accounts.seed(email,"Capacity fixture",passwords.encode("demo-password-for-test-only"),"USER");actors.add(new Browser(email));}
                var backlogApps=new ArrayList<UUID>();for(int i=0;i<32;i++)backlogApps.add(actors.get(i%3).app());
                UUID appA=browser.app(),appB=browser.app(),appC=browser.app(),appD=browser.app();
                UUID a=browser.task(appA),b=browser.task(appB),c=browser.task(appC),d=browser.task(appD);
                var ca=queue.claim().orElseThrow();var cb=queue.claim().orElseThrow();var cc=queue.claim().orElseThrow();var cd=queue.claim().orElseThrow();
                assertThat(List.of(ca.taskId(),cb.taskId(),cc.taskId(),cd.taskId())).containsExactly(a,b,c,d);
                var first=executor.submit(()->generate(ca));var second=executor.submit(()->generate(cb));
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);
                while(provider.calls.size()<2 && System.nanoTime()<deadline)Thread.sleep(10);
                Thread.sleep(100);
                assertThat(provider.outstanding()).as("Two actual provider invocations must overlap; no synthetic REAL gate or retry").isEqualTo(2);
                reject(cc);
                UUID waiting=browser.task(appA);assertThat(queue.claim()).as("same app remains queued").isEmpty();
                long cancelledAt=System.nanoTime();browser.cancel(a);
                assertThat(provider.outstanding()).as("Cancelling task must not pretend an unfinished provider has returned").isEqualTo(2);
                reject(cd);assertions.put("cancelledAtNanos",cancelledAt);
                for(int i=0;i<30;i++) {
                    long start=System.nanoTime();boolean active=provider.outstanding()>0;
                    var r=browser.get(i%2==0?"/tasks/"+a:"/applications");long end=System.nanoTime();
                    http.add(Map.of("status",r.statusCode(),"startNanos",start,"endNanos",end,"latencyMs",(end-start)/1e6,"providerOutstandingAtStart",active,"providerOutstandingAtEnd",provider.outstanding()>0));
                    assertThat(r.statusCode()).isEqualTo(200);
                }
                assertThat(http.stream().filter(r->Boolean.TRUE.equals(r.get("providerOutstandingAtStart"))&&Boolean.TRUE.equals(r.get("providerOutstandingAtEnd"))).count()).isGreaterThan(0);
                Object initialA=first.get(125,TimeUnit.SECONDS),initialB=second.get(125,TimeUnit.SECONDS);
                assertions.put("initialAResult",initialA instanceof String?initialA:"PLAN_RETURNED");
                assertions.put("initialBResult",initialB instanceof String?initialB:"PLAN_RETURNED");
                assertThat(initialB).isNotInstanceOf(String.class);
                assertThat(provider.outstanding()).isZero();
                var cancelled=JSON.readTree(browser.get("/tasks/"+a).body());
                assertThat(cancelled.path("status").asText()).isEqualTo("FAILED");assertThat(cancelled.path("failureCode").asText()).isEqualTo("CANCELLED");
                assertions.put("lateReplyCannotReviveCancelledTask",true);
                browser.cancel(b);browser.cancel(c);browser.cancel(d);
                var next=queue.claim().orElseThrow();assertThat(next.taskId()).isEqualTo(waiting);
                assertions.put("queuedTaskClaimedAfterCancellation",true);browser.cancel(waiting);
                // Actual HTTP backlog boundary, no additional provider calls and no worker drain.
                var backlog=new ArrayList<UUID>();for(int i=0;i<32;i++)backlog.add(actors.get(i%3).task(backlogApps.get(i)));
                var refused=browser.post("/tasks",Map.of("applicationId",appC,"prompt",prompt));
                assertThat(refused.statusCode()).isEqualTo(503);assertThat(JSON.readTree(refused.body()).path("code").asText()).isEqualTo("TASK_QUEUE_FULL");assertThat(refused.headers().firstValue("Retry-After")).contains("1");
                assertions.put("queue",Map.of("accepted",32,"rejected",1,"status",503,"code","TASK_QUEUE_FULL","retryAfter","1"));
                for(int i=0;i<32;i++)actors.get(i%3).cancel(backlog.get(i));
                UUID recovered=browser.task(appB);var cr=queue.claim().orElseThrow();assertThat(cr.taskId()).isEqualTo(recovered);
                Object successful=generate(cr);assertions.put("afterCancellationCallOutcome",successful instanceof String?successful:"PLAN_RETURNED");assertThat(successful).isNotInstanceOf(String.class);browser.cancel(recovered);
                String timeout="RETURNED";
                try {provider.call(new Prompt("Return a JSON object with one field ok=true."),256,Duration.ofMillis(1));}catch(ModelFailure f){timeout=f.code();}
                assertions.put("shortTimeoutOutcome",timeout);assertThat(timeout).isEqualTo("MODEL_TIMEOUT");
                UUID afterFailure=browser.task(appB),parallel=browser.task(appD);var cf=queue.claim().orElseThrow();var cp=queue.claim().orElseThrow();
                assertThat(cf.taskId()).isEqualTo(afterFailure);assertThat(cp.taskId()).isEqualTo(parallel);
                var f1=executor.submit(()->generate(cf));var f2=executor.submit(()->generate(cp));
                long recoveredDeadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);
                while(provider.calls.size()<8 && System.nanoTime()<recoveredDeadline)Thread.sleep(10);
                Thread.sleep(100);assertThat(provider.outstanding()).as("Both slots reusable after cancellation, completion and timeout").isEqualTo(2);
                Object after=f1.get(125,TimeUnit.SECONDS),other=f2.get(125,TimeUnit.SECONDS);
                assertions.put("afterTimeoutCallOutcome",after instanceof String?after:"PLAN_RETURNED");assertions.put("afterTimeoutParallelOutcome",other instanceof String?other:"PLAN_RETURNED");
                assertThat(after).isNotInstanceOf(String.class);assertThat(other).isNotInstanceOf(String.class);browser.cancel(afterFailure);browser.cancel(parallel);
                assertions.put("completed",true);
            } finally {for(int i=1;i<actors.size();i++)actors.get(i).close();}
        }catch(Throwable error){failed=error;throw error;}
        finally {
            var report=new LinkedHashMap<String,Object>();report.put("mode",REAL?"REAL":"MOCK");report.put("status",failed==null?"PASSED":"FAILED");
            report.put("failureClass",failed==null?null:failed.getClass().getSimpleName());report.put("provider",provider.id());report.put("configuredModel",provider.model());
            report.put("scope","isolated deployment candidate, one API JVM, production bounded provider and PLAN service; manual claims, no build or full-generation throughput claim");
            report.put("configuration",Map.of("queue",32,"userActive",16,"applicationActive",8,"modelConcurrencyPerProcess",2,"instances",1,"maxAttempts",8,"budgetRmb",2));
            report.put("elapsedMs",(System.nanoTime()-begin)/1e6);report.put("calls",provider.calls);report.put("http",http);report.put("assertions",assertions);
            Path out=PRIVATE.resolve("raw-report.json");Files.writeString(out,JSON.writeValueAsString(report),StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);privateMode(out,false);
        }
    }
    static String required(String name){String v=System.getenv(name);if(v==null||v.isBlank())throw new IllegalStateException("Missing "+name);return v;}
    static void privateMode(Path p,boolean directory)throws Exception {if(p.getFileSystem().supportedFileAttributeViews().contains("posix"))Files.setPosixFilePermissions(p,java.nio.file.attribute.PosixFilePermissions.fromString(directory?"rwx------":"rw-------"));}
}
