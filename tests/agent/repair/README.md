# D10-A repair acceptance

All provider responses in `RepairLoopIntegrationTest` are explicitly named fixtures.
PostgreSQL 17.6, file tools, immutable snapshots, Docker compilation and Chromium
verification are real. These results prove controller behavior, not model quality.

From the repository root with the frozen Java/Node/pnpm toolchain and Docker:

```powershell
$env:CODELESS_MODEL_PROVIDER='deterministic-mock'
$env:CODELESS_REPAIR_EVIDENCE_DIR="$pwd/.local-data/d10-a/evidence"
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RepairPolicyTest,RepairLoopIntegrationTest' test
pnpm ci:gate
node tests/agent/repair/export-evidence.mjs
```

The tests are discovered by the existing API gate. T1/T4 really fail compilation
on an import of MissingCard.vue, read its actual source, apply a digest-guarded
update to ProfileCard.vue and rebuild/reverify. Evidence exports both source
candidates after checking every byte, the original compiler error, successful
browser report and PNG. T2 exercises four real failed builds with three changed
sources, and two failed builds with unchanged source. T3 drives production budget
refusals and cancellation/deadline expiry during REPAIR. Infra and model network
errors never trigger additional code edits; changing acceptance actions is rejected.

Paid evaluation is separate, uses existing environment credentials only in the API,
and is not selected by default CI:

```powershell
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RealPreviewPlatformAcceptanceIT' test
```

Actual outcomes and remaining M1/integration limitations are in `docs/handoffs/D10-A.md`.

## Recorded M1 read-loop regression (zero paid requests)

The immutable PR #29 task `45d37a80-c152-4672-9c0c-1fcf425fa014` is the input to
`RepairContextTest` and `RecordedRepairFixture`. The original Windows policy is
kept byte-for-byte in `fixtures/m1-repair-policy-before.txt`: the regression
reproduces reservations 12,332 / 13,962 / 15,458 / 17,089 and the refusal of the
next 18,720-token request with 18,404 remaining. The original FAILED result is
preserved.

Run the current controller and original same-task platform acceptance with all
paid credentials removed from this process:

```powershell
Remove-Item Env:CODELESS_MODEL_API_KEY,Env:CODELESS_MODEL_NAME,Env:CODELESS_M1_REAL_APPROVED -ErrorAction SilentlyContinue
$env:CODELESS_MODEL_PROVIDER='deterministic-mock'
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RepairContextTest,RepairPolicyTest,RepairLoopIntegrationTest,RecordedRepairPreviewIT' '-DreuseForks=false' '-DforkCount=1' test
corepack pnpm ci:gate
```

The first ten replies replay recorded proposals and prior usage, not new provider
measurements. The eleventh reply supplies a declared synthetic patch with a
5,180-token charge; the twelfth `done` has unknown usage and is charged its full
conservative reservation. Real PostgreSQL, digest-guarded writes, failed Docker
build, repaired immutable snapshot, new Docker build, Chromium actions and
authenticated signed preview use one task. The original actions and all runtime
limits remain unchanged. `RecordedRepairPreviewIT` is opt-in and never calls a
paid provider. Its log gives the exact `target/preview-platform-*/evidence`
directory; `D10-A-recorded-context.json` contains the full journal and budget.

Default API regressions also assert that a further unchanged read stops with
`AGENT_REPAIR_NO_PROGRESS`, and unknown patch usage consumes the full reservation
and refuses `done` when insufficient budget remains. No text is truncated to make
a request fit. The model sees one current observation per tool/path and a current
source manifest; original full receipts stay in the durable journal. After an
actual source change, old read text is marked stale until a real reread.

The exported current run, source diff, original-budget replay, cleanup reports and
digest manifest are in `evidence/2026-10-10/repair-context/`. These deterministic
results prove controller feasibility for the stated usage scenario. Real model
patch/done behavior and paid M1 remain unaccepted; a new paid task requires new
authorization.

## PR31 complete protocol-error regression (zero paid requests)

The immutable PR #31 task `17f440cf-7970-46cc-b598-dd2d91a20ade` ended with the
complete reply `{"type":"json_object","error":"Invalid protocol reply."}`.
Default `RepairLoopIntegrationTest` replays all nine recorded proposals through
the production DeepSeek serializer, loopback HTTP and response parser. It asserts
FAILED / AGENT_MODEL_PROTOCOL_INVALID, 9 calls / 11 tools / 28,515 recorded
tokens, no retry, no repair done and no ready version. These are replayed prior
usage values, not new provider measurements. The original paid failure remains.

`ProtocolRepairPreviewIT` replays the first eight proposals, then supplies a
declared synthetic patch (5,180 tokens) and an unknown-usage done charged at the
full conservative reservation. It runs the unchanged original
`tests/e2e/generation/m1-platform.acceptance.mjs` in its recorded-source-replay mode
(the actual provider remains explicitly deterministic-mock):
real PostgreSQL, files, Docker build failure, repaired snapshot, rebuilt app,
Chromium, same-task signed preview, refresh/restart/revocation and isolation.
The browser-created request text is that script's mock variant; the recorded
source and original generation/repair acceptance actions are unchanged.

