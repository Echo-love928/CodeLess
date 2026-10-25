# D21 acceptance recovery debug report

Status: DONE_WITH_CONCERNS. Deterministic fixes are covered; real acceptance is NOT_PASSED.

## Symptom

The complete real batch `2026-10-25T07-45-54Z-real-4f814e6e` produced 2/9 READY requirements, 0/3 repaired code faults, and 2/2 expected environment stops. Six real edits remain NOT_EXECUTED because SHOW-02 and TASK-01 have no original READY base. All original attempts, failures and unknown usage are preserved.

## Root cause and fix

- TASK-01 successfully repaired its `.ts` import but repeatedly committed the identical source rather than requesting verification. RepairContext now detects a successful write returning to a previously committed source-tree digest after a real change. AgentLoop then freezes and verifies the actual candidate with unchanged original actions. This mechanism does not accept invalid proposals or declare a candidate successful.
- The system generation prompt repeated a provider transport type that appeared as an invalid application proposal. Prompts now describe only valid tool/done forms; strict parsing, duplicate-key rejection and no automatic protocol retries remain. The fuller generation constraints are restored, with extensionless TypeScript imports and concise complete-file guidance. Real provider effectiveness is not yet established.
- TASK-03 used legitimate purchase toggle buttons. Independent evaluation incorrectly required checkboxes. Both controls now undergo the same two-item marking, reload persistence, selective clear, quantity preservation and delete/reload checks. Negative persistence and destructive-clear fixtures still fail.
- PostgreSQL's initialization-only UNIX socket satisfied the old readiness check before the server restarted. Retained runtime now waits for TCP readiness. It builds its own pinned test classpath from the fixed checkout, and REAL restoration checks clean platform sources and exact original revision.

## Evidence and regressions

- RepairContextTest / GenerationContextTest cover actual digest-checked observations and unchanged initial writes.
- The repeated committed patch integration test fails on the original a3eb204 AgentLoop and passes with the fix. Database, file tools, build and browser are real; the model is deterministic MOCK.
- Browser/collector tests: 74/74 passed, including inline/flex/block accessible names, adjacent-control isolation, purchase buttons and checkboxes, and negative persistence/clear behavior.
- Retained MOCK export/restoration/login/identity validation, one actual CSRF component-edit and before/after snapshot/ledger collection passed. This represents zero real model calls and zero accepted real edits.
- Static verification passed. Repair/generation contexts and all 27 repair integration tests passed (38/38 total); the additional repeated-bad-candidate browser integration test also passed (1/1). It proves a buildable candidate still fails original browser acceptance and cannot produce a READY version. Latest-head full CI is recorded independently.
- Original batch integrity: 184/184, report recomputation succeeded, credential scan zero. Corrected independent source replay: 2/9 behavior, six edits NOT_EXECUTED. Initial 1/9 report remains preserved.
- Known actual usage: 266,765 tokens across 76 requests, three calls with unknown usage; budget charged 302,947. Unknown usage is not reported as zero.

## Limits

Offline replay of actual successful model writes verifies a TASK-01 candidate and one intermediate SHOW-02 candidate. SHOW-02's first revisited candidate still fails the original ACTION_TIMEOUT; these diagnostics never change original task results. Output-length/provider-invalid responses and HTTP failures remain real failures; the HTTP status was not captured, so its cause is unresolved. No failed individual sample is rerun or replaced. Another paid complete batch requires a concrete execution decision because the original requested sequence called for one final batch. TLS verification, conservative byte-based reservations and all runtime caps remain unchanged. The older single CI fixture 5/6 remains UNATTRIBUTED.
