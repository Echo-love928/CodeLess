# D10-A bounded repair and stop conditions

The existing opt-in AgentLoop now runs PLAN -> GENERATE -> VERIFY -> READY, or
VERIFY -> REPAIR -> GENERATE -> VERIFY. No public status, SQL migration, tool schema,
dependency, route or publication capability changes. `codeless.agent.repair.enabled`
defaults to true inside the explicitly enabled agent; set false only to disable
automatic repair. Legacy D09 failure tests explicitly verify that disabled mode.

REPAIR uses `prompts/runtime/repair/agent-repair-v1.txt`, the existing five file tools,
planned paths and original lease. Its input contains the actual normalized failure,
immutable source manifest and committed file receipts. Source reads return real
bytes/hashes. A done proposal must copy the original browser actions unchanged;
GENERATE freezes the repaired bytes without another model call. A new immutable
version is created for every candidate. Only a real successful rebuild/browser
and independently checked artifacts/report/PNG allow READY and pointer replacement.

The internal REPAIR model input now supplies `completionProposal` instead of the
standalone `originalActions` field. It is the complete `{type:done,actions}` object
containing the original frozen actions once. The model must still propose that
exact object; the server independently compares its actions with the full original
draft, rejects wrappers/duplicate keys, and never executes a nested proposal.
After an actual source change, the final available model request is reserved for
completion: `completionOnly:true` exposes no file tools, and a tool proposal is
rejected before a tool reservation or execution. Omitting these unavailable tool
schemas leaves room for full source content and conservative unknown completion
usage; token reservation itself is unchanged. The model still must supply done,
and only a new real build/browser result can succeed.
This changes no public API or tool contract. Only model-facing plan prose is
removed: routes, planned paths and capabilities are retained, while the complete
validated plan remains authoritative for permissions and browser coverage.

Read content is invalidated per file digest, not merely because another file has
changed. A successful create/update projection can carry `committedContent` only
when the submitted UTF-8 content digest matches both the actual reread afterDigest
and current source manifest. It is labeled `COMMITTED_WRITE_DIGEST_MATCHED`, not
reported as a new read; failed or mismatched writes stop. A genuine later read
supersedes this text to avoid sending duplicate full file contents. Complete actual
receipts remain in the journal. After a write, the progress hint asks for completion
or a necessary patch; it does not encourage rereading already current source.

| Observed condition | Decision / terminal failure |
| --- | --- |
| Confirmed compiler diagnostic with nonzero exit, no OOM/timeout and confirmed cleanup | Request REPAIR if limits permit. |
| Completed browser ACTION_FAILED/PAGE_EXCEPTION/CONSOLE_ERROR/BLANK_PAGE after successful build and confirmed cleanup | Request REPAIR; original actions cannot be weakened. |
| Same diagnostic fingerprint and same sourceDigest on next verification | FAILED / AGENT_REPAIR_NO_PROGRESS. |
| Three completed repair rounds still fail | FAILED / AGENT_REPAIR_LIMIT_EXCEEDED. |
| Docker, image, filesystem, worker/browser launch, network/resource error, timeout, cleanup or unknown failure | FAILED with original safe error; no model repair/retry. |
| Model transport/auth/rate limit/invalid response/protocol failure | FAILED with original safe error; no model retry. |
| Next request would exceed 12 model calls or 50,000 reserved/charged tokens | FAILED / AGENT_MODEL_BUDGET_EXCEEDED, before provider invocation. |
| Next operation would exceed 20 tool slots | FAILED / AGENT_TOOL_BUDGET_EXCEEDED, before file/runner operation. |
| Authenticated cancellation | Existing FAILED / CANCELLED; late writes/commit are fenced. |
| Existing 12-minute SQL deadline or lease expires | Existing queue recovers FAILED / INTERRUPTED; no late commit. |
| Crash or repeated stage entry without a recorded completed transition | FAILED / AGENT_RECOVERY_REQUIRED; manual reconciliation, no replay. |

Build and browser each reserve a tool slot before the fixed combined invocation.
A failed build may leave its unused browser slot reserved; conservative reservation
is not a claim that the browser executed. Snapshot and failed/invalid file calls also
count. Reservations persist under the task row lock in the shared private journal;
new service instances cannot reset them. The journal has 160 bounded checkpoints to
hold all 12 calls/20 tools/three repairs with their audit records.

Every model request reserves UTF-8 input bytes plus 512 framing tokens and 4096 max
output tokens. Provider total usage, if present, is checked against known input+
output; otherwise missing parts retain the corresponding conservative reservation.
`model.usage` stores original nullable counters, `chargedTokens`, `releasedTokens`,
`estimated` and `meteringSource`. Unknown usage is never zero. Received usage survives
cancellation in the model-call SQL/audit; when the lease prevents journaling its
refund, the full reservation remains charged. The old standalone D07 PLAN path
has no durable conservative meter and still stops on MODEL_BUDGET_UNKNOWN.

All logs/source/comments/page text are untrusted data, never permissions. Only fixed
runner enums and actual exit/cleanup facts classify code failures. Diagnostic
fingerprints remove execution IDs, durations and compiler boilerplate; sourceDigest
must also be identical to stop for no progress. No arbitrary shell, dependency
install, internal browsing, secrets, automatic publication or replay is introduced.

Private checkpoints can contain source/diagnostics. Persist them on shared private
volumes; never mount them into generated-code containers or expose them via HTTP.
Pending filesystem/database observations still require manual reconciliation after
host failure. Public Build schema cannot store a FAILED build with exit 0/null;
such browser/unknown outcomes remain unchanged in private reports and failed
candidate/task state, not fabricated SQL Build records.

D10-B can consume unchanged repairAttempts/events/diagnostics. New safe failure codes
are AGENT_REPAIR_NO_PROGRESS, AGENT_REPAIR_LIMIT_EXCEEDED and
AGENT_REPAIR_ACCEPTANCE_CHANGED; AGENT_BUILD_EXIT remains the actual compiler code.
The final enabling integration PR must test real authenticated UI -> queue ->
repair -> build/browser -> immutable version -> signed isolated preview. Backend
fixtures alone do not constitute M1 real-model or UI integration acceptance.
