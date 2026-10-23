# D13-B acceptance

Use locked Node24.22.1/pnpm12.6.0 and Playwright1.60.0 Chromium. Run from repository root:

```text
node tests/e2e/selector/record-command.mjs static
node tests/e2e/selector/record-command.mjs unit
node tests/e2e/selector/record-command.mjs browser
node tests/e2e/selector/record-command.mjs gate
node tests/e2e/selector/record-command.mjs preview
node tests/e2e/selector/export-evidence.mjs
```

`browser` serves the current production platform build; run `static` first after source changes.
The existing E2E gate automatically discovers selector/flow.spec.ts and builds first.
Three browser tests cover T1+T3, T4 and T2 respectively; none is skipped. API and generated markup are
explicit fixtures. The actual browser executes the production platform and exactly the gateway bridge
renderer. The original API gate separately executes PreviewPlatformIntegrationTest with real session,
PostgreSQL, Docker Vue build, gateway, Chromium click and component-edit request through D12 checks.

Recording writes native command, HEAD/dirty paths, exit/signal and SHA256 of raw log under
`.local-data/d13-b/<timestamp>-<mode>`. Interrupted runs retain unknown exit state and must never
be reported as passed. No paid model calls are made by selector tests; wider gates use explicitly named
deterministic-mock. Successful builds/browsers do not establish real-model quality.
