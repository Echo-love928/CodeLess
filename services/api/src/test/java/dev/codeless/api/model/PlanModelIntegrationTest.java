package dev.codeless.api.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.codeless.api.data.ArtifactRepository;
import dev.codeless.api.data.PlatformModels.DataMode;
import dev.codeless.api.data.PlatformModels.ModelCallStatus;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.data.PlatformRepository;
import dev.codeless.api.data.PostgresTestBase;
import dev.codeless.api.tasks.TaskQueueService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.json.JsonMapper;

class PlanModelIntegrationTest extends PostgresTestBase {
    @Autowired ModelCallRepository records;
    @Autowired ArtifactRepository artifacts;
    @Autowired PlatformRepository platform;
    @Autowired TaskQueueService queue;
    @Autowired JdbcClient jdbc;
    @Autowired PlanValidator validator;
    @TempDir Path root;
    private final JsonMapper mapper = JsonMapper.builder().build();

    private TaskQueueService.Claim claim(String prompt) {
        // Keep the shared Testcontainers DB clear of unrelated queued task fixtures.
        jdbc.sql("UPDATE generation_tasks SET queue_state='FINISHED' WHERE queue_state='QUEUED'").update();
        UUID owner = UUID.randomUUID();
        UUID app = UUID.randomUUID();
        platform.createUser(owner, owner + "@model.test", "Model tester");
        platform.createApplication(app, owner, "Plan test", DataMode.STATIC);
        platform.createTask(UUID.randomUUID(), app, prompt, null);
        return queue.claim().orElseThrow();
    }
    private PlanModelService service(ModelProvider provider) { return new PlanModelService(provider, validator, records, new ModelCallAudit(root)); }

    @Test
    void validPlanPersistsUnknownUsageAsSqlNullAndDurableAuditAcrossReconstructionNeverReady() throws Exception {
        var claim = claim("个人展示页");
        var candidate = service(new MockModelProvider()).generate(claim.taskId(), claim.token());
        var db = artifacts.findModelCall(candidate.callId()).orElseThrow();
        assertThat(db.status()).isEqualTo(ModelCallStatus.SUCCEEDED);
        assertThat(db.inputTokens()).isNull();
        assertThat(db.outputTokens()).isNull();
        var audit = new ModelCallAudit(root);
        var saved = mapper.readTree(Files.readString(audit.recordPath(candidate.callId())));
        assertThat(saved.get("provider").asText()).isEqualTo("deterministic-mock");
        assertThat(saved.get("requestId").asText()).isEqualTo("mock-plan-v1");
        assertThat(saved.get("durationMs").longValue()).isGreaterThanOrEqualTo(0);
        assertThat(saved.at("/usage/inputTokens").isNull()).isTrue();
        assertThat(saved.at("/usage/outputTokens").isNull()).isTrue();
        assertThat(saved.at("/usage/totalTokens").isNull()).isTrue();
        assertThat(mapper.readTree(Files.readString(root.resolve(candidate.callId() + ".plan.json")))).isEqualTo(candidate.plan());
        assertThat(platform.findTask(claim.taskId()).orElseThrow().status()).isEqualTo(TaskStatus.PLAN);
        assertThatThrownBy(() -> service(new MockModelProvider()).generate(claim.taskId(), claim.token())).hasMessage("MODEL_BUDGET_UNKNOWN");
    }

    @Test
    void recordsActualUsageForInvalidPlanAndClassifiedProviderFailuresWithoutSuccess() throws Exception {
        var claim = claim("个人展示页");
        var usage = ModelProvider.Usage.from(mapper.readTree("{\"prompt_tokens\":31,\"completion_tokens\":17,\"total_tokens\":48}"));
        ModelProvider invalid = provider(new ModelProvider.Reply("{\"status\":\"READY\"}",
                new ModelProvider.Evidence("actual-model", "request-42", "response-42", usage)), null);
        assertThatThrownBy(() -> service(invalid).generate(claim.taskId(), claim.token())).hasMessage("PLAN_INVALID");
        UUID id = latest(claim.taskId());
        var db = artifacts.findModelCall(id).orElseThrow();
        assertThat(db.status()).isEqualTo(ModelCallStatus.FAILED);
        assertThat(db.inputTokens()).isEqualTo(31);
        assertThat(db.outputTokens()).isEqualTo(17);
        assertThat(db.errorCode()).isEqualTo("PLAN_INVALID");
        var audit = mapper.readTree(Files.readString(new ModelCallAudit(root).recordPath(id)));
        assertThat(audit.get("requestId").asText()).isEqualTo("request-42");
        assertThat(audit.get("actualModel").asText()).isEqualTo("actual-model");
        assertThat(audit.at("/usage/totalTokens").intValue()).isEqualTo(48);
        for (String error : java.util.List.of("MODEL_TIMEOUT", "MODEL_RATE_LIMITED")) {
            var another = claim("个人展示页");
            assertThatThrownBy(() -> service(provider(null, new ModelFailure(error))).generate(another.taskId(), another.token())).hasMessage(error);
            var failed = artifacts.findModelCall(latest(another.taskId())).orElseThrow();
            assertThat(failed.status()).isEqualTo(ModelCallStatus.FAILED);
            assertThat(failed.errorCode()).isEqualTo(error);
            assertThat(failed.inputTokens()).isNull();
        }
    }

