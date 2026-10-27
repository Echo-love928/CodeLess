package dev.codeless.api.performance;

import static org.assertj.core.api.Assertions.assertThat;

import dev.codeless.api.data.PostgresTestBase;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.TaskQueueService;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.json.JsonMapper;

/** Real HTTP/Tomcat/PostgreSQL; only the slow model is an explicitly named fixture. No READY claims. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {"CODELESS_DEMO_PASSWORD=demo-password-for-test-only",
        "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only", "CODELESS_COOKIE_SECURE=false",
        "codeless.capacity.queue=4", "codeless.capacity.user-active=3", "codeless.capacity.app-active=2"})
@Import(ApiCapacityMeasurementTest.Fixture.class)
class ApiCapacityMeasurementTest extends PostgresTestBase {
    @LocalServerPort int port;
    @Autowired TaskQueueService queue;
    @Autowired PlanModelService plans;
    @Autowired JdbcTemplate jdbc;
    @Autowired GateProvider gate;
    @Autowired dev.codeless.api.data.PlatformRepository repository;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    static final JsonMapper JSON = JsonMapper.builder().build();

    @TestConfiguration static class Fixture {
        @Bean @Primary GateProvider gatedDeterministicMock() { return new GateProvider(); }
    }
    static class GateProvider implements ModelProvider {
        volatile CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        public String id() { return "deterministic-mock-slow-capacity-fixture"; }
        public String model() { return "plan-fixture-v1"; }
        public Reply call(Prompt prompt, int tokens, Duration timeout) {
            entered.countDown();
            try { if (!release.await(30, TimeUnit.SECONDS)) throw new ModelFailure("MODEL_TIMEOUT"); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new ModelFailure("MODEL_INTERRUPTED"); }
            return new MockModelProvider().call(prompt, tokens, timeout);
        }
    }
    final class Browser implements AutoCloseable {
        final HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
                .connectTimeout(Duration.ofSeconds(3)).build();
        String csrf;
        Browser() throws Exception {
            this(false);
        }
        Browser(boolean admin) throws Exception {
            csrf = JSON.readTree(get("/auth/csrf").body()).path("token").asText();
            assertThat(post("/auth/login", Map.of("email", admin?"admin@codeless.local":"demo@codeless.local", "password", admin?"admin-password-for-test-only":"demo-password-for-test-only")).statusCode()).isEqualTo(200);
        }
        HttpRequest.Builder request(String path) { return HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v0"+path)).timeout(Duration.ofSeconds(5)); }
        HttpResponse<String> get(String path) throws Exception { return client.send(request(path).GET().build(),HttpResponse.BodyHandlers.ofString()); }
        HttpResponse<String> post(String path, Object body) throws Exception {
            return client.send(request(path).header("Content-Type","application/json").header("X-CSRF-Token",csrf)
                    .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
        }
        UUID app() throws Exception {
            var res = post("/applications",Map.of("name","capacity measurement", "dataMode","MOCK"));
            assertThat(res.statusCode()).isEqualTo(201); return UUID.fromString(JSON.readTree(res.body()).path("id").asText());
        }
        HttpResponse<String> create(UUID app) throws Exception { return post("/tasks",Map.of("applicationId",app,"prompt","A static Vue profile page")); }
        public void close() { client.shutdownNow(); }
    }
    @BeforeEach @AfterEach void clean() {
        jdbc.update("UPDATE generation_tasks SET queue_state='FINISHED',lease_token=NULL,lease_expires_at=NULL WHERE queue_state IN ('QUEUED','RUNNING')");
        gate.entered = new CountDownLatch(1); gate.release = new CountDownLatch(1);
    }
    @Test void measureReadPathsAndQueue() throws Exception {
        var queries = new ArrayList<Double>(); var resumes = new ArrayList<Double>();
        var samples = new LinkedHashMap<String,Object>();
        try (var browser = new Browser(); var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            UUID app = browser.app(); var created = browser.create(app); assertThat(created.statusCode()).isEqualTo(202);
            UUID task = UUID.fromString(JSON.readTree(created.body()).path("id").asText());
            var claim = queue.claim().orElseThrow(); assertThat(claim.taskId()).isEqualTo(task);
            long modelStart = System.nanoTime(); var model = executor.submit(() -> plans.generate(task,claim.token()));
            try {
                assertThat(gate.entered.await(10,TimeUnit.SECONDS)).isTrue();
                Thread.sleep(2000); // provider remains in flight for a multi-second request before measuring reads
                for (int i=0;i<5;i++) assertThat(browser.get("/tasks/"+task).statusCode()).isEqualTo(200); // warmup
                for (int i=0;i<30;i++) {
                    long start=System.nanoTime(); assertThat(browser.get("/tasks/"+task).statusCode()).isEqualTo(200); queries.add(ms(start));
                    assertThat(model.isDone()).as("query must finish while provider is still blocked").isFalse();
                }
                for (int i=0;i<10;i++) {
                    long start=System.nanoTime();
                    var response=browser.client.send(browser.request("/tasks/"+task+"/events").header("Accept","text/event-stream")
                            .header("Last-Event-ID","0").GET().build(),HttpResponse.BodyHandlers.ofInputStream());
                    assertThat(response.statusCode()).isEqualTo(200);
                    try (var reader=new BufferedReader(new InputStreamReader(response.body(),java.nio.charset.StandardCharsets.UTF_8))) {
                        String line; boolean received=false;
                        while ((line=reader.readLine())!=null) if(line.startsWith("id:") && line.substring(3).strip().equals("1")) { received=true; break; }
                        assertThat(received).isTrue(); resumes.add(ms(start));
                    }
                }
                UUID waiting = UUID.fromString(JSON.readTree(browser.create(app).body()).path("id").asText());
                assertThat(queue.claim()).as("same application remains serial while the model is blocked").isEmpty();
                var depth=jdbc.queryForMap("SELECT count(*) FILTER(WHERE queue_state='QUEUED') AS queued,count(*) FILTER(WHERE queue_state='RUNNING') AS running FROM generation_tasks");
                Thread.sleep(150); // known residence interval, measured separately from model time
                queue.cancel(owner(app),task);
                var next=queue.claim().orElseThrow(); assertThat(next.taskId()).isEqualTo(waiting);
                double queueMs=jdbc.queryForObject("SELECT EXTRACT(EPOCH FROM (clock_timestamp()-created_at))*1000 FROM generation_tasks WHERE id=?",Double.class,waiting);
                samples.put("queueResidenceMsAtClaim",queueMs); samples.put("queueDepthWhileBlocked",depth);
                queue.cancel(owner(app),waiting);
            } finally { gate.release.countDown(); }
            // Cancellation fences late writes but cannot turn provider completion into READY.
            try { model.get(10,TimeUnit.SECONDS); } catch(ExecutionException expected) {
                assertThat(expected.getCause()).isInstanceOf(ModelFailure.class);
            }
            samples.put("blockedProviderEnvelopeMs",ms(modelStart));
            samples.put("authoritativeTaskStatus",queue.find(owner(app),task).orElseThrow().status());
            samples.put("provider",gate.id()); samples.put("buildMs",null); // no build executed
            samples.put("nonModelQueryMs",queries); samples.put("sseReconnectToFirstEventMs",resumes);
            samples.put("warmupQueries",5); samples.put("querySamples",30); samples.put("sseSamples",10);
            samples.put("modelUsage","UNKNOWN"); samples.put("modelQualityEvidence",false);
            evidence("read-paths",samples);
        } finally { gate.release.countDown(); }
    }
    @Test void limitsReturnExplicitHttpErrorsAndReplayDoesNotConsumeCapacity() throws Exception {
        var results=new LinkedHashMap<String,Object>();
        try(var user=new Browser();var other=new Browser(true)) {
            UUID a=user.app(), b=user.app(), c=user.app();
            UUID original=queue.create(owner(a),a,"A static Vue profile page","fixed-replay").id();
            assertThat(user.create(a).statusCode()).isEqualTo(202);
            checkLimit(user.create(a),429,"APPLICATION_TASK_LIMIT",results);
            assertThat(queue.create(owner(a),a,"A static Vue profile page","fixed-replay").id()).isEqualTo(original);
            assertThat(user.create(b).statusCode()).isEqualTo(202);
            checkLimit(user.create(c),429,"USER_TASK_LIMIT",results);
            UUID d=other.app(), e=other.app();
            assertThat(other.create(d).statusCode()).isEqualTo(202);
            checkLimit(other.create(e),503,"TASK_QUEUE_FULL",results);
            UUID rejected=UUID.randomUUID();
            org.assertj.core.api.Assertions.assertThatThrownBy(()->repository.createQueuedTask(rejected,e,"edit admission fixture",null,"fixture"))
                    .isInstanceOf(dev.codeless.api.auth.AuthFailure.class).hasMessage("TASK_QUEUE_FULL");
            assertThat(repository.findTask(rejected)).isEmpty();assertThat(repository.listEvents(rejected)).isEmpty();
            // Claim frees queue capacity but retains the user's and application's active counts.
            var claim=queue.claim().orElseThrow();
            checkLimit(user.create(c),429,"USER_TASK_LIMIT",results);
            assertThat(other.create(e).statusCode()).isEqualTo(202);
            queue.cancel(owner(a),original);
            assertThat(user.create(a).statusCode()).isEqualTo(503); // queue is still full
            results.put("idempotentReplay",original);results.put("runningTask",claim.taskId());
            results.put("queued",jdbc.queryForObject("SELECT count(*) FROM generation_tasks WHERE queue_state='QUEUED'",Integer.class));
            evidence("limits",results);
        }
    }
    @Test void simultaneousAdmissionsNeverOvershootAndCancellationReleasesSlots() throws Exception {
        var apps=new ArrayList<UUID>();var owners=new HashMap<UUID,UUID>();
        for(int i=0;i<12;i++) {
            UUID owner=UUID.randomUUID(), app=UUID.randomUUID();
            repository.createUser(owner,owner+"@capacity.test","fixture");
            repository.createApplication(app,owner,"fixture",dev.codeless.api.data.PlatformModels.DataMode.MOCK);
            apps.add(app);owners.put(app,owner);
        }
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            var start=new CountDownLatch(1);var outcomes=new ArrayList<Future<String>>();
            for(UUID app:apps)outcomes.add(pool.submit(()->{start.await();try {queue.create(owners.get(app),app,"fixture",null);return "ACCEPTED";}
                catch(dev.codeless.api.auth.AuthFailure full){return full.code();}}));
            start.countDown();var actual=new ArrayList<String>();
            for(var outcome:outcomes)actual.add(outcome.get(10,TimeUnit.SECONDS));
            assertThat(actual.stream().filter("ACCEPTED"::equals).count()).isEqualTo(4);
            assertThat(actual).containsOnly("ACCEPTED","TASK_QUEUE_FULL");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM generation_tasks WHERE queue_state='QUEUED'",Integer.class)).isEqualTo(4);
            var claim=queue.claim().orElseThrow();
            UUID claimedApp=jdbc.queryForObject("SELECT application_id FROM generation_tasks WHERE id=?",UUID.class,claim.taskId());
            queue.cancel(owner(claimedApp),claim.taskId());
            evidence("concurrent-admission",Map.of("samples",12,"outcomes",actual,"maximumQueued",4));
        }
    }
    @Test void admissionLockTimeoutIsExplicitAndDoesNotBlockQueries() throws Exception {
        var release=new CountDownLatch(1);var locked=new CountDownLatch(1);
        try(var browser=new Browser();var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            UUID app=browser.app();
            var holder=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(s->{
                jdbc.execute("SELECT pg_advisory_xact_lock(22001,1)");locked.countDown();
                try {if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("fixture timeout");}
                catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}return null;}));
            try {
                assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();long start=System.nanoTime();
                checkLimit(browser.create(app),503,"TASK_ADMISSION_BUSY",new LinkedHashMap<>());
                double rejectedMs=ms(start);assertThat(rejectedMs).isBetween(800.0,3000.0);
                assertThat(browser.get("/applications").statusCode()).isEqualTo(200);
                evidence("admission-lock",Map.of("rejectionMs",rejectedMs,"code","TASK_ADMISSION_BUSY"));
            } finally {release.countDown();}
            holder.get(5,TimeUnit.SECONDS);
            assertThat(browser.create(app).statusCode()).isEqualTo(202);
        } finally {release.countDown();}
    }
    void checkLimit(HttpResponse<String> response,int status,String code,Map<String,Object> results) {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(JSON.readTree(response.body()).path("code").asText()).isEqualTo(code);
        assertThat(response.headers().firstValue("Retry-After")).contains("1");
        results.put(code,Map.of("status",response.statusCode(),"code",JSON.readTree(response.body()).path("code").asText()));
    }
    UUID owner(UUID app) { return jdbc.queryForObject("SELECT owner_id FROM applications WHERE id=?",UUID.class,app); }
    static double ms(long start) { return (System.nanoTime()-start)/1_000_000.0; }
    static void evidence(String name,Object value) throws Exception {
        String root=System.getenv("CODELESS_API_PERF_EVIDENCE");
        if(root==null) root="target/api-performance";
        Path dir=Path.of(root); Files.createDirectories(dir);
        Files.writeString(dir.resolve(name+".json"),JSON.writerWithDefaultPrettyPrinter().writeValueAsString(value)+"\n");
    }
}
