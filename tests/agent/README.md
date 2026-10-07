# D09-A acceptance

The default API gate discovers `AgentLoopIntegrationTest`. It uses the explicitly
named deterministic mock provider with unknown (SQL NULL) usage, real PostgreSQL,
real Docker production builds and the frozen real Chromium verifier. No mock
build or browser verdict is accepted as success.

```powershell
$env:CODELESS_MODEL_PROVIDER='deterministic-mock'
$env:CODELESS_AGENT_EVIDENCE_DIR="$pwd/.local-data/d09-a/evidence"
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=AgentLoopIntegrationTest' test
pnpm ci:gate
node tests/agent/export-evidence.mjs
```

T1 generates two files using actual tools, then reaches READY through real
build/browser results. T2 rejects model success fields, verify tools in GENERATE,
wrong source/artifact/screenshot hashes, missing private receipt, mismatched
browser build ID and null exit code. These adversarial reports are explicit
test fixtures; none is success evidence. T3 submits invalid Vue to the real
builder and checks the real nonzero exit, FAILED build/task, saved recovery
information and the unchanged earlier ready version of the same application.
T4 checks durable and sanitized public completion events against the exact
immutable version/build and actual browser verification identity.

Additional tests cover original-token/late cancellation, stage re-entry, 20-tool
and 50000-token reservation limits, exact actual tool results sent to the next
model request, received usage retained after cancellation, and unknown real
usage blocking another request without becoming zero.

The explicit paid-model test `RealAgentAcceptanceIT` is intentionally outside
default deterministic test discovery; it is run by its own command, never
silently skipped and never used to make CI depend on secrets. It preserves real
failure evidence and requires READY to exit 0. See `services/api/README-agent.md`.

Portable reports in `evidence/2026-10-03` normalize only host path prefixes. The
exporter rechecks every exported source and PNG digest. Full private receipts,
original logs and failed attempts remain under `.local-data/d09-a` and the API
target test volumes. The final handoff records each actual command/exit code.
The explicit peer review handoff command requires a checkout of the exact D09-B
candidate and the private real T1 evidence (portable reports omit required host
paths). It fails when either is unavailable:

```powershell
$env:CODELESS_D09_B_REVIEW_ROOT='C:/path/to/exact-reviewed-D09-B-checkout'
node --test tests/agent/preview-handoff.test.mjs
```

This rereads A's real receipts/source/browser/PNG, then reopens the byte-checked
artifact through B's trusted service and registers the exact version/build in
its gateway. Assets retain their actual hashes; wrong-version hosts and expired
credentials are rejected. Its issuer is a test fixture and transport is private
loopback HTTP. B's separate real TLS/Chromium/platform UI test was also reviewed
and executed, with explicit platform API fixtures. These tests do not establish
the complete deployed platform chain or real-model generation success.

The reviewed interruption regression is discovered by `verify:api` as
`LocalBuildGatewayTest`. Its fixed Node fixture runs an actual parent/child with
inherited pipes; it is explicitly a transport fixture, never build success
evidence. The old implementation fails the 3.5-second interrupted join, the fix
terminates both processes and preserves the interrupt flag. Deadline, normal
protocol return and pre-expired deadline are covered too.

Revision evidence is exported separately, preserving the original reports:

```powershell
node tests/agent/export-revision.mjs
```

See `evidence/2026-10-04/commands.json` for actual failures and checks. Paid-model
failure evidence remains separate; its platform preview field describes this
test's coverage rather than assuming B is unavailable.

The later integration-based A revision has one actual `deepseek-flash` generation
that reached READY through two generated files, PostgreSQL, Docker and controlled
Chromium. Its paid platform test subsequently failed loading the iframe, so the
full platform acceptance remains false. The four explicit paid tasks, original
failures, exact source/PNG bytes and separate usage are retained in
`evidence/2026-10-05/platform/`. The interrupted third tool session has an unknown
outer exit code; its real task/browser failure is still recorded.

On the integration-based revision checkout, reproduce the explicit paid test:

```powershell
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RealPreviewPlatformAcceptanceIT' test
```

`export-platform-evidence.mjs` exports these preserved evaluation runtimes when
`CODELESS_AGENT_PLATFORM_LOG_DIR` points to their private logs. It checks actual
source/artifact manifests, receipt, browser report and PNG bytes before export.
The UI diagnostic explicitly uses API/signing fixtures and cannot replace the
failed paid platform test. Added strict-protocol and ambiguous-browser regressions
are discovered by the existing API gate; no automatic unwrap or relaxed locator
has been introduced.
