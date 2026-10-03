# D09-A generation loop

The opt-in trusted adapter runs `PLAN -> GENERATE -> VERIFY -> PREVIEW_READY`.
`PREVIEW_READY` maps to the existing v0 task status `READY`; it is not publication.
Enable it with Spring properties (for example command-line `--codeless.agent.enabled=true`):

```properties
codeless.agent.enabled=true
codeless.agent.repository-root=/absolute/controlled/checkout
codeless.agent.private-root=/absolute/private/persistent/agent-volume
codeless.agent.node=node
```

Keep D01 versions and configure the existing PostgreSQL/auth/model settings. The
private root, `CODELESS_FILE_WORKSPACE_ROOT`, `CODELESS_FILE_AUDIT_ROOT` and
`CODELESS_MODEL_AUDIT_ROOT` must be persistent, inaccessible to generated code,
and shared consistently by API instances that use the same queue. No platform
secret is passed to the fixed Node bridge or its build/browser children. The
Docker control plane stays on the trusted worker host; no Docker socket or
private platform volume is mounted into generated-code containers.

Default/CI provider is explicitly `deterministic-mock`, generating a fixed two-file
showcase. Paid evaluation uses the existing `deepseek` adapter and environment
credentials; it has no fallback or retry. Never use mock results as model quality
evidence. Local environment variables can override configuration-file provider
selection; CI tests therefore also pin the provider in their test properties.

## Internal contracts and stage permissions

- `TaskStageRunner.execute(originalClaim, stage)` carries the original queue token.
  UUID-only execution is rejected by the production loop. Legacy test adapters
  keep the old method through a default overload; they still face the DB READY gate.
- PLAN exposes no tools. Its JSON must pass the existing D07 plan validator.
- GENERATE accepts exactly `{type:tool,name,arguments}` or `{type:done,actions}`.
  Only the five D08 file tools are advertised, with their unchanged argument
  schemas. Source writes/read/delete are restricted further to planned paths.
  Actual committed tool results, including call IDs, contents for read and hashes,
  are sent in the next model request's `observations`. Model-provided status or
  unknown tool names cannot declare success. File failure stops the task.
- done requires controlled assertions for every planned route and an exact match
  between generated paths and planned files. The coordinator reserves a tool
  slot for the D08 immutable snapshot and creates a DRAFT version.
- VERIFY exposes only the fixed build/browser workflow, with no model calls or
  file mutations. `services/api/agent-runner.mjs` validates action parameters and
  source hash, then consumes D08's `createBuildVerifier`. Invocation roots are
  trusted process configuration; model data cannot set a command or a root.
- The API re-reads the bridge receipt, source, full artifact manifest, browser
  report and PNG bytes before accepting VERIFIED, and repeats validation before
  commit. Success requires matching source/build/artifact IDs, real exit 0,
  confirmed cleanup, completed browser assertions and the matching screenshot.
  Unknown, missing or mismatched evidence fails.

Reservations persist under the task row lock: at most 12 model requests, 20 total
tool operations (including source snapshot and build+browser verification),
50000 runtime tokens and the existing 12-minute DB deadline. Next-call input is
conservatively reserved using UTF-8 bytes plus message framing margin and 4096
output tokens for the configured BPE adapter. Measured input/output and total
usage release unused reservations. A real provider's unknown usage prevents the
next request; the explicitly named offline mock retains full reservations while
actual usage remains null. No repair is automatically attempted (0 rounds, within
the 3-round maximum). These bounds are not a promise that every valid large plan
fits the remaining budget.

## Evidence, failure and commit

`<private-root>/journal/<taskId>/NNNN.json` is a forced append-only private journal.
It saves plans, reservations, provider responses, actual file receipts, immutable
snapshot identity, draft version, real runner result and failure/recovery code.
It contains generated source/diagnostics and must not be served publicly. No
lease tokens or model credentials are recorded. Original D07 usage audits and
D08 file audits remain authoritative for their respective operations.

Failure preserves checkpoints, source and real results; the task becomes FAILED.
Cancelled/expired workers cannot commit late results or impersonate a newer lease.
Re-entering an already attempted stage returns `AGENT_RECOVERY_REQUIRED`; an
operator must inspect the durable record and explicitly create a new task.
There is no automatic restart/replay endpoint. A process crash is recovered by
the existing queue as INTERRUPTED; pending observations are unknown, never zero.

After byte checks, one SQL transaction creates the exact successful Build,
sets the associated immutable version VERIFIED, appends the correlated READY
event, finishes the lease and updates `latest_ready_version_id`. SQL failure
rolls back those changes. The private completion journal is an observation,
not proof of a committed database transaction; always reconcile with SQL after
host failure. Filesystem and PostgreSQL are not a distributed atomic store.
Failure never changes a prior ready version or publishes anything.

Public event replay derives the completion's exact version/build UUIDs from the
immutable SQL relationship rather than replaying raw model/tool messages. The
wire schema is unchanged; `/tasks/{id}/diagnostics` and the existing owned version
lookup provide the same version/build relationship.

The existing Build schema/SQL cannot represent FAILED with actual exit 0/null.
Such outcomes stay unchanged in the private runner report, with a FAILED task
and failed candidate version, without fabricating a SQL Build. Real nonzero
build failures are also recorded as FAILED Builds. Resolving the shared
schema/migration difference belongs to the registered public maintainer.

## D09-B handoff and tests

For preview, resolve the authenticated owned version using the existing v0 API;
require VERIFIED, its exact buildId and matching sourceDigest. The trusted
artifact directory is `<private-root>/artifacts/<buildId>`, while the private
completion record includes verificationId/artifactDigest. B must expose these
through its isolated preview gateway, with ownership and expiring credentials,
without exposing journal files, host paths or platform cookies/storage. No new
preview HTTP contract, iframe integration or automatic publication is added by A.

Reproduce (Java 21, frozen Node/pnpm, Docker):

```powershell
$env:CODELESS_MODEL_PROVIDER='deterministic-mock'
$env:CODELESS_AGENT_EVIDENCE_DIR="$pwd/.local-data/d09-a/evidence"
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=AgentLoopIntegrationTest' test
pnpm ci:gate
```

The integration suite is discovered by existing `verify:api`. Its scoped
`tests/agent/prepare-runtime.mjs` prepares frozen dependencies, the fixed browser
and the existing trusted image where absent; no CI/lock/public script is edited.
An explicit real model run is separate from CI:

```powershell
$env:CODELESS_REAL_AGENT_EVIDENCE_DIR="$pwd/.local-data/d09-a/real"
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RealAgentAcceptanceIT' test
```

Missing/invalid credentials write BLOCKED preflight and fail that command. A real
model, build or browser failure is preserved and fails acceptance. Neither the
mock nor real backend/browser run proves platform iframe access; final D09-B
integration must test that path using the exact verified version.
