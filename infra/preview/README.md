# D09 preview contract and deployment

Ownership: D09-B owns API preview credentials, the gateway, and PreviewPanel.
The public OpenAPI/CI/lock/migrations remain with their registered maintainers.

POST /api/v0/applications/{applicationId}/versions/{versionId}/preview-credentials
requires the existing session + X-CSRF-Token and ownership of both matching resources.
Only ACTIVE application + VERIFIED version + matching completed SUCCEEDED build with actual exit 0 qualify.
Returns {applicationId, versionId, url, expiresAt}, no-store; 401 unauthenticated,
403 CSRF, 404 foreign/mismatched, 409 not ready, 503 missing/invalid configuration.
VERIFIED must be set by the trusted coordinator after D08's real browser evidence.
This endpoint never sets VERIFIED itself. Gateway registration separately requires the matching D08 result.

Configuration (control-plane API/gateway only):
CODELESS_PREVIEW_SIGNING_KEY: same 32 random bytes encoded as 64 lowercase hex.
CODELESS_PREVIEW_ORIGIN=https://preview.codeless-preview.test
CODELESS_PLATFORM_ORIGIN=https://platform.codeless.test
VITE_CODELESS_PREVIEW_ORIGIN: preview origin for UI hostname validation.
Use separate registrable sites. Supported suffixes: test/com/net/org/dev/app;
multi-label public suffixes are deliberately unsupported. Do not put previews under the platform site.
Wildcard DNS + TLS must cover *.preview.codeless-preview.test, including v<version UUID without hyphens>.
Platform session remains host-only HttpOnly. Generated workers never receive signing/TLS/API/database keys.

createPreviewGateway({signingKeyHex, previewOrigin, platformOrigin}) is a trusted host API.
register({applicationId,versionId,handle,verification}) accepts only a live D08 artifact handle
and matching PASSED result (exit 0, no timeout/failure, closed browser, screenshot).
It cannot be invoked over HTTP. Version mappings are immutable, bounded (1000), explicitly revoked
on retention/worker shutdown; close clears all mappings. Browser evidence must originate from
the trusted verifier, not serialized model output. Restart requires trusted re-registration.

The signed v1 credential binds app/version/build/sourceDigest/artifactDigest, issue/expiry (120s) and random nonce.
Bootstrap /__preview/start?credential=... checks the exact version Host and internal mapping,
then redirects to / and sets a host-only Secure HttpOnly SameSite=None Partitioned cookie.
Every document/resource validates expiry and all bindings again. Credentials are temporary bearer capabilities;
platform logout does not retrospectively revoke their remaining 120s without coordinator revoke.
CHIPS support is required; unsupported/blocked preview cookies show unavailable rather than loading success.
No credentials are persisted in platform storage. No-store and version-specific hosts prevent stale-version cache reuse.
The gateway uses only validated loopback artifact handles; no caller URL/path/upstream registration.
Cookie, Authorization, Forwarded, X-Forwarded-* and client capability headers are not forwarded.
No arbitrary SPA fallback; /, /tasks and /catalog use D08's exact frozen routes.

iframe and CSP sandbox allow only scripts + same-origin (generated LocalStorage requires this).
Distinct version origin isolates platform and other versions. Popups, top navigation, forms,
downloads, workers, frames, objects and external connections are blocked. frame-ancestors is the exact platform origin.
The gateway appends a small load/status bridge to HTML, so iframe load on an HTTP error is not called success.
Messages are constrained by iframe source and exact origin; they only affect display, never task verification.
Served HTML contains this transport bridge; the stored artifact/source digests remain those of the original immutable bytes.

The existing infra/compose.dev.yml preview service remains a D01 placeholder. This task provides
infra/preview/nginx.conf.template as the deployment overlay for the gateway maintained by D09-B.
Deploy the gateway on a private interface behind that TLS proxy, with Host preserved, no query/access logs,
no proxy cache, and no platform API route. It is a gateway process, not a generated-code container.
Main lacks D09-A's coordinator; wiring live verified versions, retention, public contract and production DNS/TLS
is the final enabling PR's responsibility. Deterministic fixtures do not prove full generation integration.
