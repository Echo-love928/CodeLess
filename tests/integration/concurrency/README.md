# D20-A concurrency, idempotency and version consistency

`services/api/src/test/java/dev/codeless/api/concurrency/ConcurrencyConsistencyTest.java` runs in `pnpm verify:api`
(and therefore in `ci:gate`). It starts its own PostgreSQL 17.6 container, so every run begins from an empty
database and every invariant is checked over **all** rows the run produced, not only the rows a test remembered.

## What is real and what is a fixture

| Real (production code) | Explicit fixture |
| --- | --- |
| HTTP through embedded Tomcat, sessions, CSRF, ownership | Stage runner `ConcurrencyHarness.StageRunner`: no model call, no Docker build, no browser |
| Task queue, claims, short leases, heartbeat, three `TaskScheduler` instances | Runner result handed to the READY commit (artifact derived from the frozen source bytes) |
| File tools (lease-fenced writes), `AgentRunStore.draft` / `complete` / `failedBuild` / `abandonDraft` | Hosting gateway `ConcurrencyHarness.Hosting` (immutable per-publication location; the probe re-hashes what it served) |
| Version store (freeze, outcome, hashes), draft convergence, restore, edits | `ConcurrencyHarness.StoreGate`: a proxy in front of the production store that can pause one freeze, or (stress runs only) slow every freeze |
| Publication request, two worker instances over one ledger volume, deployment ledger | |

The fixture output proves concurrency, idempotency and consistency only. It never proves a real build, browser
check, public hosting or model quality; those are covered by `AgentLoopIntegrationTest`, `PublicationIntegrationTest`
and the D20-B full-product gate.

## Cases

