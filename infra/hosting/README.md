# D15-B static publication hosting

This is the B-side worker/hosting/UI delivery. The baseline has no D15-A publication controller or
authenticated deployment queue. No public DNS/certificate was supplied. **The publicly reachable,
authenticated click-to-publish milestone is not achieved by the local TLS fixture.**

## Private integration contract for D15-A

Call `createPublicationRunner(config)` from `services/runner/src/publish/workflow.mjs` only after the
authenticated owner explicitly POSTs the existing `/api/v0/publications` contract. The coordinator
must apply session/CSRF/ownership, ACTIVE application, VERIFIED immutable version, database locking,
idempotency and retained verification admission. Generated tasks/models must not call this worker.
There is no public registration endpoint or filesystem/command/tool parameter.

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
the workbench's publication button (the only production cross-directory change). It reads the exact
version, shows number/ID/source digest, requires explicit confirmation and uses existing owner/CSRF
POST and publication GET. It never calls the runner or mutates task/version state. Version changes
clear confirmation; accepted requests remain bound to the original version. Unknown/malformed or
ambiguous POST outcomes stay blocked, with no automatic retry. The existing public contract has no
idempotency/recovery endpoint for a POST whose ID was lost; D15-A must resolve that prerequisite.

SessionStorage keeps only successful/pending publication IDs and an unresolved flag scoped to owner
and application. Reload fetches server records again; stored data cannot assert PUBLISHED or supply
a URL. FAILED retains the last validated success/address. Clipboard errors offer manual copying,
and stale responses cannot update a newly opened application. Refresh is an explicit GET, never POST.
There is no list/latest publication contract: cross-device last-success discovery remains a D15-A
public contract prerequisite, and no undocumented endpoint was invented here.

## Reproduction

From repository root, fixed Node/pnpm/Java/Docker/Chromium installed:

```
node tests/e2e/deploy/record-command.mjs boundary
node tests/e2e/deploy/record-command.mjs unit
node tests/e2e/deploy/record-command.mjs hosting
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
