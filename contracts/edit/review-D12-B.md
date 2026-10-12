# D12-B read-only review availability

Checked 2026-10-12: fetched origin/main `f67a7d1135448c102cf150816c0a1afb4ce26535`, remote branches and the latest 25 PRs via the authenticated GitHub API. No D12-B branch, PR, component mapping contract, handoff or test report was present. Latest PR was D11-B #34, already closed/merged. Existing D11 review is not D12-B evidence. No B files changed, no review approval or review message sent.

## 阻塞问题

No reviewable D12-B candidate: the four mapping checks below and actual A/B integration are NOT_EXECUTED (missing implementation/PR). This blocks claiming same-day integration complete and enabling COMPONENT requests. It does not block independently verifying the authorized CHAT modification path.

| Required B check | Status / required reproduction when candidate arrives |
| --- | --- |
| Sample component locates an existing restricted source file | NOT_EXECUTED. Obtain B's mapping for a real frozen version; retrieve D11 `/files` and `/files/content`, match sourceFile and versionId, validate actual bytes. |
| Repeated instances share modification scope | NOT_EXECUTED. Render two instances; identify the common componentId/sourceFile and show that editing shared source changes both. Do not claim single-DOM precision. |
| Old mapping rejected for a new version | NOT_EXECUTED. Take mapping version A, submit against baseVersionId B, expect a conflict before a task/workspace is created. |
| Forged path and illegal mapping rejected | NOT_EXECUTED. Try ../, absolute/device/alias/nonexistent/foreign-file paths and forged componentId, require rejection with no task/source leakage. |

## 建议

Review the proposal in `contracts/edit/edit.schema.json: componentReferenceProposal` and `contracts/edit/README.md: D12-B component integration proposal` with B when available. No agreement is assumed. Final enabling PR must register the public-contract maintainer, integrate additive OpenAPI and the mapping validator, then run real HTTP/database/build/browser acceptance. Normalized edit metadata storage can be a separate maintainer-owned migration if needed.

## 已核验内容

Reviewed the current A boundary: `services/api/src/main/java/dev/codeless/api/edit/EditController.java` strictly accepts CHAT only; COMPONENT, sourceFile, extra fields and publish flags return 400 in `EditLifecycleIntegrationTest.unauthorizedMalformedUnavailableBasesAndIdempotencyCollisionsFailClosed`. Existing shared v0 routes are unchanged. A's component reference is documented as a proposal, path syntax alone does not authorize a file, and no per-instance/AST edit is exposed. These checks do not prove B's mapping correctness, safety, test coverage or scope; those remain unavailable for review.
