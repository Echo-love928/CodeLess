# D14-A verification and explicit restore

Additive proposal for the public-contract maintainer. No shared contract, migration, CI, lockfile,
frontend or runner changes. D13 component edit and D10 repair interfaces remain unchanged.

`POST /api/v0/applications/{applicationId}/versions/{versionId}/restore`

- Session owner + CSRF required. Exact JSON `{ "expectedCurrentVersionId": "<UUID>" }`.
  IDs require the full canonical UUID form (case insensitive). Unknown fields, paths, publication
  flags and null/malformed IDs return 400 `INVALID_REQUEST`.
- 200 JSON `{applicationId, previousVersionId, latestReadyVersionId}`; no-store/nosniff.
  `latestReadyVersionId` is the existing current usable preview **and next edit base** pointer,
  not a monotonic maximum version number after explicit restore. Version list remains sorted by number.
- App ownership and target/application membership checked before conflict details: 401 anonymous,
  403 CSRF, 404 other owner/missing app/missing or cross-application version.
- Under the application row lock (shared with edit creation and READY commit): ACTIVE required;
  VERIFIED target required; expected current must match; any QUEUED/RUNNING task blocks restore.
  409 codes respectively `RESTORE_APPLICATION_UNAVAILABLE`, `RESTORE_VERSION_UNAVAILABLE`,
  `RESTORE_VERSION_CONFLICT`, `RESTORE_TASK_ACTIVE`. No implicit cancellation/rebase/retry.
- Require a successful build record with real exit 0/artifact digest, and read/hash-check its frozen
  source, artifact and browser PASSED report. Missing snapshot 409 `SNAPSHOT_UNAVAILABLE`;
  corrupt/mismatched snapshot/report 503 (existing snapshot error codes). Unknown is never 0/success.
- Changes only application pointer/row version/update time. Same-current action validates all guards
  and is a no-op. Every immutable version, task provenance and publication row remains unchanged.
  Publication history continues pointing at the original published version. Restore does not publish.
- Preview uses the existing version-bound credential API; restore does not issue credentials or depend
  on a running preview gateway. Existing gateway readiness/credential checks still decide availability.
  Historical registry/journal and immutable storage must remain available for real preview.

Existing component edits still POST D13's exact selection `{componentId,versionId,sourceDigest}`.
The cloned draft is never current/publishable. Real build + original browser actions → VERIFIED/READY
commits a new pointer under the app lock and rechecks base. Code errors use D10 bounded repair
(3 rounds/12 model requests/20 tools/50k charged tokens/12 minutes); all repair candidates remain
immutable. Failed source, base association and actual diagnostic journal remain available; FAILED
snapshot includes real nonzero/null exit. Cancellation or failure keeps current usable version.

Reproduce with locked environment:

```powershell
. ./.local-data/d07-a/env.ps1
node tests/edit/verification/record-command.mjs acceptance
node tests/edit/verification/record-command.mjs gate
node tests/edit/verification/export-evidence.mjs
```

Models are named deterministic fixtures; PostgreSQL/Docker/Vue/Chromium are real. Synthetic model
counters and UNKNOWN provider usage are separately recorded, never real model-quality evidence.
D14-B final enabling PR must register the public additive route and test its new UI against these
semantics; A's API/preview proof does not certify unavailable D14-B UI/PR.
