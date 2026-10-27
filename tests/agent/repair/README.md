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
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RepairLoopIntegrationTest#capturedWrappedDoneStopsWithoutUnwrappingOrRetry+capturedPatchIsVerifiedWithoutACompletionRequestWithinOriginalBudget,ProtocolRepairPreviewIT' '-DreuseForks=false' '-DforkCount=1' test
pnpm ci:gate
```

D24-A round 2 renamed these two cases (formerly
`capturedWrappedDoneStopsAfterActualPatchWithoutUnwrappingOrRetry` and
`capturedPatchAndSyntheticExactCompletionRebuildWithinOriginalBudget`, the names in the
2026-10-11 evidence) because no request now follows an actual patch: the wrapped
reply is replayed at the first REPAIR request, and the recorded patch is verified
by the host without the synthetic completion. The paragraph below describes the
2026-10-11 behaviour; see the round-2 section at the end.

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

## D24-A round 2: CAT-01, CAT-03 and FAULT-CODE-02 of batch 1ff42488 (2026-10-26)

`RepairBudgetRegressionTest` reproduces the three paid REPAIR failures that B
reviewed in `2026-10-26T00-56-31Z-real-1ff42488`. A single fixed synthetic policy
reads the files it wants while a request offers reads, writes one whole-file patch
of the failing page, and answers any further request with the task's recorded reply
type. Requests cross the production DeepSeek wire (`MaxTokensWireFixture`) to a
loopback server that cuts a reply at `max_tokens` with `finish_reason=length`, as
the provider does. Usage is declared synthetic: 0.3 token per UTF-8 byte, an
estimate that is never measured. No paid model is called. PostgreSQL, file tools,
the failed and fixed Docker builds and the browser are real.

The same two files, byte-identical, run on the pre-fix tree `f208767` and on the
fix:

```powershell
Remove-Item Env:CODELESS_MODEL_API_KEY,Env:CODELESS_MODEL_NAME -ErrorAction SilentlyContinue
$env:CODELESS_MODEL_PROVIDER='deterministic-mock'
$env:CODELESS_REGRESSION_TREE='<label>'; $env:CODELESS_REPAIR_EVIDENCE_DIR='<directory>'
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RepairBudgetRegressionTest' test
```

On `f208767`: CAT-01 fails with AGENT_MODEL_BUDGET_EXCEEDED after three legal reads,
CAT-03 with MODEL_INVALID_RESPONSE / FINISH_REASON_LENGTH at a 1,104-token allowance
below the 1,361-token patch, and FAULT-CODE-02 with AGENT_MODEL_PROTOCOL_INVALID on
the json_object reply after its successful write. On the fix all three are READY
after one REPAIR request with the full 4,096 allowance and a real rebuild/browser
pass. Both controls (json_object before any write; a patch above 4,096) fail the
same way on both trees. CAT-01 and CAT-03 enter REPAIR at a synthetic 28,500 and
33,600 charged tokens. Content-free results and file digests are in
`evidence/2026-10-26/d24-a-round2/`. This is not model-quality evidence.

The opt-in preview ITs with a REPAIR fixture no longer see a request after the
patch: `ProtocolRepairPreviewIT` expects 8 model calls (was 10),
`RecordedRepairPreviewIT` 9 (was 12), and `FaultAtFreezePreviewAcceptanceIT`, which
`ApplicationHttpDiagnosticsIT` extends, 6 (was 7). Three of these ITs fail on
`f208767` and on the fix at the same file, line and value, so the cause is not this
change:

- `RealSourcePreviewReplayIT`: the deployment-name pattern in
  `tests/e2e/generation/platform-cleanup.mjs:17` rejects `preview-platform-replay-…`.
- `RecordedRepairPreviewIT`: the recorded `ProfileCard.vue` has no
  `data-ai-component` (`MISSING_COMPONENT_ID`). As a result `profile-card` is not
  selectable in the component-selection check that the default acceptance script
  runs (`tests/runner/mapping/platform-checks.mjs:14`). The IT stops before its Java
  assertions, but the journal of the fixed run matches them.
- `RepairPreviewPlatformAcceptanceIT`: line 37 expects one generation task, but
  that check's component edit adds a second one.

## D24-A round 3: read-gate tests no longer depend on prompt line endings (2026-10-26)

B's review of `f35bea1` found that CI (`verify:api` on ubuntu-24.04) failed two round-2
tests in `RepairLoopIntegrationTest` that pass on a Windows checkout:
`repairReadThatTheRequestDoesNotOfferCannotConsumeAFileTool` and
`capturedPatchIsVerifiedWithoutACompletionRequestWithinOriginalBudget`. The cause:

- The repository has no `.gitattributes`. With `core.autocrlf=true` Windows checks
  the prompts out as CRLF, so the 20-line REPAIR prompt is 20 bytes longer there.
- The input reservation counts UTF-8 bytes, and the read rule counts the input
  twice (this request and the next). Every REPAIR read decision therefore has 40
  more tokens of margin on LF.
- In the 720f replay, the second REPAIR request missed the read by 30 tokens as CRLF
  and funded it with 10 to spare as LF, so CI replayed the recorded read 7.

Both decisions follow the production rule. The tests had pinned a margin smaller
than the line-ending shift.

Both tests now reserve six tool slots at GENERATE's recorded done, before the
failed build, so REPAIR starts with 15 of the 20 slots used:

- The first REPAIR request has five left and offers the recorded read 6.
- After that read four are left, below the five the read rule needs, so the second
  request offers no read on either line ending.

The tests assert those counts (`toolCallsRemaining` 5, 4) and offers directly. Every
earlier assertion stays. Only the tool-slot totals move by six, to 16 and 20. No
production code changed.

A test that depends on whether a read is offered should pin the decision with an
exact count (tool slots, model calls), not with a token margin within 40 tokens of
the rule. Where usage is declared per byte, as in `RepairBudgetRegressionTest`, the
shift is larger.

A temporary print (never committed) logged every REPAIR read decision on both line
endings. The content-free numbers are in
`evidence/2026-10-26/d24-a-round3/read-gate-margins.json`.

`evidence/2026-10-26/d24-a-round3/pre-fix-f208767-lf.json` reruns the round-2
regression class on the pre-fix tree with LF resources. CAT-01, CAT-03 and
FAULT-CODE-02 fail with the same codes as on CRLF, and both controls fail the same
way, as their tests expect. So that evidence holds on CI's line endings too. Only
the numbers move a little; for example, CAT-03's last allowance goes from 1,104 to
1,137, still below its 1,361-token patch.

To check on LF from a Windows checkout, as B did, in Git Bash:

1. Check that the text resources the API build copies have no local changes.
   Step 4 restores them from Git and would discard any, so the snippet stops
   without touching anything if `git status` lists one of them.
2. Convert only those files to LF.
3. Run the tests.
4. Delete and check out the converted files again. Under autocrlf, `git diff`
   shows no change for a CRLF-to-LF edit, and a plain checkout may keep LF;
   deleting first makes the checkout rewrite them.

If a run stops before step 4, the converted files differ only in line endings, and
`git status` lists them, so the next run would stop at step 1. Run the snippet's
`files=...` line and its `rm ... && git checkout ...` line by hand to restore them.
To check files that do have local changes, commit or stash those changes first, or
run the snippet in a separate checkout from `git worktree add --detach`; there
`prepare-runtime.mjs` installs the pnpm dependencies on the first run.

The shell `mvnw` is itself checked out as CRLF, so the snippet calls `mvnw.cmd`
through cmd:

```bash
unset CODELESS_MODEL_API_KEY CODELESS_MODEL_NAME; export CODELESS_MODEL_PROVIDER=deterministic-mock
files=$(git ls-files 'prompts/runtime/*.txt' contracts/tools/registry.json 'contracts/plan/*.json' services/api/src/main/resources/model/prompts/agent-proposal-protocol-v1.txt)
if [ -n "$(git status --porcelain -- $files)" ]; then
  git status --short -- $files
  echo 'Stopped: these files have local changes that the restore step would discard.' >&2