```powershell
Remove-Item Env:CODELESS_MODEL_API_KEY,Env:CODELESS_MODEL_NAME,Env:CODELESS_M1_REAL_APPROVED -ErrorAction SilentlyContinue
$env:CODELESS_MODEL_PROVIDER='deterministic-mock'
corepack pnpm ci:gate
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=ProtocolRepairPreviewIT' '-DreuseForks=false' '-DforkCount=1' test
```

REPAIR now owns its complete operation protocol and guides patching after a
successful read. Strict parsing, original actions and runtime limits remain.
Private `model.input` journal events contain policy/input SHA256, UTF-8 lengths,
message roles and transport-body SHA256/format/options, never prompt text or
Authorization. Provider metadata serialization is pure and makes no request;
unavailable metadata stays UNAVAILABLE. The paid test wrapper forwards the same
metadata but retains its existing paid-authorization guard.

The new evidence directory is `evidence/2026-10-10/repair-protocol/`. Offline
loopback bodies are explicitly labeled; PR31's actual historical wire body was
not captured and the model's internal cause remains UNKNOWN. Offline legal
patch/done success does not establish model quality or close real M1. A new paid
test requires B review and renewed authorization.

The additional legacy `RecordedRepairPreviewIT` failed after resident restart
and platform reload in this turn; its failure, journal and cleanup remain in
`earlier-failures/`. Its root cause is UNKNOWN. A successful PR31 replay must not
be used to close that independent failure.

### Follow-up correction and complete private capture

The preceding legacy-failure description refers to the **first** selected run.
The second selected run actually passed `RecordedRepairPreviewIT` 1/1; that
suite failed only `ProtocolRepairPreviewIT` in the wrong CLI mode. The prior
handoff incorrectly labeled both tests failed. Corrected first/second JUnit,
task provenance and recorded runtime are appended in `blocker-followup/`;
the original artifact bytes remain unchanged. A further original-flow run of
`ApplicationHttpDiagnosticsIT,RecordedRepairPreviewIT` passes 2/2 and correlates
auth/me ingress timings with API diagnostic IDs. The original historical cause
remains UNKNOWN, rather than being declared fixed by a passing run.

Future authorized `RealRepairPreviewPlatformAcceptanceIT` uses test-only
`PrivateModelCapture`. `target/real-preview-platform-*/private/model-wire/`
contains 01-request.json / 01-result.json through at most 12 calls. Requests
use the same production body serializer and retain exact bytes; results retain
the complete application reply content and available usage, including illegal
replies and transport failures. No headers or keys are captured; these private
task texts must be reviewed before any export. Capture failure before dispatch
stops without a request, and result-write failure preserves measured usage.
No paid approval guard, runtime limit, retry, transport or proposal parser is
changed. This prevents another paid failure being archived without its input.

### PR32 duplicate-field reply regression (2026-10-11)

B's paid task `17cc6cb9-ee15-4919-bea9-95be983aebe4` returned a ninth reply with
duplicate root `type` keys. It correctly failed with `MODEL_INVALID_RESPONSE`
before `files.update`; real M1 remains NOT_PASSED and its single paid approval
has been consumed. No paid request is made by these regressions.

`fixtures/m1-17cc-duplicate-type.reply.txt` preserves all 2,575 reply bytes,
including the duplicate keys. Its SHA-256 is
`fc95b76a31290ead31dc73d7123a208f01572a11a74bc7eafdc5981339fceb7a`,
matching B's actual private reply digest. The fixture was recovered from B's
public frozen HomePage source and the operation envelope, rather than copied
from the unavailable private capture. Provenance records the immutable B
evidence commit `d273a999cf805915a5723f137769b6d706a179d4` and usage separately.

`DuplicateTypeRepairFixture` uses the prior PR31's first eight recorded replies
as setup, this exact final reply, and the nine recorded 17cc usage entries.
It is **not** a replay of the private 17cc requests or first eight responses.
Production serialization/loopback HTTP/AgentModel parsing reject the full reply,
retain 9 fixture calls/11 tools/29,340 replay tokens, and perform no repair
update/done/new candidate/READY. Synthetic cases additionally reject different
and identical duplicate root values and duplicate argument paths.

REPAIR policy now describes only the business tool/done root forms and unique
keys. The provider's JSON response format remains unchanged. Removing the
transport vocabulary from the prompt is an input correction; its causal effect
on real model behavior remains unproven. The exact original request body is
still private and has not been read in this A workspace.

Run the focused regression with the pinned Java 21 environment, Docker ready,
provider `deterministic-mock`, and no model key/name/M1 approval:

```powershell
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RepairLoopIntegrationTest#exact17ccDuplicateReplyIsRejectedBeforePatchAndKeepsCompleteMeasuredUsage,ProtocolRepairPreviewIT' '-DreuseForks=false' '-DforkCount=1' test
corepack pnpm ci:gate
```

