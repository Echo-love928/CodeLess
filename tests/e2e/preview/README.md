

## PR22 source replay and safe loading diagnostics (2026-10-05)

`services/api/mvnw.cmd -f services/api/pom.xml -Dtest=RealSourcePreviewReplayIT test` replays A's committed two-file source through the real authenticated API, SQL, Docker build/browser, issuer, registry, nginx and iframe. Provider output and prior usage are explicit fixtures; this command makes zero new model calls and its report keeps `modelQualityAccepted=false`. The resulting source and artifact digests match A's real generated project. It cannot replace `RealPreviewPlatformAcceptanceIT` with configured DeepSeek credentials.

For a bounded timing comparison, add `-Dcodeless.preview.replay.delay-ms=25000` (six calls, about 150 seconds). Replay uses the paid entry's existing 720-second generation wait, a 240-second parent-process bound, and the unchanged UI iframe timeout. No automatic refresh, repair or model retries are added. Both `*IT` classes remain opt-in, outside default Surefire discovery.

Every shared platform entry saves `platform-diagnostics.json`, including failure: allowlisted API/preview route templates, status codes, fixed network-error enums, registry stats and received loaded/unavailable message origin/source checks. Query values, headers, cookies, raw console/error text and untrusted paths are omitted. The 256-entry buffer retains the last events after a long generation; truncation is explicit. Diagnostic write failure still runs browser/runtime/ingress cleanup. `node --test tests/e2e/preview/diagnostics.acceptance.mjs` verifies redaction and the buffer boundary.

Evidence: `tests/e2e/preview/evidence/2026-10-05/pr22-diagnostics/`. Preserve A's original failed paid run and older OOM classification failure. A passing source replay or new CI run does not establish the original failure's cause or prove fresh paid platform acceptance.
