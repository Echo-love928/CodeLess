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
