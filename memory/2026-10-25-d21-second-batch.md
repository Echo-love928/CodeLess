# D21 second complete batch debug report

Status: DONE_WITH_CONCERNS for deterministic fixes. D21 acceptance remains NOT_PASSED.

## Evidence

The separately authorized batch `2026-10-25T08-55-28Z-real-0b9c7796` ran once at b8b1933 after all six CI checks and normal TLS12/JVM12/Docker/image gates passed. All 14 samples finished. Requirements: 5/9 platform READY and 5/9 independently verified behavior after locator fixes; code faults 2/3 repaired; environment faults 2/2 stopped as expected. Real edits: all six NOT_EXECUTED because the authorization required all three original bases READY and TASK-01 failed. No third paid batch is authorized.

90 requests, known actual usage 339,323 tokens, three unknown-usage calls, budget charged 377,844. Raw private output and canonical local copy have 121 identical files. Canonical verifier 184/184, report recomputation succeeds, credential scan zero. Initial directory-only verifier failure and all original/intermediate reports remain preserved. Raw source, screenshots, records, exports and sessions are not published.

## Root causes, fixes and limits

1. Both action validators rejected literal whitespace fill while allowing empty fill. This prevents testing blank form rejection. Fill now accepts string input up to the unchanged length limit; locators, assertions, types and closed fields stay strict. Java and Node share 15 vectors. Actual browser fixtures prove correct blank rejection passes and an erroneous submission fails. Old Java and Node validators fail the new regression; new code passes.
2. Prompt cleanup removed the standalone JSON keyword. Captured CAT-01 and FAULT-CODE-03 request 8 contains it only in user input; request 9 completionOnly has none in either message. Official JSON Output documentation requires the keyword and an example: https://api-docs.deepseek.com/guides/json_mode/ . Both policy forms now explicitly request JSON; a local HTTP fixture enforcing this prerequisite rejects old policies and accepts new ones without tool schemas. Numeric HTTP status is retained as fixed diagnostic text, without body/headers/secrets. The original remote status/body was discarded: this establishes a request contract defect, but attribution of each original HTTP failure remains an inference.
3. The independent evaluator confused presentation with behavior: labelled email, a whole card implemented as a button, score labels using spaces, and an initial all-district option named differently. Regression fixtures use independent DOM implementations with wrong/hidden email, wrong rating, broken category intersection and broken reset controls. The evaluator now restores the actually observed initial native option and still proves all six cards return. Original and intermediate reports are never overwritten.

Fresh checks: 32/32 targeted Java tests, 9/9 Node action/boundary tests, 81/81 browser/collector tests, static verification passed. Full latest-head CI is tracked separately.

Offline reconstruction of TASK-01 uses only digest-checked original successful writes and the unchanged second done proposal. New host grammar accepts it and the real build succeeds; original browser actions still fail pending count (expected zero, actual one). Original task stays FAILED; no source patch or offline replay is counted as real success.

Unresolved real failures: TASK-01 acceptance proposal/behavior, TASK-03 repeated reads without progress, CAT-01 HTTP error, CAT-03 malformed JSON (both parsers reject it). No parser rescue/retry, larger budget or output cap was added. Old single CI fixture 5/6 remains UNATTRIBUTED. Further paid validation requires new explicit scope authorization.