    @Test
    void wrongExpiredCancelledAndMissingLeaseCannotStartCallAndUnsupportedInputHasNoCall() {
        var claim = claim("个人展示页");
        var calls = new AtomicInteger();
        ModelProvider counting = new ModelProvider() {
            public String id() { return "counting-mock"; }
            public String model() { return "fixture"; }
            public Reply call(Prompt prompt, int max, Duration timeout) { calls.incrementAndGet(); return new MockModelProvider().call(prompt, max, timeout); }
        };
        assertThatThrownBy(() -> service(counting).generate(claim.taskId(), UUID.randomUUID())).hasMessage("MODEL_LEASE_INVALID");
        assertThatThrownBy(() -> service(counting).generate(claim.taskId(), null)).hasMessage("MODEL_INVALID_INPUT");
        jdbc.sql("UPDATE generation_tasks SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=?").param(claim.taskId()).update();
        assertThatThrownBy(() -> service(counting).generate(claim.taskId(), claim.token())).hasMessage("MODEL_LEASE_INVALID");
        jdbc.sql("UPDATE generation_tasks SET status='FAILED', failure_code='CANCELLED',queue_state='FINISHED',lease_token=NULL,lease_expires_at=NULL WHERE id=?").param(claim.taskId()).update();
        assertThatThrownBy(() -> service(counting).generate(claim.taskId(), claim.token())).hasMessage("MODEL_LEASE_INVALID");
        var unsupported = claim("创建后端和支付服务");
        assertThatThrownBy(() -> service(counting).generate(unsupported.taskId(), unsupported.token())).hasMessage("PLAN_UNSUPPORTED_REQUEST");
        assertThat(calls).hasValue(0);
        assertThat(jdbc.sql("SELECT count(*) FROM model_calls WHERE task_id=?").param(unsupported.taskId()).query(Integer.class).single()).isZero();
    }

    @Test
    void inFlightAndCallLimitAreEnforcedAndFinalRecordsCannotBeOverwritten() {
        var claim = claim("个人展示页");
        var attempt = records.start(claim.taskId(), claim.token(), "fixture", "fixture");
        assertThatThrownBy(() -> records.start(claim.taskId(), claim.token(), "fixture", "fixture")).hasMessage("MODEL_CALL_IN_PROGRESS");
        var usage = ModelProvider.Usage.from(mapper.readTree("{\"prompt_tokens\":1,\"completion_tokens\":1}"));
        records.finish(attempt.callId(), null, usage);
        assertThatThrownBy(() -> records.finish(attempt.callId(), "MODEL_TIMEOUT", ModelProvider.Usage.unknown())).hasMessage("MODEL_RECORD_CONFLICT");
        for (int i=1; i<12; i++) {
            var next = records.start(claim.taskId(), claim.token(), "fixture", "fixture");
            records.finish(next.callId(), null, usage);
        }
        assertThatThrownBy(() -> records.start(claim.taskId(), claim.token(), "fixture", "fixture")).hasMessage("MODEL_BUDGET_EXCEEDED");
    }
    private UUID latest(UUID taskId) {
        return jdbc.sql("SELECT id FROM model_calls WHERE task_id=? ORDER BY created_at DESC, id DESC LIMIT 1")
                .param(taskId).query(UUID.class).single();
    }
    @Test
    void auditStorageFailureStartsNoProviderCallAndPersistsFailureWithUnknownUsage() throws Exception {
        var claim = claim("个人展示页");
        Path unavailable = Files.createFile(root.resolve("file-not-directory"));
        var calls = new AtomicInteger();
        ModelProvider counting = new ModelProvider() {
            public String id() { return "counting-mock"; }
            public String model() { return "fixture"; }
            public Reply call(Prompt prompt, int max, Duration timeout) { calls.incrementAndGet(); throw new AssertionError("no call expected"); }
        };
        var service = new PlanModelService(counting, validator, records, new ModelCallAudit(unavailable));
        assertThatThrownBy(() -> service.generate(claim.taskId(), claim.token())).hasMessage("MODEL_AUDIT_UNAVAILABLE");
        assertThat(calls).hasValue(0);
        var failed = artifacts.findModelCall(latest(claim.taskId())).orElseThrow();
        assertThat(failed.status()).isEqualTo(ModelCallStatus.FAILED);
        assertThat(failed.errorCode()).isEqualTo("MODEL_AUDIT_UNAVAILABLE");
        assertThat(failed.inputTokens()).isNull();
        assertThat(failed.outputTokens()).isNull();
    }

    @Test
    void twoConsumersCannotReserveTwoInFlightRequestsForOneTask() throws Exception {
        var claim = claim("个人展示页");
        try (var workers = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var ready = new java.util.concurrent.CountDownLatch(2);
            var go = new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.Callable<String> reserve = () -> {
                ready.countDown(); go.await();
                try { records.start(claim.taskId(), claim.token(), "fixture", "fixture"); return "REQUESTED"; }
                catch (ModelFailure failure) { return failure.code(); }
            };
            var first = workers.submit(reserve); var second = workers.submit(reserve);
            assertThat(ready.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            go.countDown();
            assertThat(java.util.List.of(first.get(5, java.util.concurrent.TimeUnit.SECONDS), second.get(5, java.util.concurrent.TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("REQUESTED", "MODEL_CALL_IN_PROGRESS");
            assertThat(jdbc.sql("SELECT count(*) FROM model_calls WHERE task_id=?").param(claim.taskId()).query(Integer.class).single()).isEqualTo(1);
        }
    }
    private ModelProvider provider(ModelProvider.Reply reply, ModelFailure failure) {
        return new ModelProvider() {
            public String id() { return "transport-fixture"; }
            public String model() { return "requested-model"; }
            public Reply call(Prompt prompt, int max, Duration timeout) { if (failure != null) throw failure; return reply; }
        };
    }
}
