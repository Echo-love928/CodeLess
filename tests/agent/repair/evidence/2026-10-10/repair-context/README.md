# D10-A: recorded M1 repair-context regression

Baseline: PR #29, `00d0343e13b0cc836a14813d569ac8b23380e02a`. Branch:
`codex/d10-a-repair-context`. Commands and results: `command-results.json`;
original full local logs: `.local-data/d10-a/repair-context-{ci-gate,targeted-final}.log`.
Both exit files contain 0. The default gate passed static (41 frontend tests),
API 142/142, runner 44/44 and E2E 33/33. The explicit acceptance passed 24/24
(RepairContext 5 + strict policy 3 + repair integration 15 + same-task preview 1).

The original **paid** task `45d37a80-c152-4672-9c0c-1fcf425fa014` remains
FAILED / AGENT_MODEL_BUDGET_EXCEEDED / M1 NOT_PASSED. Its manifest's 27 artifacts
have matching digests; `history-preservation.json` records this verification.
Original usage: 10 calls, 13 tools, 30,339 input + 1,257 output = 31,596 measured
tokens. Four REPAIR reads made no patch. The old-policy regression reproduces all
accepted reservations and the next refusal: 18,720 required > 18,404 remaining.

`recorded-budget.json` projects the **same original request and observations**
through the compact context. The next patch reserves 14,487. A declared synthetic
5,180-token patch charge and full estimated 13,073-token unknown-usage done give
49,849 charged tokens. This is a conditional offline scenario, with only 151
tokens spare; it does not predict real model usage or guarantee real patch behavior.
Unknown patch usage is separately tested and correctly stops before done.

Current **zero-paid deterministic** task:
`cf18112f-4fdc-46bb-a4e7-6580df7a1979`, READY, one repair round, 12 fixture replies,
17 real tools, 49,630 charged replay/synthetic/estimated tokens. Its platform
request text differs from the original paid task, so its charge is separate from
the same-input projection above. The first ten replies/usage replay previous paid
observations; the patch is synthetic; done usage is unknown and fully charged
(12,854). There is no outer retry and no paid provider evaluation.

`D10-A-recorded-context.json` contains the full journal and original acceptance.
The fixed trusted host injection after GENERATE recreates the missing import;
this is **not a spontaneous model coding error**. Build 1 really fails with TS2307
and exit 2; the actual files.update uses the observed digest and replaces only
`../components/M1MissingCard.vue` with `../components/ProfileCard.vue`. Immutable
candidate directories in `source/` have the actual original digests. Build 2
really exits 0; controlled Chromium verification passes with the identical
actions. The same SQL task then serves the repaired version through authenticated
signed preview, with resident restart, revocation and isolation checks unchanged.
The viewed screenshot matches its recorded digest and task/version IDs.

`D10-A-repeated-read-stop.json`: FAILED / AGENT_REPAIR_NO_PROGRESS, 11 fixture
calls and 14 tools, retained fifth read receipt, no additional build/retry.
`D10-A-recorded-unknown-budget.json`: FAILED / AGENT_MODEL_BUDGET_EXCEEDED, 11
fixture calls and 14 tools, full estimated patch reservation, no done provider
call, no usable version. Existing T1–T4 and illegal protocol assertions remain.

Cleanup is observed, not inferred: `resource-cleanup.json`,
`java-project-cleanup.json` and `cleanup-process-result.json` show completed
cleanup, down exit 0, full container/network queries exit 0 with 0 remaining, and
Windows Job native exit 0 with 0 processes remaining. `artifact-manifest.json`
binds each exported byte sequence. This folder contains no real-model success
claim. M1 stays NOT_PASSED pending a separately authorized paid evaluation and B's
incremental review. Main and all historical failure evidence remain unchanged.
