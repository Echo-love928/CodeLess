# D06 task event transport delta

The D06 integration branch folds this transport delta into shared OpenAPI and
registers its tests in `verify:static`, under the user's 2026-10-02 integration authorization.
The existing v0 Event JSON shape is unchanged.

## Reviewable OpenAPI handoff

`openapi.patch.json` is a scoped RFC 6902 proposal for the shared maintainer. It
tests the existing `listTaskEvents` operation identity and replaces only that GET
operation; path parameters, global cookie authentication and other operations are
preserved. It documents both response media types, canonical int32 cursors,
header/query precedence, JSON page bounds, pre-stream JSON errors, comments,
post-header errors and terminal EOF behavior. It does not add detailed tool text
or change the v0 Event resource schema. `x-sse-protocol` describes framing details
that a plain OpenAPI string schema cannot validate.

Run from the repository root with the locked dependencies:

```powershell
node --test contracts/events/openapi.test.mjs
node contracts/events/prepare-openapi.mjs
corepack pnpm exec redocly lint .local-data/d06-events-contract/openapi.preview.json
```

The preview command writes an ignored, rebased copy; it never edits
`contracts/openapi.v0.json`. The four tests validate scope/auth preservation,
cursor/page boundaries, wire examples against the shared Event schema and error
codes against the shared error envelope. `verify:static` now executes this suite
against `contracts/openapi.v0.json` itself; a preview cannot mask a missing public
SSE operation. The scoped patch remains as provenance and a preview helper.
The D05 task cancel/idempotency deltas are also folded into shared OpenAPI;
`contracts/tasks/openapi.test.mjs` validates them and structured diagnostics.

## Connect and resume

- `GET /api/v0/tasks/{taskId}/events`, `Accept: text/event-stream`, session cookie.
  AuthFilter authenticates **every connection**; task ownership is checked before
  any bytes are sent. Foreign tasks return 404; anonymous/disabled accounts 401.
- Frames: `id: <sequence>`, `event: task-event`, `data: <v0 Event JSON>`.
  The transport eventId is the task-local positive integer `sequence`, **not**
  the event resource UUID `data.id`. IDs remain stable across processes/replays.
- `Last-Event-ID` is an exclusive cursor. Only events with `sequence > cursor`
  are sent in increasing order. Absent header means 0. `?afterEventId=N` supports
  page refresh / manually opened EventSource; a present header takes precedence.
  Values must be canonical nonnegative int32 decimal; empty, signed, whitespace,
  UUID, multiple or overflow values return 400 `INVALID_EVENT_ID`.
  A cursor beyond this task's durable head returns 409 `EVENT_CURSOR_AHEAD`.
- Without an SSE Accept header (or with `application/json`), the same endpoint
  returns an Event array, optionally after `?afterEventId=N&limit=1000`.
  `limit` is 1..1000 (default 1000). To drain larger history, advance afterEventId
  to the last returned sequence until a short/empty page, then open SSE from
  that cursor. Both transports sanitize history; JSON pages stay bounded.
- `Cache-Control: no-store`, `X-Accel-Buffering: no`. Keep proxy buffering off.
  Heartbeats are `:heartbeat` comments with `retry:1000`, every 15s while active;
  they have **no id**, no business data, and are never persisted. Poll interval
  is 500ms. Deployments can set `codeless.events.poll-ms/heartbeat-ms` (>=10).

## Termination, bounded backlog and failure recovery

- At most 1000 pending events per read/connection and 64 active connections per
  API instance; 4 polling/sending threads. No in-memory business-event history
  or unbounded per-client queue. Initial overflow returns JSON 409
  `EVENT_BACKLOG_EXCEEDED`; capacity returns JSON 503 `EVENT_STREAM_CAPACITY`.
  Persisted events are retained; these limits do not delete history. A slow
  reader may occupy one sending thread until its servlet write completes or the
  connection's 60s async timeout closes it; deployments must also bound proxy
  socket/write timeouts. This is a controlled-trial capacity, not load-tested.
