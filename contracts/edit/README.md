# D12-A conversation edit contract

Additive API fragment: `openapi.patch.json`; no shared OpenAPI, lockfile, CI or migration changes. The final enabling PR's public-contract maintainer must integrate the fragment and run actual D12-B integration. D12-B was unavailable at task start; the final projections below align with the reviewed PR #36 contract, while actual component enablement/integration remains pending.

| Method/path | Behavior |
| --- | --- |
| POST `/api/v0/applications/{applicationId}/edits` | Session + CSRF; strict JSON `{baseVersionId,prompt,source:{type:"CHAT",messageId?}}`, optional application-scoped `Idempotency-Key`. 202 `{task,baseVersionId,source}`. |
| GET `/api/v0/tasks/{taskId}/edit` | Owner-only association/current task; same envelope, no-store. Non-edit/foreign/missing task 404. Ordinary task/events/cancel/diagnostics APIs retain their original schemas. |

Prompt is stripped, nonblank and 1..8000 Unicode code points. UUIDs use the canonical 36-character form. Key/messageId use 1..128 ASCII characters `[A-Za-z0-9._:-]`. Source is client-supplied provenance only, never an authorization grant or evidence of a real message; owner comes exclusively from the session. No publication flag, component selection, DOM-instance identifier, arbitrary path, command or dependency field is accepted. Stored absent messageId may be omitted or null.

## Concurrency and retention

- The immutable **latestReadyVersionId** is the expected base. The base must belong to this application, be VERIFIED, and have a readable digest-checked D11 snapshot. Initial shell/DRAFT/FAILED/foreign/nonexistent base: 409 `EDIT_BASE_UNAVAILABLE`. Missing snapshot: 409 `SNAPSHOT_UNAVAILABLE`; corrupt snapshot: existing 503. No empty fallback.
- Application row lock serializes requests. Any QUEUED or RUNNING generation task prevents starting an edit (`409 EDIT_TASK_ACTIVE`); an active edit also prevents new ordinary generation. Thus queued edits are active, not just leased edits. Existing ordinary-generation queuing behavior is otherwise retained.
- Stale owned VERIFIED base: 409 `EDIT_VERSION_CONFLICT`. Common error `details` retains normalized `prompt`, `applicationId`, `baseVersionId`, `currentVersionId` (when available), `sourceType`, `messageId` (when provided). No task/workspace is created. Client retains its composition and lets the user review the new version before submitting explicitly; no automatic rebase/retry.
- Idempotency replay is checked before staleness/active checks: same key/base/prompt/source returns the original task even after READY or cancellation. Any change, or collision with an ordinary task, is 409 `IDEMPOTENCY_CONFLICT`. No second event/task.
- Durable association uses the server-authored first `STAGE_STARTED/PLAN` event, message `Edit accepted v1 ` + JSON `{baseVersionId,source}` (bounded below the existing 2000-character message limit). Prompt remains in generation_tasks. Task creation and first event share one PostgreSQL transaction; no updates to that event. Runtime reads only this exact initial event, never prompts/logs/source/model output as metadata. This reuses existing storage rather than allocating an unregistered public migration number. If normalized searchable metadata is needed, a separate maintainer migration should replace this encoding with a compatibility reader.
- The base is rechecked under the application lock before the successful version commit. A changed pointer produces FAILED `EDIT_VERSION_CONFLICT`, a failed candidate with unknown tool fields where applicable, and preserves the newer pointer. Verification itself cannot publish or replace the pointer without this check.

## Workspace and chain

PLAN receives bounded immutable source as untrusted data and proposes the full resulting file list including unchanged files. At GENERATE, the original active lease fences the trusted seed: fresh task-owned workspace only, every source file copied and digest checked; links, device names and traversal retain D08/D11 protections. Existing files use `files.update` and expectedDigest. The unchanged base is never a write target. Normal PLAN→GENERATE→VERIFY→REPAIR/READY and original budgets, controlled tools, Docker build and browser validation apply. A seed consumes a runtime tool slot. Successful modifications create distinct DRAFT then VERIFIED versions, linked by existing `version.taskId` plus `GET task/edit` to the base/source.

Cancellation/expiry retains task requirements/source and prior usable versions. A cancelled candidate can remain DRAFT, but is not usable/publishable and cannot receive a late READY write. Failed builds finalize FAILED and do not move latestReadyVersionId. No automatic publication.

The plan file list is the **final snapshot**, not the complete set of permitted intermediate operations. During ordinary CHAT GENERATE, read/update/delete paths may come from either that plan or the trusted digest-checked immutable base; create paths must belong to the final plan. Deleted base files must be omitted from both final files and component declarations, with imports/usages removed. Final snapshot equality remains exact: forgotten deletions and deletion of a still-planned file fail `AGENT_PLAN_FILES_MISMATCH`. Model requests/source comments cannot add paths; paths outside both sets fail `AGENT_UNPLANNED_FILE`, and all existing tool path/digest/lease checks still apply. The final component enabling PR must retain its stricter server-resolved COMPONENT mutation boundary when integrating this CHAT fix.

Filesystem/SQL are not one atomic resource. Seed failure/crash may leave a partial private workspace. Nonempty workspace or stage re-entry fails closed with operator recovery; no blind reseed/overwrite. No automatic cleanup or new privileges. The private workspace/snapshot roots must remain platform-owned across instances, as required by D08/D11.

## D12-B component integration boundary

The shared identity projection is exactly `{componentId,sourceFile,versionId}`. Match B's lowercase kebab-case ID (1..64), lowercase canonical UUID and restricted Vue path/device checks. Client selection is exactly `{componentId,versionId,sourceDigest}` with **no sourceFile**: the server resolves sourceFile only from B's trusted immutable sidecar. `versionId` must equal the edit's baseVersionId and sidecar's frozen version. Source must exist in that version's D11 manifest, and sourceDigest/fileDigest must match; shape/schema alone does not authenticate a mapping. Resolution additionally returns scope=SOURCE_FILE, shared=true and a notice that all instances change. Old-version, forged or unavailable mapping must fail before creating a task. CHAT still rejects COMPONENT 400; sidecar persistence, resolver and preview selection bridge are reserved for the final enabling PR, after B's nested-marker override issue is fixed. No AST-level or per-DOM-instance precision is promised. Read-only findings and reproduction: `review-D12-B.md`.

## Reproduce

```powershell
. ./.local-data/d07-a/env.ps1
node tests/edit/lifecycle/record-command.mjs acceptance
node tests/edit/lifecycle/record-command.mjs contracts
node tests/edit/lifecycle/record-command.mjs gate
```

The recorder locks the provider to `deterministic-mock`, removes model API key/name and browser channel in child processes, records actual native exits and private raw-log hashes. An edit mock changes Ada→Hedy explicitly; real PostgreSQL/Docker/Chromium decide DRAFT/READY/failure, not the mock. Runtime model usage remains a separate unknown-token mock ledger, never a model-quality or paid-token claim.