| Card item | Test | Property |
| --- | --- | --- |
| D20-A-01 | `d20a01DuplicateSubmissionsToOneApplicationRunOnceEachInOrder` | 12 same-key clicks from two tabs → 1 task; 5 unkeyed → 5 tasks; edit while queued and changed prompt → 409; three schedulers run each stage of each task exactly once, never two tasks of one application at a time, in submission order. Then 6 same-key edit clicks race 6 generations: exactly one side wins, the other side gets `409 EDIT_TASK_ACTIVE`. |
| D20-A-T2 | `d20aT2CancelRacingTheReadyCommitNeverOverwritesTheSuccessfulVersion` | 16 rounds (edit and generation): owner tab 1, owner tab 2 and an administrator cancel against the production READY commit, cancel-first, commit-first and released together with the commit offset 0–21 ms. Winner decides everything; a cancelled candidate is FAILED with a `CANCELLED` report, no build row, and the previous successful version keeps the pointer and its bytes; the stale worker's late commit is refused; the surviving version is publishable. |
| D20-A-T2 | `d20aT2CancellingQueuedOrRunningFollowUpsLeavesTheSuccessfulVersionUsable` | Cancel while queued and while a production scheduler is held inside PLAN, GENERATE and VERIFY (draft exists): FAILED/CANCELLED, no later stage starts, only the VERIFY case leaves a FAILED draft, the earlier version stays latest and byte-identical. |
| D20-A-T3 | `d20aT3TwoUsersRacingWithIdenticalKeysShareNoData` | Two users at the same instant, the **same** task and publication idempotency keys, three schedulers and two publication workers: all 8 tasks commit READY (a failure lists each task's status/failure code), disjoint tasks/publications, no foreign identifier in any response body, cross-user list/deployment reads 404, frozen source and served page carry only the owner's marker. |
| D20-A-T1 | `d20aT1EveryPublicationRequestIsOneLogicalPublicationHostedOnce` | 12 same-key clicks → one publication; while instance 1 is inside hosting, 6 more clicks, 4 competing `process` calls on both instances and a worker tick: hosting called once, ledger `PREPARING→PUBLISHING→PROBING→SUCCEEDED`; same key on another application → 409; 5 keys × 2 clicks × 6 workers → 5 publications hosted once each; a failed attempt replays as FAILED and is never re-hosted; only a new key retries. |
| D20-A-02 / T4 | `d20aT4PublishingAnOldVersionDuringEditsKeepsItsFixedHash` | Old-version (v1) publish clicks race the edit's READY commit; stale/foreign digests → `409 PUBLICATION_ARTIFACT_MISMATCH`; four workers held inside hosting while a second edit commits and two restores flip the pointer v3→v1→v3; every v1 publication's own location serves exactly v1's manifest (re-hashed from the served bytes), the v1 version directory is byte-identical, v1/v2/v3 digests differ. |
| D20-A-04 | `d20a04VersionListIsOneSnapshotWhileVersionsCommit` | `StatementGate` pauses the version list right after its page query; a READY commit (or a new draft) lands; the response must not name a DRAFT as latest, and total must equal the page. |
| D20-A-04 | `d20a04PublicationListAndDeploymentAreOneSnapshotWhileAWorkerCommits` | The gate pauses publication list/deployment right before `latestSuccessful`; the worker commits PUBLISHED; the same response must not list the publication as REQUESTED while naming it latestSuccessful. |
| D20-A-04 | `d20a04ReadyCommitWhoseFreezeOutlastsTheLeaseCommitsOnce` | The D20-B review failure, replayed: `StoreGate` pauses the READY commit inside its VERIFIED freeze until the committed 3 s lease has visibly run out (the heartbeat waits on the row the commit holds) and a second scheduler has tried expiry recovery. The commit must still land once: READY, VERIFIED, readable outcome, latest pointer, VERIFY executed once. |
| D20-A-04 | `d20a04DraftWhoseSourceFreezeOutlastsTheLeaseKeepsTheLiveWorkersTask` | The same starvation in GENERATE: the source freeze is paused past the lease current when it began and past a recovery attempt. The heartbeat must keep renewing meanwhile and the task must end READY with one version and GENERATE executed once. |
| D20-A-03 | `ConsistencyAudit` after **every** test, and `d20a03AuditRejectsInjectedInconsistencies` | Invariants E1–E5 (events), V1–V6 (versions/builds/frozen outcomes/latest pointer), P1–P5 (binding, ledger, hosting once, bytes served at the publication's own location), X1 (owner marker of the served page). The negative control injects an event gap, an unconverged draft, a ledger success SQL never committed, tampered bytes at one served location and nothing served at another (request payloads untouched), and requires each to be reported. |

`StatementGate` wraps the test context's DataSource only: it pauses one statement whose SQL contains a marker until
the test releases it. It does not change SQL, parameters or results, and it is never part of production code.
`StoreGate` does the same for the snapshot store: every call reaches the production `LocalVolumeSnapshotStore`; a test
can pause the first freeze a predicate matches. `CODELESS_D20A_SLOW_FREEZE_MS` (default 0; set only by the recorder's
`@slow` runs) adds a fixed delay to every freeze behind one monitor, emulating a slow volume serialized by the store.

The audit after each test checks every row, but a violation fails only the test after which it first appears; later
tests still audit everything and fail on anything new. One defect is reported once, by the test that produced it
(the D20-B review run had one root failure in T3 and five later tests failing on the same rows).

## Reproduce

```bash
source .local-data/d20-a/env.sh   # JDK 21, CODELESS_MODEL_PROVIDER=deterministic-mock, model key/name unset
node tests/integration/concurrency/record-command.mjs acceptance
node tests/integration/concurrency/record-command.mjs acceptance@slow          # every freeze +1500 ms, serialized
node tests/integration/concurrency/record-command.mjs mutation-version-snapshot
node tests/integration/concurrency/record-command.mjs regression
node tests/integration/concurrency/record-command.mjs gate
node tests/integration/concurrency/export-evidence.mjs 2026-10-22
```

The recorder pins `deterministic-mock`, removes model key/name and browser channel, records native exit/signal, HEAD,
digests of uncommitted scoped files, the raw log and this run's JUnit XML under `.local-data/d20-a/runs/`.
Mutation modes are negative controls: each puts back one defect or removes one protection, runs the acceptance class,
restores the exact bytes and passes only if Maven exited 1 without a signal and every expected test failed:

| Mode | Change | Must fail |
| --- | --- | --- |
| `mutation-version-snapshot` | `VersionController.java` from the base commit | version list snapshot |
| `mutation-publication-snapshot` | `PublicationService.java` from the base commit | publication list/deployment snapshot |
| `mutation-publish-lock` | worker row lock `FOR UPDATE SKIP LOCKED` removed | T1 |
| `mutation-owner-key` | owner removed from the publication key derivation | T3 |
| `mutation-artifact-pin` | requested artifact digest no longer compared | T4 |
| `mutation-convergence` | cancelled/failed drafts no longer converged | both T2 tests |
| `mutation-lease-boundary` | `AgentRunStore.java` from the base commit (both lease-boundary defects, as reviewed) | both lease-boundary tests |
| `mutation-freeze-first` | READY commit freezes VERIFIED before its lease-checked SQL again | READY commit outlasting the lease |
| `mutation-draft-in-lock` | draft freezes its source while holding the task row lock again | draft freeze outlasting the lease |

`acceptance` and every mutation mode can carry `@slow` (for example `mutation-freeze-first@slow`); `run.json` records `slowFreezeMs: 1500`.
The hosting fixture holds only the publications a test names, so a publication left REQUESTED by an earlier failing
test passes through instead of blocking the next test.
