# D15-B static publication hosting

This is the B-side worker/hosting/UI delivery. The reviewed A prerequisite is
[PR44](https://github.com/Echo-love928/CodeLess/pull/44), source `716abcd1ae5ad05fd75d780fc21734952326b98a`.
No public DNS/certificate was supplied. **The publicly reachable, authenticated
click-to-publish milestone is not achieved by the local TLS fixture.**

## Private integration contract for D15-A

The primary A integration is `services/runner/src/publish/java/NodeDeploymentGateway.java`,
implementing A's exact `DeploymentGateway` interface. It launches only the operator-selected,
absolute Node executable and `gateway-cli.mjs` over private stdin/stdout. No HTTP listener or
model tool is registered. A must first enforce session/CSRF/owner, VERIFIED immutable version,
PASSED retained report, database locking and idempotency. The adapter deliberately does not
pretend that asset bytes alone can independently prove a build/browser run.

In the final A/B integration checkout, install this Java source in
`services/api/src/main/java/dev/codeless/api/deploy/NodeDeploymentGateway.java` and register:

```java
@Bean
DeploymentGateway publicationHosting() {
    return new NodeDeploymentGateway(nodeExecutable, gatewayEntry, hostingRoot,
        publicOrigin, platformOrigin, previewOrigin);
}
```

All six constructor values are trusted operator configuration, never HTTP/body/model inputs.
A's default unavailable adapter is conditional on a missing gateway bean. This B branch does
not copy or modify A's API/contract files or enable the bean against a baseline missing A.
The integration test compiles the adapter with exact A production sources in a private temporary
composition and exercises the real session/PG/frozen-version chain; see reproduction below.
The final enabling PR must install the bean and register A's `contracts/deploy/openapi.patch.json`
in the shared OpenAPI under its maintainer's ownership.

Private wire input has fixed action `publish`/`probe`, the **same absolute A deadline**, and
`Payload {publicationId, versionId, artifactDigest, assets:[{path,digest,bytes:<base64>}]}`.
No source/workspace/report path, command, ingress key or user-selected URL is admitted. Each
asset is copied, canonical-base64 decoded, bounded to the existing 32MiB/2000-file limits,
rehash checked, sorted into the original path/bytes/digest manifest and matched to artifactDigest.
Only compiled public files reach the immutable publication UUID directory. Probe independently
rechecks the stored receipt and frozen bytes, derives the only allowed URL, then performs real
DNS-pinned, cert-validating, redirect-rejecting HTTPS requests in the isolated container.
The Java child's environment contains only OS/PATH/temp and these four hosting settings;
platform/model/database credentials are not inherited.

A's publish and probe share one 30-second deadline. DNS, container startup, each request and
cleanup consume its remaining time; 3 seconds are reserved for owned-container cleanup. Expired
or oversized deadlines fail, as do unknown results, nonzero exit, killed child or failed cleanup.
A hard host/daemon termination can leave an orphan as already documented by A; it cannot
produce PUBLISHED or trigger automatic deployment replay.

The original `createPublicationRunner`/live D08 handle path remains available to a same-process
trusted worker, with its original report/PNG/WeakMap checks intact. It is **not** the Java bridge.
It now also passes one 30-second deadline through publication and probing.

Configuration: existing real directories `hostingRoot`, `evidenceRoot`, HTTPS `publicOrigin`,
`platformOrigin`, `previewOrigin`. Publication must use a third registrable site (supported fixed
suffixes match D09). `hostingRoot` and its `<basename>-staging` sibling must reside on the same
filesystem, be owned by the single trusted publisher and have readable public directories (0755).
The sibling is private and must not be mounted into ingress. Generated workers never receive either
root, ingress keys, platform keys or the Docker socket.

Job:

```js
{
  deploymentId: publication.id, // UUID, immutable logical deployment identity
  version: { id, applicationId, status: 'VERIFIED', buildId, sourceDigest },
  handle,                     // live D08 openArtifactService handle, not serialized
  verification                // real D08 result, matching evidenceRoot/<id>/result.json and page.png
}
```

Publisher admits a matching PASSED/exit0/closed-browser report and PNG bytes, reads bounded frozen
artifact bytes using the worker capability, checks the complete original manifest digest, and copies
only `index.html` plus supported compiled assets. Component catalog, source maps, source and metadata
are not public. The private `__deployment.json` receipt is never served. A repeated deployment ID must
have exactly the same identity/content and unmodified disk bytes; a conflicting binding fails. Calls
with the same ID are serialized and cloned at admission. Atomically rename the completed sibling
staging directory; rename/cleanup failures remain failures, never partial success.

Workflow output is `PUBLISHED` only after the isolated public probe returns PASSED, exit0 and confirmed
container cleanup. Failures have `url:null`, nullable probe evidence and a classified failure. Persist
the receipt/probe separately; only D15-A may update SQL and the last-success pointer. Recheck the claimed
deployment/app/version/digests and owner before the commit. A failed/unknown probe must never replace
the successful pointer. A staged directory or returned receipt URL alone does not prove publication.

The public probe runs the pinned Node24.16.0 image as nonroot, read-only, bounded CPU/memory/PIDs,
no platform environment, no browser scripts, credentials, redirects or arbitrary destinations.
DNS resolves once with a deadline and rejects private/reserved/IPv6 answers; every TLS connection is
pinned to that accepted IPv4 address with normal certificate validation/SNI. This v0 needs public A
records; IPv6-only or dual-stack deployment is deliberately unavailable, not silently successful.
It checks root/index, both frozen SPA routes, every compiled resource's exact bytes/digest/type and
negative paths. Global and per-request deadlines and output/body limits apply. Only the owned UUID
container is reclaimed; cleanup failure is retained. Docker access belongs to the trusted host launcher,
never a generated-code container.

## Hosting configuration

Use an owned domain such as `https://sites.example-public.com`, separate from platform and preview;
configure wildcard public DNS `*.sites.example-public.com` and a valid matching TLS certificate.
Each publication uses `https://d<deploymentId-without-dashes>.sites.example-public.com/`.
No platform authentication cookies/API are served or proxied at this site. LocalStorage is isolated
per deployment hostname. SPA fallback is restricted to the three existing D05 routes `/`, `/tasks`,
`/catalog`. Unknown routes, missing assets, source/catalog/metadata and directory indexes return
text 404; syntactically invalid encoded traversal is rejected by Nginx's parser with 400.

Configure trusted host environment:

```
CODELESS_PUBLICATION_ORIGIN=https://sites.example-public.com
CODELESS_PLATFORM_ORIGIN=https://app.example-platform.com
CODELESS_PREVIEW_ORIGIN=https://preview.example-preview.com
CODELESS_HOSTING_CONFIG=/srv/codeless/publish/nginx.conf
CODELESS_HOSTING_ROOT=/srv/codeless/publish/sites
CODELESS_TLS_CERT=/etc/codeless/publication/server.pem
CODELESS_TLS_KEY=/etc/codeless/publication/server.key
CODELESS_PUBLIC_BIND=0.0.0.0:443
```

Run `node infra/hosting/render.mjs`, then
`docker compose --env-file <protected-host-env> -f infra/hosting/compose.yml config` and `up -d`.
The fixed existing nginx1.27.5-alpine runs as101:101 with read-only mounts, no capabilities, quotas and
private tmpfs; grant that account read access to the TLS key/config and files. This template is prepared,
not installed. Public ingress/firewall/DNS/TLS must be supplied by the deployment owner.

## Frontend

Build with `VITE_PUBLICATION_ORIGIN` equal to the configured HTTPS origin, or serve the operator-owned
static `/codeless-publication-config.json` on the **platform** origin with exactly
`{"publicOrigin":"https://sites.example-public.com"}`. Missing/invalid config disables submission;
this file is not a new API or generated-page input. DeployPanel is mounted at
the workbench's publication button. It reads the exact version and VERIFIED snapshot, checks
source/build/PASSED report/artifact binding, displays the version and digests, and requires explicit
confirmation. POST is the strict A request `{applicationId,versionId,artifactDigest}` plus session,
CSRF and an `Idempotency-Key` generated once per explicit submission. The full intent survives a
lost response/reload; an explicit retry reuses the same key/binding. Nothing automatically POSTs.
An explicit new deployment after a terminal result uses a new key.

Every cold session reads A's owner-scoped `GET /api/v0/applications/{id}/publications` and validates
its independent `latestSuccessful`, even if it is absent from the latest 100 attempts. FAILED and
unknown attempts cannot erase that validated address; unknown attempts block publishing. Browser
storage contains only pending IDs/uncertainty/the unresolved intent, never a trusted status/URL.
Refresh re-queries the server; damaged/disabled storage cannot stop server discovery. Clipboard
errors offer manual copying; stale responses cannot update another application's panel.

## Reproduction

From repository root, fixed Node/pnpm/Java/Docker/Chromium installed:

```
node tests/e2e/deploy/record-command.mjs boundary
node tests/e2e/deploy/record-command.mjs unit
node tests/e2e/deploy/record-command.mjs hosting
node tests/e2e/deploy/record-command.mjs ab
node tests/e2e/deploy/record-command.mjs static
node tests/e2e/deploy/record-command.mjs api
node tests/e2e/deploy/record-command.mjs runner
node tests/e2e/deploy/record-command.mjs e2e
```

The recorder saves native exit/signal/start/end, baseline/working changes, complete logs and SHA256
in `.local-data/d15-b/<timestamp>-<mode>/`. It keeps regenerated historical evidence privately and
restores pre-run historical bytes. The hosting test uses actual offline Docker/Vue build, D08 Chromium,
publisher, nginx HTTPS, certificate checking HTTP clients and a nonroot probe container on an internal
network. Only its separate `probe-fixture.mjs` trusts the test CA/private target; the production probe
entry rejects the same target in Docker. Its Chrome context ignores only the self-signed fixture's TLS,
has a fresh session and fixed local-host bypass/dead external proxy. These are explicit test fixtures,
not public reachability evidence. The fixture leaves only private test artifacts; named containers and
the isolated network are removed. No model request is necessary for this card's standalone tests.

The hosting fixture prepares the repository-pinned D05 image itself before using it, including in
a clean concurrent E2E job. It tests the original admission and, after closing the artifact handle,
the new frozen-payload writer against real Docker/Vue/Chromium and HTTPS bytes.

`ab` requires Java21/Maven prerequisites and the exact reviewed A commit fetched locally. It uses
`git archive` into `.local-data/d15-b/ab-*`, never switches/merges/resets either task branch or main.
It compiles the actual B Java adapter alongside unchanged A production code. A's six original
integration assertions remain, plus a seventh test sending actual frozen snapshot bytes through
Java -> private Node child -> immutable static directory. With no public DNS supplied, the real
production probe must fail closed within A's deadline; SQL/list retain the earlier explicitly seeded
A fixture success. This is real A/B failure-path integration, not a public successful deployment.
The independent local TLS test proves serving/probing the same bytes with its explicit private CA.
