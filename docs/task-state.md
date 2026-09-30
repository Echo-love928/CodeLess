# D05-A task queue and state table

`generation_tasks` is the durable queue. `queue_state` is `QUEUED`, `RUNNING`
or `FINISHED`; public `status` remains the D01 v0 stage. New HTTP tasks enter
`PLAN` and `QUEUED` with one initial event in a transaction. Legacy data-layer
fixtures are not scheduled. A PostgreSQL row lock with `SKIP LOCKED` claims one
queued task; the application row lock and partial unique index prevent two
running tasks for one application, including across API instances.

| From | Allowed next stage | Evidence / condition |
| --- | --- | --- |
| `PLAN` | `GENERATE`, `FAILED` | A trusted stage adapter returns a plan or a failure. |
| `GENERATE` | `VERIFY`, `FAILED` | Source generation attempt completed or failed. |
| `VERIFY` | `REPAIR`, `READY`, `FAILED` | Repair is bounded to 3; READY also requires a successful real build attached to a verified version for this task and application. |
| `REPAIR` | `GENERATE`, `FAILED` | A bounded repair attempt completed or failed. |
| `READY`, `FAILED` | none | Final state and event sequence cannot advance through the service. |

Cancellation converts a nonterminal task to `FAILED/CANCELLED`. Repeating a
cancel on a terminal task returns the existing resource without a new event.
A queued task has a 12 minute deadline. A running claim has an opaque lease
token, expiring no later than that deadline. Every worker write checks the
token and time after locking the task row. The stage `UPDATE` checks both
deadlines again with PostgreSQL `clock_timestamp()`; state and event share
one transaction. An expired lease or deadline is recovered as
`FAILED/INTERRUPTED`, never READY. After a process restart a still valid lease
is left alone until its expiry; this also avoids stealing work from another
live API instance. A stale worker cannot write after cancellation or expiry.

The scheduler uses `TaskStageRunner` as the trusted integration seam. Until
the real runner/model pipeline is connected, the default adapter fails safely
with `RUNNER_UNAVAILABLE`. Test fixtures exercise state flow, but cannot prove
model quality or a real build/browser verification. Invalid stage output is
recorded as `FAILED/INVALID_STAGE_RESULT`; exceptions become
`FAILED/RUNNER_ERROR`. Deployment does not appear in this state table and is
never invoked by the model adapter.
