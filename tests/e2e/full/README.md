# Deterministic full-product gate (D20-B)

Run from the repository root with Node 24.16.0, Corepack pnpm 12.6.0, Java 21 and Docker:

```sh
corepack pnpm install --frozen-lockfile
node tests/e2e/full/record-command.mjs full
node tests/e2e/full/prove-failure-artifacts.mjs
```

Every invocation creates a **new PostgreSQL 17.6 container**, runs the real Flyway migrations,
asserts zero applications/tasks/builds/publications, and seeds only explicit test accounts.
Repeat that command to repeat from an empty database. No shared database, storageState,
global data reset, paid model, external account or production secret is needed.

The fixture application separately compiles against current Maven-built production classes;
it never enters the API JAR and has no production profile or route. The named `deterministic-mock`
provider creates real Vue files through the production tools. Current API orchestration,
PostgreSQL, immutable snapshots, restricted Docker builds, Chromium verification, preview
credentials/registry/gateway, component selection/editing, publication and ZIP export execute.
Two separate browser contexts log in as **ordinary USER accounts** and each creates an app,
generates Ada, edits the selected source component to Hedy, explicitly publishes it, loads
the served page, and downloads/independently verifies its real source ZIP.

The public hosting **network probe is an explicit local HTTPS fixture**. The production
`NodeDeploymentGateway` and frozen writer still run; the test entry verifies actual nginx
HTTPS bytes against every frozen asset. Local DNS is fixed to loopback, self-signed TLS is
accepted only by this fixture, and the production public probe's private-network rejection
is unchanged. This gate proves deterministic business integration, not public DNS/TLS
installation or real-model quality. Those remain separate acceptance activities.

Failure/boundary assertions include actual Chromium offline/online recovery of the same
accepted task, stale owned edit base, wrong artifact hash, nonexistent/failed export versions,
both directions of cross-user app/task/events/version/snapshot/export/deployment reads and
edit/publication writes. A fixture marker emits invalid Vue syntax; **actual nonzero build**
must fail the candidate while the old preview, public URL, latest-ready pointer and historical
ZIP remain usable. A single explicitly marked export-response corruption exercises the UI's
wrong-version download guard; other business API responses are real HTTP.

`apps/web` smoke invokes this suite **after** the existing browser suite, so `verify:e2e`
and `ci:gate` require it. Original test timeouts, workers and assertions are unchanged.
The new suite has one worker, **zero test retries**, finite actions/navigation/task polling
and a finite overall timeout. Polling observes asynchronous business states; it does not
rerun failed tests, create duplicate tasks or turn unknown states into success.

Outputs live in `.local-data/d20-b/runs/<UTC timestamp>-<UUID>/`: `run.json` records native
browser exit/signal, source SHA256, checkout reference, dirty state, clean-database counts,
SQL task/build/publication/model records and cleanup. `identities.json` maps users/apps,
tasks/versions/publications to the exact test. Successful runs retain ZIP verification JSON,
ZIPs and screenshots. Failures retain per-page screenshots, Playwright's `browser/**/trace.zip`,
JSON report and original API/browser logs. CI uploads failure diagnostics with commit/run/attempt
in the artifact name for seven days; session-bearing traces stay out of Git.

`canonical=true` requires a clean start, unchanged HEAD and unchanged source hashes. The
revision alone is never treated as tested-code identity. Command recorder outputs under
`.local-data/d20-b/commands/` preserve native exit codes/log hashes and save/restore historical
evidence images rewritten by existing suites. Preparation's `-DskipTests package` builds the
server for this fixture; it does **not** claim API tests passed. Run the existing `api`, `runner`,
`static`, `e2e` or `gate` modes separately and use their recorded results.

`prove-failure-artifacts.mjs` deliberately fails a browser assertion **after** a real verified
generation. The underlying suite must exit 1 with retries=0. The proof command exits 0 only
if that failure is preserved, a task/version and checkout/source identity are recorded,
PNG signatures and trace ZIP integrity/content pass independent checks, and owned resources
were cleaned. It uses Python's standard-library `zipfile` (Python 3 required for this proof
command only). The negative run is never relabelled as a passed business regression.
