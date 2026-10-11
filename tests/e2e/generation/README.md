# D10-B deterministic generation flows

Run from the repository root with D01 Node 24.16.0 / pnpm 12.6.0, Docker and the locked Playwright Chromium installed:

```powershell
pnpm verify:static
Push-Location apps/web
node node_modules/@playwright/test/cli.js test --config playwright.config.ts --grep D10-B --workers=1
Pop-Location
pnpm ci:gate
```

Use --grep D10-B to select the four titles. A path filter `generation` also matches every spec when the worktree path itself contains generation. Windows CODELESS_PLAYWRIGHT_CHANNEL=chrome may select the installed Chrome for platform tests; the controlled runner always uses its pinned Playwright Chromium.

Each test creates an independent GenerationFixtureProvider. Reload/new tabs preserve that test provider's task and history. There are no provider credentials and no real model calls. API/auth/task/metadata/signing and bootstrap transport are explicit HTTP fixtures. The bootstrap fixture normalizes history to / before executing the unchanged production artifact and adds the expected loaded message; it does not prove production gateway signing/redirect behavior. The existing preview and API gates independently verify real gateway, signing, PostgreSQL and authenticated platform integration.

prepare-fixture.mjs builds a source with a missing Vue component in the actual isolated Docker runner, applies a fixed fixture source replacement, builds it again, and verifies it using the controlled browser worker. A second wrong-text assertion against the existing heading actually fails despite build exit 0. Four UI flows read these results and load the actual built JS/CSS in an isolated iframe. Build failure, browser failure and source file digests are real; fixture task/version IDs and a scripted REPAIR transition are not database or automatic Agent repair evidence.

Success checks repair 1 -> verified preview and reload. Failure checks model-done claims, real build exit 0, failed browser validation, missing diagnostics and retention of the old preview. Cancellation checks pending lock, authoritative CANCELLED and a distinct explicit retry task/key. Recovery checks offline backfill, unique sequences/cursor, reload and close/reopen with one POST and the original task ID.

Logs and runner private paths stay under .local-data/d10-b. Reviewed screenshots and closed projections are under docs/evidence/D10. export-evidence.mjs exports current local command exits/digests and screenshot hashes after the gate. These reports never establish a real-model success rate. Real smoke requires approval of the separately documented synthetic payload; D10-A integration remains a separate dependency.
