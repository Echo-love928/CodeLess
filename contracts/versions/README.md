# D11 immutable versions contract

No public writes. All routes use the platform session and owner checks; another owner receives 404, anonymous receives 401 (including admins). JSON responses contain source as a string, never executable HTML. Success responses are `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. B must render `content` with Vue text interpolation, not `v-html`.

| Method / path | Response |
| --- | --- |
| GET `/api/v0/applications/{applicationId}/versions?page=0&size=20&status=VERIFIED` | `{items, page, size, total, latestReadyVersionId?}`. `items` use the existing v0 version schema. Optional status: DRAFT / VERIFIED / FAILED; descending number; page>=0, size 1..100. Latest pointer is independent of filters/pages. |
| GET `/api/v0/versions/{versionId}` | Existing v0 version response, unchanged. |
| GET `/api/v0/versions/{versionId}/files` | `{versionId, sourceDigest, files:[{path,bytes,digest}]}`. |
| GET `/api/v0/versions/{versionId}/files/content?path=src/pages/HomePage.vue` | `{versionId,sourceDigest,path,bytes,digest,content}`. Query path must exactly match an approved source path. |
| GET `/api/v0/versions/{versionId}/snapshot` | `{versionId,status,sourceDigest,files,validation?}`. Validation omitted for DRAFT, otherwise contains frozen source/artifact manifests and projected verification report. No host paths, raw logs, credentials or report URLs. |

`response.schema.json` defines responses and strict report projection. `openapi.patch.json` is an additive paths fragment for the public-contract maintainer; this task does not edit shared OpenAPI. The existing version detail is already advertised. New routes need maintainer integration before final UI enablement. B can independently implement against this fragment and actual acceptance reports under `tests/versions/evidence/2026-10-11/`.

Missing source snapshot (including the initial empty application shell) is 409 `SNAPSHOT_UNAVAILABLE`; it is not an empty generated source. Missing approved file is 404 `SNAPSHOT_FILE_NOT_FOUND`. Invalid path is 400 `SNAPSHOT_PATH_REJECTED`; corrupted digest/report is 503 `SNAPSHOT_DIGEST_MISMATCH`. Invalid status/paging is 400 `INVALID_REQUEST`. No mutation endpoint exists. Empty version lists return items=[] and total=0. Failure never changes latestReadyVersionId. An unavailable worker has exitCode=null, not 0.

## Storage and trusted producers

`SnapshotStore` is the persistence interface; `LocalVolumeSnapshotStore` is the only implementation. Set `codeless.versions.root` on a persistent, platform-owned local volume; default is `${codeless.agent.private-root}/versions` (or `.local-data/agent/versions` without the Agent). This volume must not be writable by generated containers. No new object service, dependency, lockfile or migration.

For each server-selected UUID: `source/`, `source-manifest.json`, `outcome/artifact/` (VERIFIED only), `outcome/report.json`, `outcome/manifest.json`. Copies use CREATE_NEW, bounded reads, forced writes and atomic directory promotion. Source identity is SHA-256 of sorted UTF-8 JSON `[{path,bytes,digest}]` with those exact key orders, matching D08/D07. Each digest is `sha256:` + lowercase hex. Source limits: 40 files, 128 KiB/file, 512 KiB total; artifact: 2000 files, 32 MiB total. UTF-8, portable paths, ancestors, links/junctions, case aliases and Unix hardlinks are checked. All source/manifest/report/artifact hashes are rechecked on snapshot read. Finalization never overwrites a previous outcome.

GENERATE takes the D08 snapshot with the original active lease; `AgentRunStore.draft` creates the version-owned source copy before DB visibility. Draft journal keeps `sourceDirectory` as the original immutable D08 snapshot for compatibility with the resident preview registry; adds `frozenSourceDirectory` for the version copy. BuildGateway consumes the version copy, and AgentEvidence verifies both before READY. The resident preview already binds `versionId/buildId/sourceDigest/artifactDigest` and serves a frozen artifact buffer, not a mutable workspace. Its physical D08 copy remains required by its existing trusted-root contract. Public source APIs only consume the version copy. Moving the gateway to the new storage root is a separate runner-maintainer change, not a prerequisite to matching IDs/hashes.

The trusted READY path revalidates the D09 receipt/browser evidence, freezes successful artifacts/report, and only then performs the existing SQL version/build/task/latest-pointer transaction. Failed results freeze FAILED reports without usable artifacts. Rejected/unavailable VERIFY results finalize a still-pending draft with a diagnostic code and unknown/null tool fields. Failures in storage/DB cannot be interpreted as READY; existing recovery journal records remain. Database is the visibility/status authority, never a filesystem directory alone.

Filesystem and PostgreSQL are not one transaction. A process crash or DB rollback may leave an unreferenced or pending `.source-*` / `.outcome-*` directory or already frozen outcome. No automatic overwrite/retry promotes it. Reconcile against DB and journal before operator cleanup; only remove orphan version directories after checking exact UUID and no active claim. Retention, backups and private-volume ACLs are deployment responsibilities. No public artifact/raw-report download is provided in this task.

## Reproduce

```powershell
. ./.local-data/d07-a/env.ps1
$env:CODELESS_VERSION_EVIDENCE_DIR = Join-Path (Get-Location) 'tests/versions/evidence/2026-10-11'
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=LocalVolumeSnapshotStoreTest,VersionHttpIntegrationTest' test
node --test tests/versions/contracts.test.mjs
pnpm ci:gate
```

The successful acceptance path uses explicitly named deterministic-mock proposals, real PostgreSQL, Docker and Chromium. Failed-worker fixture is explicitly named and does not claim a real failed build. Required D09/D10 failure and repair suites run in the API gate. No paid-model quality claim.
