# D10-B evidence

Date: 2026-10-07, Asia/Shanghai. Baseline origin/main adb79b86f221862a970733a406d09fd96e92250e.

commands-and-results.json contains actual command exits, private-log SHA-256 hashes/bytes and screenshot hashes. The first failed attempts remain individually recorded. ci:gate exits 0: frontend 36/36, PostgreSQL API 106/106 (0 skipped), runner 40/40, browser 33/33 (including four D10 workflows). Six remote checks are separate and must be read on the actual PR HEAD.

deterministic/runner-results.json projects actual missing-component build failure (exit 2), fixed fixture source replacement build (exit 0), controlled Chromium PASSED and wrong-text ACTION_FAILED. generated-page.png is copied only after validating the actual worker screenshot hash. The other four PNGs show the actual platform UI using these results and built assets. Reviewed all images; files contain synthetic fixture data. Fixture task and version IDs are scripted. Source/file/artifact digests and build/verifier IDs are actual runner observations.

The UI/HTTP provider is d10-source-fixture. Auth, task API, metadata, signing and bootstrap transport are explicit fixtures. Bootstrap normalizes route history and appends the loaded message, while loading the unchanged real built JS/CSS. These screenshots do not prove production signing, database persistence, automatic model repair or real-model success rate. The separate existing API/preview checks verify real authenticated platform/SQL/Docker/browser/issuer/nginx, with an explicitly named deterministic-mock model.

Real-model status: blocked by automatic approval review; no new provider request started. See real-model-payload.md for the exact synthetic request/data scope awaiting user permission. D10-A integration: no open PR or implementation found on current main; AgentLoop still lacks the actual REPAIR loop. M1 real limited repair has not been accepted.

Full outcomes, failure history, commands, peer-review boundary and token accounting are in ../../handoffs/D10-B.md. Run tests/e2e/generation/export-evidence.mjs after the documented local gate to regenerate the closed evidence projections. Raw traces/logs, TLS keys, provider keys and artifact/private absolute paths are not committed.
