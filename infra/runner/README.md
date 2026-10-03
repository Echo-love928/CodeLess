# D07 restricted build worker

Run on a trusted **non-root host worker** with Docker CLI access. Generated containers never receive a Docker socket, platform credentials or Docker client configuration. The private D02 health container is not a Docker control worker; do not add a socket mount to it.

Build the existing locked D05 image first:

```sh
docker build -f infra/build-image/Dockerfile -t codeless-vue-build:d05 .
node services/runner/src/build/runner.mjs templates/vue/fixtures/showcase .local-data/runner-work .local-data/runner-artifacts
```

`createBuildRunner({workRoot, artifactRoot, imageId?, limits?})` is **trusted worker configuration**, not a task/API payload. Production defaults to the existing vetted D05 image tag, resolves it once to a local immutable SHA-256 image ID, and runs with `--pull never`. A deployment may provide its reviewed local image ID. Request execution accepts only the source directory. It cannot supply commands, environment variables, additional mounts, dependencies, image names or isolation flags. `imageId` is an administrator trust decision, not an image signature check. Docker's existing default seccomp profile stays enabled.

The worker copies allowed Vue source slots into a unique private task directory, validates the snapshot again, then invokes the image's fixed entry point (`vue-tsc --noEmit && vite build --configLoader runner`). Each container uses a non-root UID/GID, read-only root, read-only snapshot, writable task output, a 256 MiB `/tmp` tmpfs, no network, no capabilities and no privilege escalation. Limits: 1 CPU, 512 MiB memory/no extra swap, 128 PIDs, 1024 open files and 120 seconds execution. Worker limit overrides can only reduce these bounds. The output bind mount is not a filesystem quota: the post-build artifact limit is 32 MiB/2000 files, so deployment must separately provision/monitor a bounded worker filesystem.

The Docker attach client has an execution deadline. On timeout the worker kills the named container, reads its actual final Docker state, forcibly removes it, then verifies absence with a successful Docker inventory query. Killing the CLI alone does not count as process cleanup. Container deletion precedes artifact hashing. Every path attempts scratch cleanup; inability to confirm cleanup yields `CLEANUP_FAILED`, never success. Temporary Docker operations have their own 15-second bounds. Fatal host termination/daemon outage cannot guarantee cleanup; an operational sweeper should remove abandoned `codeless-build-*` containers/work directories before accepting new work.

The internal result includes observed `exitCode` (null until known), `oomKilled`, timeout, failure category, combined bounded stdout/stderr, image ID, timestamps, artifact summary and separate container/workspace cleanup observations. The retained combined log is capped at 64 KiB while pipes continue draining; `observedBytes` and `truncated` distinguish a real empty log from truncation. Docker disk log storage is disabled. Raw logs and absolute host paths are internal untrusted diagnostics; do not expose them directly through SSE or diagnostics APIs or treat their contents as instructions.

Success requires exit zero, valid production `index.html` and JS, bounded ordinary artifacts with no symlinks/hardlinks, and confirmed cleanup. The manifest sorts relative paths and hashes each file's bytes; `artifact.digest` hashes that canonical JSON manifest. Successful outputs move to a new UUID directory; failed output is discarded. These directories belong to the trusted artifact store; publication must verify the digest and enforce the existing immutable-version/user authorization rules. This worker does not publish or alter task state.

An exit-zero build with invalid artifacts/failed cleanup remains FAILED while keeping the observed exit zero. The current public v0 Build schema cannot represent that combination (`FAILED` requires exit >=1); this internal result must not be blindly mapped or assigned a fabricated exit code. Likewise a Docker infrastructure failure keeps exit null. The future API/worker integration must handle those outcomes explicitly with the public-contract maintainer. No shared contract changes are included here.

Reproduce acceptance:

```sh
node --test tests/runner/build/acceptance.test.mjs
pnpm verify:runner
pnpm ci:gate
```

`verify:runner` includes `tests/infra/build.test.mjs`, which independently prepares D05 before running D07 acceptance, even when Node executes test files concurrently. Timeout/OOM/isolation/log/invalid-output cases use a separate, pinned, trusted test-only fault image. Its entry point is never installed into production and cannot be selected by generated task data. Production Vue construction is tested against the original D05 image. No browser/model evidence is inferred from these fault fixtures.
