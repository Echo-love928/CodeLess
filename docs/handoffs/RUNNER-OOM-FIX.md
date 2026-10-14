# Runner OOM fixture repair

2026-10-14. User-authorized follow-up to PR41's runner failure. Local repair starts from main
418290e; integration target is A's 80aa8d0. No main, public contract, dependency, CI or resource-policy changes.

## Cause and evidence

PR41 run38542704185: D07-B-T3 expected OOM but returned BUILD_EXIT, exit137, OOMKilled=false,
NO_OOM_EVENT; runner68/69 and ci-gate failed. The original Memory fixture exhausts memory in its
sole PID1 process, so an OOM immediately ends the container and its cgroup. This makes the test
depend on an asynchronous runtime watcher consuming memory.events before cgroup teardown.

Containerd documents this failure mode in [issue12260](https://github.com/containerd/containerd/issues/12260#issuecomment-3846140893).
Its [cgroup-v2 OOM watcher](https://github.com/containerd/containerd/blob/v2.1.4/pkg/oom/v2/v2.go)
publishes OOM asynchronously; the [cgroups reader](https://github.com/containerd/cgroups/blob/v3.0.5/cgroup2/manager.go#L759)
terminates when the cgroup disappears before memory.events can be read.

The historical CI log did not retain kernel counters, so it cannot independently prove the
exact lost-event timing. On local Docker29.8.0/containerd2.3.5/cgroupfs-v2 the first unchanged
acceptance returned TIMEOUT; a subsequent direct probe showed actual Docker OOM. These are
separate recorded results, not a claim to have reproduced CI's false OOMKilled locally.
The new regression against the original fixture fails because it exits before the daemon can
observe a still-live cgroup. The repair removes that lifecycle dependency with acknowledgement,
rather than relying on a sleep, resource increase, guessed OOM flag or repeated build.

## Repair

- Test-only Memory fixture uses a small PID1 guardian and a memory-consuming child. The child
  increases only its own oom_score_adj so it is the intended victim within the same 96MiB limit.
- Guardian verifies a real SIGKILL and an increase of cgroup memory.events/oom_kill, logs the
  actual memory/swap limits, and stays alive until the host observes Docker OOMKilled=true on
  its exact immutable daemon container ID. USR2 acknowledges that observation; no evidence
  within 10 seconds fails the test. This is one build, not a retry.
- A trusted host-only onContainerCreated callback starts the observer before execution. It
  receives only the daemon ID, is not supplied by generated task data, and does not change
  normal runner execution or failure classification. Invalid/throwing observers fail closed;
  the new real-container failure test confirms cleanup and unknown exit=null.
- Original OOM/exit137/timeout/artifact/cleanup assertions remain. Ordinary child SIGKILL
  still yields BUILD_EXIT/exit137/OOMKilled=false/NO_OOM_EVENT.

## Validation

Locked Node24.16.0/pnpm12.6.0, existing Docker image/dependency locks. Offline dependency install
exit0; no lock changes. Public results: tests/runner/build/evidence/2026-10-14/oom-guardian.json.
Raw logs and original failures stay in .local-data/oom-investigation with native .exit files.

- Regression before fixture repair: native1, cgroup exited before live OOM acknowledgement.
- Regression after repair: native0, 2/2 OOM and SIGKILL; actual oom_kill0→1, memory100663296,
  swap0, Docker OOMKilled=true, exit137, no artifacts, cleanup confirmed.
- Complete pnpm verify:runner: native0, 70/70, zero failures/cancelled/skipped.

Reproduce with pnpm verify:runner; focused entry is
node --test --test-name-pattern="D07-B-T3|real child SIGKILL" tests/runner/build/acceptance.test.mjs
after preparing the locked codeless-vue-build:d05 image via the existing infra/build.test.mjs entry.
Fresh Linux checks must be read on the updated exact PR41 head; prior A/B successes are not reused.
No approval, merge, main push or publication is part of this repair.
