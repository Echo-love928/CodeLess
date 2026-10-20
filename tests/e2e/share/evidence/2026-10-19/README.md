# D16-B local evidence

- `commands.json`: every recorded command, native exit/signal, start HEAD and
  working changes, toolchain, source hashes where available, raw private log path/hash.
  Early runs started at main with explicit uncommitted B changes; this does not mean
  the unchanged main itself contains B. Later static recording identifies `3fbcccf`.
- `initial-checks.json`: the initial unrecorded command outputs and their preserved
  raw log hashes, including the Windows timeout-cleanup failure. Failed runs are retained.
- `source-digests.json`: exact final source bytes plus LF-normalized hashes for Git
  comparison across Windows/Linux. Evidence bytes themselves have `-text` attributes.
- `T1-cover.png` / `T1-result.json`: real Chromium's 1280×720 PNG bound to deployment,
  version/source/artifact and image digests. The HTTPS transport is an explicitly
  injected deterministic fixture; this is **not public DNS/TLS acceptance**.
- `artifact-origin.json`: exact command run that produced the exported cover,
  its overall status, start HEAD/log hash, and the separately verified image hash.
- `T2-result.json`: actual capture abort timer, two attempts, FAILED/CAPTURE_TIMEOUT,
  unchanged PUBLISHED publication, no cover artifact.
- `T2-mobile-placeholder.png`: actual production platform UI at 375px, scrolled to
  show successful deployment/version/address beside the failed cover placeholder.
- `api-repair-failure.txt`: unchanged API suite's real failure: expected
  AGENT_REPAIR_NO_PROGRESS, observed AGENT_INTERNAL_ERROR. This is a mandatory gate
  failure, not converted into a warning or a successful test. Only CRLF/trailing
  whitespace is normalized for review; `api-repair-failure-origin.json` retains
  both hashes and the original unmodified private report location.
- `full-gate-T1-capture-timeout.json`: the retained FAILED/two-attempt outcome of
  the accidental 5-second success fixture, before aligning it with the unchanged
  12-second production default. The final default-concurrency E2E passed 59/59.

The source ZIP used by `share/flow.spec.ts` is deliberately only a byte transport
fixture. It is not a source export and cannot prove clean unzip/install/build or
secret exclusion. The user confirmed D16-A has no branch; real export integration,
cover HTTP installation and the linked public milestone remain blocked.

See `docs/handoffs/D16-B.md` for final gate counts, the API reproduction command,
ownership boundaries and integration handoff. Local raw logs and original suite
evidence regenerated during full gates remain under `.local-data/d16-b/`.