else
  sed -i 's/\r$//' $files
  cmd.exe //d //c "services\api\mvnw.cmd -f services/api/pom.xml \"-Dtest=RepairLoopIntegrationTest,RepairBudgetRegressionTest\" test"
  rm $files && git checkout -- $files
fi
```

## D24-A round 5: dba59d9d action context and owner priority (2026-10-27)

The delivery at PR #70, fixed commit `231ea3dbcf10da6161cafe06ee5243bef34676cd`,
was independently checked: ZIP/README outer checksums, 203 manifest-covered files
(204 archive entries including the manifest), 163 journal events and 17 correlated
calls. Only content-free counts and synthetic regressions are committed here;
the package, original source, patches and journals remain private local inputs.

Two A-side context gaps are addressed: compacting the completion proposal lost
the interactions preceding a conditional target, and route-first source seeding
could omit the component owning that target. REPAIR also lacked GENERATE's
unique-target and exact-inner-text semantics. The fix supplies a correlated
`failure.actionContext`, preserves it during compaction, and prioritizes an
existing static target/component owner among already-planned frozen files that are
reachable through relative imports from the failed route. A component outside
that graph with the same marker must leave the route page first.

`RoundFiveContextTest` (7 cases) and `RoundFiveRegressionTest` (4 cases) are identical
on the old d2b20a7 tree and the repaired tree. The two Java files and synthetic
syntax fixture have matching SHA256 on both trees. The initial b560131 pair is in
`d24-a-round5/manifest.json`; the final queue-safe fixture pair is in the adjacent
`d24-a-round5-queue-fixture/manifest.json`.

| Scenario | d2b20a7 | Repaired tree |
| --- | --- | --- |
| CAT-02 shape: missing title target, entire-container text mismatch, missing conditional detail | Four builds exit 0, all browser checks fail; three repairs, `AGENT_REPAIR_LIMIT_EXCEEDED` | Two repairs; all three builds exit 0, final browser PASSED; original actions unchanged |
| EDIT-02 shape through real component edit: absent marker, three shared matches, then unchanged bare done | Three builds exit 0; `AGENT_REPAIR_NO_PROGRESS` after two repairs | One repair; both builds exit 0, final browser PASSED, all three original heading assertions pass; only selected source file changes |
| TASK-03 strict-rejection control | `MODEL_INVALID_RESPONSE / SYNTAX`, 488 UTF-8 bytes, UTF-16 column 423, no retry/freeze/build | Identical strict rejection |
| Unchanged bare done control | `AGENT_REPAIR_NO_PROGRESS`, same candidate digest and original actions | Identical strict rejection |

Old suite: 11 tests, 6 expected failures (4 context assertions plus CAT-02 and
EDIT-02), no errors. Repaired suite: 11/11 pass. The additional unmounted-owner
case is a negative control. The initial Docker-unavailable
attempt is an environment failure, not a regression reproduction; its private
log hash is retained separately from the successful old-tree execution.

The syntax fixture is synthesized from redacted punctuation/key spans and string
lengths, including eight synthetic BMP characters to preserve UTF-8 byte length.
No original string values are copied. It reproduces the parser failure position,
not the original reply digest or a recoverable response. The provider had already
been asked for a JSON object; strict rejection is correct. No code change claims
to repair TASK-03's provider violation.

The fixed model policy reacts to actual action semantics/prerequisite fields and
the first seeded owner. Usage is declared at 0.3 token/UTF-8 byte (an estimate,
not a measurement); every response crosses the production DeepSeek wire to a
loopback fixture. PostgreSQL, digest-checked file tools, immutable component edit
scope, Docker/Vue builds and Chromium are real. The synthetic CAT-02 holds both
files in context; it covers owner priority and original browser failure shapes,
not B's exact token amounts or omitted-file count. These tests do not establish
that a real model will follow the new context. Paid calls: 0. The original failed
batch is unchanged; any new real-model validation requires separate authorization.

Run both test classes with JDK 21/Node 24.22.1 and a running local Docker engine:

```bash
unset CODELESS_MODEL_API_KEY CODELESS_MODEL_NAME
export CODELESS_MODEL_PROVIDER=deterministic-mock
cmd.exe //d //c "services\api\mvnw.cmd -f services/api/pom.xml \"-Dtest=RoundFiveContextTest,RoundFiveRegressionTest\" test"
```

Optional `CODELESS_REPAIR_EVIDENCE_DIR` and `CODELESS_REGRESSION_TREE` label private
run outputs. Public aggregate results are in
`evidence/2026-10-27/d24-a-round5/`; raw source, wire bodies and browser captures
must not be copied into that directory.

The first full API gate exposed a fixture ordering issue: the edited task stayed
PLAN while the global scheduler served another queued task with this test's wire
policy. This is not an edit-repair outcome. The final fixture moves only its own
selected task ahead of queued work, checks the original claim's task ID, delegates
the real atomic advance, and cleans up only its own unfinished fixtures. EDIT-02
also deliberately queues another task and asserts it remains QUEUED/unleased with
zero model calls before teardown. No queue reset, extra Spring property set or
production scheduler change is used. The final unchanged old-tree pair still has
11 tests / 6 expected failures, while the repaired focused suite passes 44/44.
The initial API reports, including PLAN, remain in the adjacent queue-fixture
evidence directory; the b560131 gate record remains FAILED.
