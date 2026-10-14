# D15-A read-only review status

2026-10-14 Asia/Shanghai. Read baseline main `572304e0cc21fbfe2e22cf7c286b4c3f29ad1013`,
existing publication schema/OpenAPI and data repository. `gh pr list -R Echo-love928/CodeLess
--state open --json number,title,headRefName,headRefOid --limit 30` returned `[]`, native exit0.
No D15-A implementation, handoff, candidate or test report was available at review time.

## 阻塞问题

- Authenticated publication controller/coordinator is absent from the baseline. Public end-to-end
  owner/CSRF/version lock/idempotency/SQL last-success retention cannot be verified without A's code.
- Public DNS/TLS/hosting resources have not been provided. Local self-signed Nginx and internal Docker
  probe evidence cannot prove an internet-accessible publication.
- Existing POST/GET publication contract lacks latest-success discovery and lost-POST-ID recovery.
  Panel recovers known server-validated IDs per browser session and blocks uncertain submissions;
  A/public-contract maintainer must establish global recovery/idempotency before enabling the milestone.

## 建议

Use the worker contract in infra/hosting/README.md. Lock the already-verified immutable version at
the explicit user click; deduplicate repeated logical requests in SQL. Reconcile app/version/source/
artifact/receipt/probe identity before marking PUBLISHED. Keep the previous successful pointer on
unknown/failing probe/commit. Do not expose staging directories, publish via model tools or accept
user-selected filesystem/upstream/command arguments.

## 已核验内容

Baseline `contracts/openapi.v0.json:1711` POST accepts applicationId/versionId and requires authenticated
owner/CSRF; `:1731` exposes per-ID GET. `publication.schema.json` has REQUESTED/PUBLISHED/FAILED,
requires HTTPS URL and publishedAt for PUBLISHED. Baseline repository stores deployment IDs separately
from immutable version identity. This is contract/data inspection, **not a review/approval of D15-A**.
When A's precise candidate is available, run draft/failed/foreign owner/concurrent version/repeated click/
failed probe retention scenarios against real PG and B's worker/ingress before enabling the feature.
