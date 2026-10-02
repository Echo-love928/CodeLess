# D07-A plan and model boundary

`plan.schema.json` is an internal, additive **plan v1** contract, not a new public HTTP endpoint. All objects are closed. It requires template `VUE`, data mode, pages, components, intended files, browser acceptance actions and explicit disabled capabilities. `fixtures/invalid/cases.json` contains JSON-pointer mutations of the valid fixture and is consumed by both Ajv and the Java runtime test.

The runtime also enforces fixed route/file pairs from the existing template, file references, component/file names, case-insensitive path uniqueness, unique acceptance IDs and acceptance coverage for every declared route. It rejects duplicate JSON keys, trailing values and Markdown wrappers. The small Java schema evaluator fails startup on unsupported schema keywords rather than silently ignoring a future constraint. No generated source is accepted or executed here.

The path grammar matches D05's source policy: `src/pages/*.vue`, `src/components/*.vue`, `src/data/*.ts`, ASCII basename, no nesting. Package, lock, config, router, main, absolute and traversal paths cannot be planned. Page routes are `/`, `/tasks`, `/catalog`; adding routes or dependencies requires a separately maintained template/contract change.

Explicit unsupported requests receive `PLAN_UNSUPPORTED_REQUEST`. A conservative keyword check rejects common backend/payment/external-service/dependency/framework requests before a provider call. The system prompt requires a rejection object for unsupported intent. This check is not a complete natural-language security classifier: the schema closes capabilities and the final source/runner/browser boundaries must independently enforce permissions. Task text, model text, logs and comments cannot expand those permissions.

## Provider and usage

- Default/CI provider: **`deterministic-mock`**, model `plan-fixture-v1`. Stable fixture response, unknown usage; never evidence of real model quality.
- Single real provider: **`deepseek`**, fixed HTTPS chat-completion endpoint. No endpoint override, redirects, provider fallback, retries, streaming or tools. Spring AI **2.0.1** supplies typed system/user messages; JDK HTTP preserves raw provider usage so missing counters never become Spring AI default zeros. All frozen versions remain unchanged.
- Local environment: `CODELESS_MODEL_PROVIDER=deepseek`, `CODELESS_MODEL_API_KEY`, `CODELESS_MODEL_NAME`; model name is explicit rather than an unverified alias. Never commit a key. DeepSeek's [chat-completion contract](https://api-docs.deepseek.com/api/create-chat-completion/) defines JSON mode and response usage; [Spring AI messages](https://docs.spring.io/spring-ai/docs/current/api/org/springframework/ai/chat/messages/SystemMessage.html) define the typed prompt boundary.
- Credentials must be a nonempty ASCII bearer token, at most 4096 characters, with no whitespace/control characters. Invalid configuration is rejected before constructing Authorization or making a request; exceptions contain only `MODEL_CONFIGURATION`, without a JDK cause that could echo headers. The real acceptance CLI writes a BLOCKED preflight and exits 2 for invalid configuration.
- Every call has a local UUID, requested model, provider, actual response model when supplied, provider request ID (`x-request-id`, otherwise response ID), separate response ID, measured elapsed milliseconds, status, safe error code and timestamps. Missing provider identifiers remain null. No provider body, key or user prompt enters audit metadata.
- `prompt_tokens`, `completion_tokens`, `total_tokens` are copied only when present and valid nonnegative integers. Null/absent/partial usage stays null. Raw usage preserves cache/reasoning fields; no total is inferred by addition. A real reported zero remains zero.
- Errors include `MODEL_TIMEOUT`, `MODEL_RATE_LIMITED`, `MODEL_AUTHENTICATION`, `MODEL_UNAVAILABLE`, `MODEL_NETWORK`, `MODEL_INVALID_RESPONSE`, `MODEL_INVALID_USAGE`, `MODEL_RESPONSE_LIMIT`. Truncation, empty output, tool calls and invalid plans fail. Actual usage obtained with an invalid plan remains charged and recorded.
- Safe request IDs are captured when response headers arrive. Non-200 status classification is preserved and the body subscription is cancelled immediately; an unfinished error body cannot turn an observed 429 into a timeout. Usage remains unknown for these responses. A successful HTTP response whose body later times out retains its safe header request ID.

