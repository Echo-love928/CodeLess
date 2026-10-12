# D11 versions acceptance

Use D01's Java21 / Node24.16.0 / pnpm12.6.0 environment and a ready Docker daemon. No lock, isolation, timeout or dependency version changes are needed.

```powershell
node tests/versions/record-command.mjs acceptance
node tests/versions/record-command.mjs contracts
node tests/versions/record-command.mjs gate
# Read-only checkout containing B's opt-in IT / frontend tests:
node tests/versions/record-command.mjs panel --repo .local-data/d11-a/review-b-8640035
node tests/versions/record-command.mjs review-web --repo .local-data/d11-a/review-b-8640035
```

The fixed command catalog writes fresh private `.local-data/d11-a/runs/<timestamp-mode-uuid>/run.json` before launch. It records HEAD, uncommitted test changes, command, provider, native exit/signal; the child writes directly to `command.log`, avoiding inherited output-pipe EOF and shell-redirection buffering. After native exit it atomically replaces metadata with status/exit/log SHA256. Child provider is explicitly deterministic-mock; model key/name and system browser channel are removed. Build, database and bundled browser remain real. This developer utility exposes no platform API or runtime shell.

A stale RUNNING marker or missing completion/exit is **unknown**, never success. Nonzero, signal and launch errors cannot become PASSED. Raw logs stay private. `panel` in A alone correctly fails with no matching B test (exit1); do not disable Surefire's no-test failure. B's opt-in IT must exist in the specified checkout.

HTTP cases retain all original safety assertions. T1 establishes real READY and mutated-draft fixtures; if it fails, remaining cases fail explicitly with `NOT_EXECUTED_PRECONDITION_FAILED`, the original cause and diagnostic evidence before any `/versions/null` request. No assumptions, skips, retries or fabricated successes. VersionFixtureGateTest checks unavailable/failed prerequisites and preservation of the first cause. Diagnostics preserve stage, code and actual/null exit fields; raw log text stays private.

Evidence is dated. `2026-10-11` preserves earlier successes/failures, unknown local aggregate exit and separately accounted real-provider usage. `2026-10-12` contains fresh T1–T4, command records and B's exact-head real panel report/screenshots. Passing on this host does not explain the other host's Windows Docker EIO root cause.
