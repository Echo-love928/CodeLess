# D16-B deployment covers (private adapter)

This module is implemented independently on D15 main. It does **not** register a
public HTTP endpoint, change SQL publication status, or claim D16-A export is installed.
The shared API/OpenAPI files belong to their maintainer and are unchanged.

## Coordinator installation

Create a private `queueRoot` directory outside all hosting/source roots. One
coordinator process owns that root. Instantiate `createScreenshotQueue` with:

```js
const queue = await createScreenshotQueue({
  queueRoot, hostingRoot, publicOrigin, platformOrigin, previewOrigin,
  lookupDeployment, // trusted committed SQL lookup, not request JSON
  timeoutMs: 12000, maxAttempts: 2,
})
// AFTER a committed, successful deployment. Do not await capture in the publish transaction.
await queue.enqueue(publicationId)
// An independently scheduled worker calls runNext; only one job runs at a time.
await queue.runNext()
```

`lookupDeployment(id, signal)` returns `{id, applicationId, versionId, status,
url, sourceDigest, artifactDigest}` from the authoritative deployment/version join.
Only PUBLISHED is admitted. The receipt and every frozen public file are read and
rehashed from `hostingRoot/<id>`; the URL must equal the ID-derived D15 hostname.
Never accept an upstream/path/receipt/transport/capture function from a request.
The second factory argument and resolver DNS argument are private test dependencies.

After SQL commit, enqueue failure is an ancillary failure: retain PUBLISHED and
log a fixed cover error. The coordinator must reconcile PUBLISHED records without
a queued job if it crashes between commit and enqueue. `enqueue(id)` is idempotent;
a terminal FAILED job is not silently retried on a UI refresh. Each job has at
most two attempts, a 12-second default deadline per attempt including DNS, and
up to two seconds of owned-process cleanup. Cleanup uncertainty stops retries.
Queue capacity is 100 retained deployment jobs (maximum ~600 MiB of PNGs).
An operator must archive terminal jobs only while the queue is closed; there is
no automatic deletion of publication history.

The lifetime `owner.lock` prevents two processes owning a root. `close()` drains
owned work before removing it. After a host crash, an operator must first prove
the old owner/browser processes are gone before removing this specific stale lock.
On reopening, RUNNING/RETRYING records become FAILED/CAPTURE_INTERRUPTED; no blind
replay. Corrupt/unknown state or image hashes fail closed. Atomic JSON rename is
used on the private volume; filesystem/SQL are not a distributed transaction.

## Capture isolation

The child receives only a fixed public binding/manifest, never platform secrets,
proxy variables, browser profiles or arbitrary launch arguments. Every DNS answer
must be public IPv4; one address is pinned into every Node HTTPS connection with
normal TLS/SNI verification. Redirects, cookies, compressed responses, wrong bytes
and unknown assets fail. Reads have 3-second connection/body deadlines and a
32-MiB aggregate quota. No response-supplied URL is followed.

Chromium runs a fresh context behind a non-forwarding proxy and unroutable DNS,
using D08's network restrictions. Page routes can only be fulfilled from verified
same-deployment manifest bytes; they never continue to the network. Frames,
popups, sockets, downloads, private/metadata URLs and unknown paths fail. PNGs are
1280×720 and at most 6 MiB. A parent deadline terminates the owned process tree.
The queue follows D08's separate Node/Chromium process boundary; it does not claim
this replaces an OS/container sandbox for browser vulnerabilities.

## Proposed API adapter (not yet registered)

`createCoverAdapter({queue, ownedPublication})` performs owner/binding checks on
every metadata/image read. `ownedPublication(owner,id)` must do the same
authenticated owner lookup as D15 (ADMIN has no bypass) and return the same
authoritative joined fields as above. Suggested routes, consumed by this UI:

- `GET /api/v0/publications/{id}/cover`: the queue `record` result, never a URL or private path.
- `GET /api/v0/publications/{id}/cover/image?digest=sha256:...`: exact PNG after owner,
  deployment, version/source/artifact and image-digest checks.

Use no-store/nosniff, JSON 404 for missing/unowned jobs, 401 for anonymous,
503 for corrupt private evidence, and image/png only for validated success.
Do not expose enqueue as an unauthenticated or model tool. UI refreshes only GET
the metadata; a missing adapter, timeout or image failure displays a placeholder
without discarding the successful share URL.

## D16-A export proposal — requires agreement and real integration

No export contract, implementation, or open D16-A PR was present at the initial
2026-10-19 read. `export-api.ts` is a provisional independent adapter, not a claim
that this HTTP route exists:

`GET /api/v0/versions/{id}/source-export`, authenticated/owner-scoped, no redirect,
ZIP body <=16 MiB, `Content-Length`, `Content-Type: application/zip`,
`X-Application-Id`, `X-Version-Id`, `X-Source-Digest`, `X-Archive-Digest` (SHA-256 of ZIP bytes).
The UI checks every binding and byte digest, uses an ID-derived filename and a
30-second timeout, and never falls back to the latest version. 401/403 and missing
service remain errors. Selection/account changes abort and invalidate late downloads.

A must still supply an exact immutable-version export with template/package/lock
files, secret/dependency filtering and authorization. The enabling PR must reconcile
these proposed headers/routes with A's **actual** contract and register shared
OpenAPI, install the screenshot coordinator and owner HTTP bridge, then verify:
real public URL -> exact cover -> source ZIP -> version/source/artifact records,
including clean unzip/install/build and illegal/cross-owner downloads. The current
browser ZIP fixture is explicitly only a transport fixture; it cannot prove this.

## Reproduction

Use the pinned Node/pnpm tools and installed Chromium; set `JAVA_HOME` to the
existing Java 21 installation before running `gate`. The recorder prepends that
installation's bin directory for the child processes without changing machine settings.

```text
node tests/e2e/share/record-command.mjs screenshot
node tests/e2e/share/record-command.mjs unit
node tests/e2e/share/record-command.mjs browser
node tests/e2e/share/record-command.mjs gate
```

The screenshot suite uses real Chromium with an explicitly injected deterministic
HTTPS transport, tests production DNS rejection/pinning separately, and separately
runs the real stdio process-timeout path. It proves the private module and browser
behavior, not a public TLS deployment. The browser tests use production platform UI
and explicit API/export fixtures. Full raw logs, historical evidence generated by
existing tests, command exit codes and log hashes are retained in `.local-data/d16-b`.