## D05/D07-B integration

`PlanModelService.generate(taskId, leaseToken)` is an **internal producer**. `ModelCallRepository.start` locks the task, checks the current PLAN lease using database real time, loads stored prompt/data mode, and serializes reservations. It permits one outstanding call, at most 12 recorded attempts, and rejects exhausted known usage (50000 tokens) or any prior unknown usage. HTTP is outside the DB transaction. The service caps a PLAN call at 2048 output tokens, 60 seconds and the remaining task deadline. This is not the full workflow/repair budget coordinator: the enabling PR must reserve the next request's input/output budget and enforce all stages, tools, repair rounds and the 12-minute deadline; a current-total check alone cannot prevent a final call crossing 50000 tokens.

The result is a validated `Candidate(callId, plan)`, never READY and never source/build/browser success. The final enabling adapter must persist/source-generate the approved plan, fence late/cancelled results with D05 `queue.advance`, validate each source bundle and consume D07-B's real build result and real browser assertions. `TaskStageRunner` remains unchanged and honestly unavailable in this PR. This service must not be called inside a transaction that could roll back a charged external call.

There is a concrete internal integration delta: the existing `TaskStageRunner.execute(taskId, stage)` does not carry the original claim token. The enabling coordinator must pass the original `TaskQueueService.Claim.token` into the PLAN producer (through a reviewed execution-context addition or trusted composition). A late worker must never reload a newer token by task ID and impersonate the current lease. D07-B's standalone source-directory/build-result contract is unchanged by this delta.

## Persistence without a shared migration

Existing PostgreSQL `model_calls` records stage/provider/requested model/status, nullable input/output usage, error and completion time. Request/response IDs, actual model, monotonic duration, total/raw usage and validated plan are atomically written to a **private platform audit volume**, keyed only by generated UUID. Configure `CODELESS_MODEL_AUDIT_ROOT` (default `.local-data/model-calls`); it must be durable, access restricted and never mounted into generated-code containers. No public model-call endpoint is added.

An audit outage stops the call or produces a failed DB record with whatever usage is known. Completed DB rows are immutable through the repository. DB and filesystem are not one transaction: audit completion is written first, and a DB failure leaves `REQUESTED` as unknown. After a crash or conflicting files, treat the DB row as authoritative for orchestration, preserve measured provider evidence, and do not silently turn pending into success/zero. A platform audit recovery/retention policy and DB columns for these metadata are follow-up work for the registered migration maintainer. This PR neither claims cross-store atomicity nor allocates a shared migration number.

## Reproducible acceptance

```powershell
node --test tests/model/plan-schema.test.mjs
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=PlanValidatorTest,DeepSeekModelProviderTest,PlanAcceptanceCliTest,PlanModelIntegrationTest' test
pnpm ci:gate
tests/model/run-real-plan.ps1
```

Java 21, frozen Node/pnpm and running Docker are required for API/runner gates. Java model tests run in the existing `verify:api`/CI entry; Ajv tests are an additional explicit command and do not edit the shared static entry. The real CLI loads the packaged schema/prompt and the same adapter/validator. It makes at most **one** real request, **2048** output tokens, **60 seconds**, never mock/fallback/retry. Success saves `t4-result.json` and `<callId>.plan.json`; missing credentials saves `t4-preflight.json` with BLOCKED and exits **2**; a real failure exits **1** with actual evidence. Runtime usage is separate from development-agent usage.

If a validated plan cannot be saved, the CLI records FAILED / MODEL_AUDIT_UNAVAILABLE and exits 1 while retaining the already received actual model, request/response IDs and actual usage. The plan-storage error never replaces successful provider evidence with unknown counters. Its package-private test entry accepts a deterministic local provider and UUID solely to reproduce filesystem conflicts; the public CLI remains real-provider only. Regression tests use synthetic keys/local HTTP and incur no paid model requests. English negation requires complete `no`/`without` words and whitespace before a complete target word; `casino backend` cannot be mistaken for `no backend`.
