# API gate prerequisite proposal (not applied)

Owner: the registered CI/shared test preparation maintainer; acceptance of ownership is pending.
Baseline: PR26 `2e26b30f936db718389512c1802775507b7fca1c`.

Observed run37627559420: `prepare-runtime.mjs` starts Playwright `install --with-deps chromium` inside a Java test's BeforeAll. At 240 seconds corepack returns unknown status; apt-get PID3704 remains and three subsequent classes fail on its dpkg lock. Why the first installation exceeded the limit remains UNKNOWN. Do not infer a download, mirror, interactive prompt or service restart cause without the installation trace.

`api-prepare-before-tests.patch` proposes four lines in the API CI job: frozen pnpm installation and a named, bounded Chromium setup step before Maven/test containers. These are the same locked installation commands and three-minute setup limit already used by the E2E job. Maven and every existing assertion still run after successful preparation. Failed setup keeps the gate failed and prevents later BeforeAll installation attempts. This separates host prerequisites from actual tests; it does not prove a fix for the original apt delay or process-tree lifecycle issue.

The patch is held under A's allowed tests directory. `.github/workflows/ci.yml`, `tests/agent/prepare-runtime.mjs`, versions and locks are unchanged. `git apply --check tests/agent/repair/maintainer-proposals/api-prepare-before-tests.patch` passes; it is a patch applicability check, not Linux validation. The initial malformed hunk-count check failed128 and was corrected; no patch was applied.

Before adoption, the maintainer must validate the Linux setup separately, retain full install/timeout/cleanup evidence and run all real gates. If installation times out, stop only the process tree launched by that step and confirm cleanup. Do not delete dpkg locks, kill another install, raise the timeout, swallow the error, skip checks or rerun an unchanged failed gate to erase it. Shared-script lifecycle changes need their own targeted regression.

Impact: A's repair/HTTP tests, D09 loop tests and B's real platform preview tests all depend on the same host preparation. No public API/task/model/tool contract or production/generated-container permissions change is proposed.
