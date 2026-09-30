# D05-A task API delta

The existing `POST /api/v0/tasks`, `GET /api/v0/tasks/{taskId}` and
`GET /api/v0/tasks/{taskId}/events` keep the D01 v0 task and event schemas.
This task-local delta needs the shared OpenAPI maintainer to add:

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

Shared `contracts/openapi.v0.json` is maintained separately. This additive
delta is not yet folded into that public contract; the final enabling PR must
sync it and run the contract suite. The D05-B runner adapter can implement
`TaskStageRunner`; its source fixture must be validated by B independently.
