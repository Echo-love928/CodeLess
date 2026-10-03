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
Platform iframe preview remains a separate D09-B integration requirement.
