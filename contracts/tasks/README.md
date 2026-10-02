# D05-A task API delta

The existing `POST /api/v0/tasks`, `GET /api/v0/tasks/{taskId}` and
`GET /api/v0/tasks/{taskId}/events` keep the D01 v0 task and event schemas.
The D06 integration branch adds these deltas to shared OpenAPI under the user's
2026-10-02 integration authorization:

| Endpoint | Addition |
| --- | --- |
| `POST /api/v0/tasks` | Optional `Idempotency-Key` header, 1–128 ASCII characters in `[A-Za-z0-9._:-]`; `202` for a new or matching replay, `409 IDEMPOTENCY_CONFLICT` if the same key and application have a different prompt. |
| `POST /api/v0/tasks/{taskId}/cancel` | Authenticated, CSRF-protected cancellation; `200` task resource, `400` invalid UUID, `401` anonymous, `403` missing CSRF, `404` absent or foreign task. |

The key scope is **one application**. Same application, key and normalized prompt
returns the original task ID and creates no second event. A different key, or
an absent key, creates a new queued task. The owner is taken only from the
session. Request JSON accepts exactly `applicationId` and `prompt` (1–8000
Unicode code points after surrounding whitespace is stripped). Unsupported
fields and malformed values return `400`.

`PLAN` is the public status while the task waits in the database queue. Queue
state, lease token and deadline are internal and never enter the v0 task JSON.
Cancellation and abandoned/expired execution become `FAILED` with
`failureCode` `CANCELLED` or `INTERRUPTED`. The response does not claim READY
without a real verified build. Events are ordered by sequence. Deployment is
an authenticated user action outside generation and has no model tool stage.

Shared `contracts/openapi.v0.json` includes this delta. `verify:static` executes
`contracts/tasks/openapi.test.mjs` for CSRF, idempotency and diagnostics boundaries.
The D05-B runner adapter can implement
`TaskStageRunner`; its source fixture must be validated by B independently.

## Structured metadata

`GET /api/v0/tasks/{taskId}/diagnostics` is owner-only (including for administrators),
cookie-authenticated and `Cache-Control: no-store`. It returns a REPEATABLE READ
snapshot conforming to `schemas/v0/task-diagnostics.schema.json`:

- `files.available=false`, revision 0 and no changes: no producer result yet.
- `files.available=true`, revision >=1: producer-confirmed snapshot, possibly empty.
- Each change has an approved relative source path, ADDED/MODIFIED/DELETED, and
  SHA-256 digests before/after; null identifies creation/deletion. Maximum 40
  unique paths. No raw source or line diff is exposed through this endpoint.
- `builds` lists at most 100 owned persisted records with build/version UUID,
  status, actual stored exit code, artifact digest and timestamps. Raw log URLs
  are deliberately excluded; a build result never substitutes for task state.
- Anonymous/disabled users receive 401, absent/foreign tasks 404, malformed UUID
  400. Corrupt snapshots or overflow fail with 500 rather than silently truncating.

`TaskDiagnosticsService.recordFiles(taskId, leaseToken, expectedRevision, changes)`
is an internal trusted producer boundary, with no public write endpoint. It locks
the task, checks its active generation/repair lease and expected snapshot revision,
validates paths/operations/digests, replaces the complete snapshot and appends a
TOOL_RESULT in one transaction without changing task stage. Cancellation, expiry,
stale writers and duplicate paths fail without partial persistence. Revision
conflicts require producers to re-read; blind retries must not overwrite new data.

Migration V4 stores the snapshot. Builds reuse the existing builds table. The
workbench reads details when recovering/refreshing, after event/status reads and
after cancellation, and discards late responses from old requests/tasks.
The real generation/runner producer chain is explicitly a later task; this change
supplies its persistence/read/display boundary. Deterministic test metadata is
identified as fixture data and does not prove model generation or READY quality.
