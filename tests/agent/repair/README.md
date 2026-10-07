# D10-A repair acceptance

All provider responses in `RepairLoopIntegrationTest` are explicitly named fixtures.
PostgreSQL 17.6, file tools, immutable snapshots, Docker compilation and Chromium
verification are real. These results prove controller behavior, not model quality.

From the repository root with the frozen Java/Node/pnpm toolchain and Docker:

```powershell
$env:CODELESS_MODEL_PROVIDER='deterministic-mock'
$env:CODELESS_REPAIR_EVIDENCE_DIR="$pwd/.local-data/d10-a/evidence"
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RepairPolicyTest,RepairLoopIntegrationTest' test
pnpm ci:gate
node tests/agent/repair/export-evidence.mjs
```

The tests are discovered by the existing API gate. T1/T4 really fail compilation
on an import of MissingCard.vue, read its actual source, apply a digest-guarded
update to ProfileCard.vue and rebuild/reverify. Evidence exports both source
candidates after checking every byte, the original compiler error, successful
browser report and PNG. T2 exercises four real failed builds with three changed
sources, and two failed builds with unchanged source. T3 drives production budget
refusals and cancellation/deadline expiry during REPAIR. Infra and model network
errors never trigger additional code edits; changing acceptance actions is rejected.

Paid evaluation is separate, uses existing environment credentials only in the API,
and is not selected by default CI:

```powershell
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=RealPreviewPlatformAcceptanceIT' test
```

Actual outcomes and remaining M1/integration limitations are in `docs/handoffs/D10-A.md`.