- Each poll reads task head and event records in one PostgreSQL REPEATABLE READ
  transaction. Gaps/unknown states fail, never report READY or silently skip IDs.
- READY/FAILED: send all outstanding durable events, then close. Connecting at
  the terminal head returns empty 200 SSE and closes. `GET /api/v0/tasks/{taskId}`
  remains the authoritative status/failureCode query. On SSE EOF/error the client
  queries it: stop EventSource if terminal; otherwise reconnect using last applied
  sequence. Closing EventSource prevents its automatic terminal reconnect loop.
- Overflow/ownership loss after headers sends `event: stream-error` with
  `data: {"code":"..."}` and **no id**, then closes; session logout also closes.
  Other I/O/database errors end the stream without claiming a successful result.
  Client handles errors separately from task state. For overflow, drain JSON
  history pages then reconnect at the last applied sequence; never pretend all
  missing progress items were delivered before the pages have been applied.
- Client must retain `lastAppliedSequence` per task, ignore frames with
  `sequence <= lastAppliedSequence`, append progress once, and update state only
  from newer frames. Replaying an older requested cursor is intentional; server
  does not mutate task status during reads. Unknown named events/types should be
  ignored or displayed as diagnostics without crashing. D06-B owns real client
  reducer and browser tests; A's reference-consumer test is not proof of B UI.

## History sanitization

Raw persisted message text is never selected by public replay. Allowlisted enum
type/stage values produce fixed summaries (e.g. `Stage started: GENERATE`). UUID,
taskId, sequence and timestamp remain intact. This conservatively removes all
tool/model/prompt output, credentials, internal paths and arbitrary user text,
including secrets not recognized by regexes. Failure codes come from the task
status endpoint; detailed internal logs require a separate future authorized
diagnostic path. It affects old records too, without rewriting database history.

## Deterministic live integration

`TaskSseHttpTest` starts a real random-port Spring/Tomcat API and PostgreSQL 17.6
Testcontainer. The production scheduler is disabled for the fixture; real HTTP
creation/cancel, transactional fixture stage transitions and database events are
used. No model request/build/READY claim is involved. The live sequence is:
create PLAN -> consume id 1 -> disconnect -> GENERATE/VERIFY -> cancel FAILED ->
reconnect with id 1 -> receive ids 2,3,4 -> read FAILED/CANCELLED. B's final enabling
PR still must exercise its browser against this API and align the public OpenAPI.

## Deployment evidence still required

The direct Tomcat/PostgreSQL/Chrome tests prove HTTP replay and authentication;
they do not prove behavior behind a deployed gateway. The checked-in
`infra/nginx/platform.conf.template` has no explicit SSE buffering or write/read
timeout directives. Do not infer deployed proxy behavior from an API header or
from the mock capacity test. Deployment/infra owners must record the actual
gateway version, effective config, resource limits and the following results:

| Case | Required evidence |
| --- | --- |
| Buffering | Through the actual authenticated gateway, timestamp the first event and successive heartbeat bytes while the task remains running; record Cache-Control/X-Accel-Buffering, effective buffering config and whether comments arrive without waiting for EOF. |
| Slow client | Keep several authenticated clients reading slowly or stalled while a normal client receives progress; measure delivery latency, open sockets, memory and worker availability. Confirm write/socket limits close stalled connections and slots are released, then verify a new normal subscription succeeds. |
| Capacity/lifetime | Record the 65th connection's JSON 503, cleanup after client close/timeout, the active stream's 60s lifetime, and successful replay after proxy/transport interruption. Do not equate Java mock emitter cleanup with socket write interruption. |
| Safety/state | Use isolated owned tasks and public test credentials; exclude raw secrets from traces. Slow-client/timeout tests must not change authoritative task state or discard durable events. |

No production gateway credentials/configuration or deployment run was provided
for this task. These cases remain unexecuted, and no throughput/production-load
claim is made. Changes to `infra/**` require its maintainer; this handoff does not
alter that module. Detailed file differences/build diagnostics also remain a
future authorized, structured contract: restoring raw tool text would defeat
history sanitization and is not a resolution of that data gap.