The signed-preview success in this command is the original PR31 deterministic
setup with synthetic patch/unknown done usage and unchanged eight actions. It
does not execute the invalid 17cc suggestion or establish paid model quality.
# Latest paid wrapped-done failure and offline regression (2026-10-11)

The single authorized real task `720fdce9-dda0-42d4-b7f7-b96cc020462f` on
`3c349f55c5d860115cf50a76f82c1db70e7fe97b` actually applied a digest-guarded repair,
then reread two files and returned a wrapped completion. M1 remained NOT_PASSED:
FAILED / AGENT_MODEL_PROTOCOL_INVALID, 12 requests / 14 tools / 36,844 measured
tokens. The last 657-byte application reply is preserved in
`fixtures/m1-720f-wrapped-done.reply.txt`, SHA-256
`13f75160960d41e2bdd45c3ab9221cb4126ed072e320ef5e57885ed2d8ba28e6`.
`m1-720f-proposals.json` contains normalized test proposals, recorded usage and
actual tool observations; its 24-file private wire manifest exports no complete
request or capture envelope. It does not represent a new provider evaluation.

Reproduce without credentials, with the D01 environment and Docker:

```powershell
Remove-Item Env:CODELESS_MODEL_API_KEY,Env:CODELESS_MODEL_NAME,Env:CODELESS_M1_REAL_APPROVED -ErrorAction SilentlyContinue
$env:CODELESS_MODEL_PROVIDER='deterministic-mock'
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RepairContextTest,RepairPolicyTest,DeepSeekModelProviderTest' test
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RepairLoopIntegrationTest#capturedWrappedDoneStopsAfterActualPatchWithoutUnwrappingOrRetry+capturedPatchAndSyntheticExactCompletionRebuildWithinOriginalBudget,ProtocolRepairPreviewIT' '-DreuseForks=false' '-DforkCount=1' test
pnpm ci:gate
```

The negative case replays the complete invalid application reply and stops after
the real patch without unwrapping it, accepting it, or issuing a thirteenth call.
The positive case replays the first nine proposals and uses an explicitly synthetic
legal completion with unknown usage charged conservatively; PostgreSQL, tools,
rebuild and browser assertions are real. The platform test retains the earlier
PR31 setup and its original same-task preview actions. Neither positive fixture
proves the real provider now follows the completion protocol. Historical failures
and their metering remain unchanged; the model's internal wrapper cause is UNKNOWN.

## Real M1 closure on 2026-10-11

The explicitly authorized paid evaluation passed on source candidate
`14e3f32337477fbb5a51ec8e3acf35150d4e624b`, task
`201b3882-30a8-4ac9-b0ac-cf3c024eabdf`: real PLAN/GENERATE, disclosed host-injected
missing import, actual Docker TS2307 failure, real REPAIR writes and legal root
done, a new immutable version, successful rebuild/Chromium, and authenticated
same-task signed preview including restart/refresh, isolation and revocation.
The original six actions are unchanged. Limits remain 3 rounds / 12 requests /
20 tool slots / 50,000 charged tokens / 12 minutes. Actual usage: 12 requests,
17 global tool budget slots, input34,322/output2,729/total37,051 measured tokens,
one repair round, no outer retries. Only one of the newly authorized maximum two
tasks was executed; no second paid task is needed.

Reproduce only with a new explicit paid authorization, existing API-only provider
credentials, frozen toolchain, Docker and the prepared runner/browser:

```powershell
$env:CODELESS_M1_REAL_APPROVED='1'
$env:CODELESS_MODEL_PROVIDER='deepseek'
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RealRepairPreviewPlatformAcceptanceIT' '-DreuseForks=false' '-DforkCount=1' test
```

The test refuses absent authorization, captures the complete wire privately,
checks authoritative SQL/actual runner artifacts and the original actions, and
prints the exact owned evidence root. Its result was exit0, 1/1, no skips. Public
verified source, compiler diagnostic, browser result, screenshot, usage, cleanup
and private-wire digests are in `evidence/2026-10-11/closure/`. Complete requests,
provider capture envelopes and private preview credentials are not exported.
This proves one controlled missing-component evaluation, not a model success
rate or a historical internal root cause. All prior budget, protocol, Windows,
TCP/TLS/504/OOM failure records retain their original outcomes. The latest final
stage gates and consolidated peer handoff are recorded in `docs/handoffs/D10-A.md`.

The separate offline gateway-clock regression runs with
`node --test tests/agent/repair/gateway-clock.test.mjs`: a future-issued credential
returns 403, a valid credential for an unmapped app returns 404, and expiration
returns 403 against the actual gateway. Its signing key and absent artifact
mapping are explicit fixtures. The four-line patch under `maintainer-proposals/`
was explicitly authorized and applied to the shared preview test; it binds both
additional signatures to the gateway's injected clock without changing any
production rule or assertion. Both prior failed full gates remain in the closure
command evidence; the final gate result is recorded separately.
