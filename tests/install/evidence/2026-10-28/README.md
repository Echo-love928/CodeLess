# D23-B clean-install evidence

These are task-specific observations from the fetched main baseline plus the recorded working tree, not a claim that every acceptance case passed on a clean committed candidate.

- commands.json preserves native exit/signal, revision, input file hashes and private log digests. Earlier failures remain present.
- bootstrap.json records the initial fresh-checkout install. It reused the host content-addressable download cache; it is not a cold-cache result.
- full-runs.json and the anonymized browser log preserve the original full-product timeout. Four READY tasks and two SQL PUBLISHED rows do not replace the failed browser assertion. Raw API logs and session-bearing traces remain private.
- real-model.json records exactly one user-authorized fixed PLAN request and provider usage. No key or model response body is published. missing-model.json records a separate zero-request configuration rejection, with exit 2/BLOCKED retained in commands.json.
- export-sample.zip is the actual first-user immutable version downloaded during that run. verify-export.json independently checks its member allowlist and source/template/content hashes.
- clean-build.json/log record installation from that ZIP in a new non-root container with a fresh package store. No host node_modules or platform secret was mounted. Build success is proved; artifact byte reproduction was not requested.

Reproduce the standalone artifact without a platform account or model key:

```sh
node tests/export/verify-export.mjs tests/install/evidence/2026-10-28/export-sample.zip
node tests/export/clean-build.mjs tests/install/evidence/2026-10-28/export-sample.zip .local-data/d23-b/reproduce-new
node --test tests/install/install.test.mjs
```

The output directory must be new. tools/versions/Docker/network prerequisites are in docs/install.md. Scoped .gitattributes preserves exact evidence bytes and hashed container log across Windows/Linux checkouts. Final stage results and unresolved peer review are recorded in docs/handoffs/D23-B.md; do not inherit old CI success for a new PR HEAD.
