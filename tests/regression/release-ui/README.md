# D26-B release UI regression

From repository root, with the locked Node/pnpm and installed Chromium:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @codeless/web build
node apps/web/node_modules/@playwright/test/cli.js test --config apps/web/playwright.release.config.ts
```

Five tests run with one worker and zero retries. `apps/web/playwright.config.ts` also discovers these tests in the existing mandatory smoke/E2E gate, while retaining all original E2E specs. No timeout or original assertion was removed. The focused report/trace outputs live in `.local-data/d26-b/`, never overwrite the committed evidence.

The platform UI and Chromium are real. The imported D14/D11 fixtures intercept HTTP and advance explicit named task states; they do not execute a model/build/database. The transport download fixture contains only a PK-prefixed byte sequence: it tests version-header rejection, focus and native download behavior, **not ZIP integrity**. The mandatory full-product suite separately uses PostgreSQL, restricted Docker builds, production APIs, preview/hosting and real ZIP-manifest verification with `deterministic-mock`.

| Case | Assertion |
| --- | --- |
| T1 keyboard edit | Tab/Enter/Space select a frozen source component, cancel with focus return, explicitly confirm shared scope, send exact three-field selection and display the task's new version. Fixture `finish` advances HTTP state using the pre-existing test helper. |
| T1 publication focus | Enter opens and focuses the panel's close button; aria-controls names its unique section; Escape closes and returns to trigger; 375px screenshot checks no horizontal overflow. |
| T2 failure/unknown | Server selection 409 cannot create an edit; edit conflict retains input; a new selection resets confirmation; FUTURE stays unknown/locked with old preview. |
| T3 version binding | User confirmation is required; REQUESTED has no success link; PUBLISHED/share/download version matches the exact POST; cover timeout stays visible; wrong-version download produces an alert and no file. Download completion restores focus for continued keyboard operation. |
| Focus boundary | If the user moves to another control while downloading, completion preserves that focus. |

Full mandatory gate (includes real API/build/browser/ZIP path):

```powershell
node tests/e2e/full/record-command.mjs gate
```

The existing recorder pins Java21/Corepack, removes runtime configuration/model credentials, records native exits/source hashes and restores old tracked evidence rewritten by legacy tests. Its metadata retains the original recorder's `task: D20-B`; D26 attribution is in this delivery's `verification.json`, without falsifying the original record.

Focused isolation regression, after the gate, using the same locked toolchain and a local deterministic-mock environment:

```powershell
node --test --test-concurrency=1 tests/security/runner/network.test.mjs tests/security/runner/store.test.mjs tests/security/runner/site.test.mjs tests/security/runner/browser.test.mjs tests/security/runner/build.test.mjs tests/e2e/share/screenshot.acceptance.mjs
```

This executes production network/redirect/secret/path/ownership/deadline/resource policies using real containers/Chromium where applicable; screenshot HTTPS transports are explicit doubles. It never grants access to arbitrary private networks or modifies production deployment configuration. Actual results and output digests are in `evidence/verification.json`.

`evidence/keyboard-red.*` retains the two baseline failures (exit1), `download-focus-red.*` the first 3/4 run (exit1). `keyboard-green.*` records the final five-test targeted run; the committed PNGs belong to named UI fixtures. Initial module-loader setup errors remain in local history and were not counted as product failures/passes. No skipped tests, hidden errors, paid-model calls or automatic test retries were used. Real-model quality, natural FAILED protection, production automatic cover capture and D26-A review remain the separately documented release blockers.
