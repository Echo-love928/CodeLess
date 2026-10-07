# D09-B portable evidence

Actual date: 2026-10-03 (Asia/Shanghai). Baseline and exact commands/exit codes are in commands.json.
acceptance.json contains real Chromium observations from the final full gate:
two actual Docker Vue builds, D08 verification, HTTPS gateway and restricted platform iframe.
Platform authentication/application/credential responses in that browser test are explicitly fixtures.
Real PostgreSQL/HTTP credential issuance and ownership are verified separately by PreviewHttpTest.
Full model generation/coordinator/READY integration is unexecuted, awaiting D09-A.

The verification JSON and PNGs are copied from actual D08 reports; PNG hashes are rechecked.
Only report paths are made portable. Platform screenshots contain no browser URL/token.
TLS private keys, credentials, cookie values, traces, build outputs and raw logs stay in ignored .local-data/d09-b/.
Original failure logs are retained and hashed in commands.json; they are not relabeled as success.
Reproduce with the commands in docs/handoffs/D09-B.md.
