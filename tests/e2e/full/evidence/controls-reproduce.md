# Local E2E control procedure

Both controls use the original workers, assertions, deadlines and zero retries.
They are attribution experiments, not retries of the failed aggregate gate.

From a fresh task checkout with its locked dependencies installed:

```powershell
node tests/e2e/full/evidence/baseline-control.mjs
git worktree add --detach .local-data/d20-b/candidate-control b4489fec896407b085813fbdb0a9b5023306f29d
node tests/e2e/full/evidence/candidate-control.mjs
```

The candidate helper intentionally refuses to overwrite its fixed result directory.
Existing evidence directories must be preserved; use a fresh checkout for another experiment.
The baseline helper creates a new UUID directory, archives exact main commit c5bec00,
and installs its own dependencies with `--frozen-lockfile`. It never checks out, resets,
modifies or pushes main. The candidate helper installs its own locked dependencies too.

Observed results and log hashes are in `local-controls.json`: main 75/75/native0;
clean candidate 75/75 then the new full flow PASSED/native0. The original same-code
aggregate run remains FAILED/native1. These controls did not reproduce its cleanup
timeouts, so the root cause remains UNATTRIBUTED. No production fix, weakened timeout,
changed worker count, removed assertion or test retry was applied.

Original gate diagnostics are in `local-e2e-failure.txt`; full logs and trace archives
remain in the task's private `.local-data/d20-b/commands/2026-10-21T14-31-46.557Z-gate/`.
