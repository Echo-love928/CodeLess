# PR #49 review fixes

Current implementation and remaining integration: `docs/handoffs/D16-B.md`, first section.
The original API failure and evidence in the parent directory remain unchanged.

- `commands.json`: all recorded review-fix attempts, including dependency/fixture
  startup failures, the stdout/stderr parsing failure and missing-image runner run.
  Final static 147/147, screenshot/maintenance 11/11, E2E 59/59 and runner 90/90 passed.
  Start HEAD and dirty file hashes are explicit; these are not mislabeled as clean-HEAD runs.
- `live-interop.json`, `live-interop-reproduced.json`: actual streamed A HTTP responses
  consumed by the unmocked B adapter, owner 200/other-owner 404/anonymous 401,
  no Content-Length, exact downloaded bytes, local version-state/input rejection.
- `live-download.zip`, `a-clean-build.json`: same actual HTTP package that A's inherited
  T1 independently extracted, installed with the frozen lockfile and built. The report
  separates exported-byte build success from the disclosed CRLF artifact diagnostic.
- `interop-origin.json`: native Maven results (6/6, then reusable harness 1/1), private
  raw log hashes and API provenance. Cookies never enter exported results.
- `source-digests.json`: exact working-tree bytes plus LF identity for checked-in text.

No new full local API/ci:gate pass is claimed. Exact new-head CI must be read from
PR #49; previous-head green checks cannot approve the new revision. Public cover
HTTP installation and end-to-end public deployment integration remain pending.

Regenerate with `node tests/e2e/share/export-review-fix-evidence.mjs` only after all
recorded commands and the isolated A/B runs have actually completed.
