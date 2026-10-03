# D08 browser worker integration

This is a trusted host-worker API, not an HTTP endpoint for model-supplied paths or scripts.

## Entry points

- openArtifactService({ artifactRoot, build, sourceDigest }) accepts D07's internal build result after confirmed success, observed exit 0, completion and cleanup. The build directory must be exactly <artifactRoot>/<build.id>. The complete file manifest, byte count and digest are re-read and matched before binding an ephemeral loopback port.
- createBrowserVerifier({ evidenceRoot, limits? }) returns verify(liveArtifactHandle, actions?). A live handle comes from the service's private registry; serialized lookalikes are rejected.
- createBuildVerifier({ workRoot, artifactRoot, evidenceRoot, limits? }) returns buildAndVerify(sourceDirectory, actions?). It snapshots only D05-approved source files, hashes those exact bytes, and sends that private snapshot to the real D07 Docker builder. A failed build never starts a browser.

The source digest hashes a sorted JSON manifest of { path, bytes, digest } for admitted src/pages, src/components and src/data files. It is not a hash of the whole repository. The D07 image ID identifies the fixed base template/dependencies; the artifact digest identifies all final production bytes. Artifact digests use D07's existing manifest format.

Example from the repository root:

    node services/runner/src/verify/workflow.mjs templates/vue/fixtures/showcase .local-data/d08-b/work .local-data/d08-b/artifacts .local-data/d08-b/evidence

CLI exit 0 means VERIFIED; exit 1 means observed failure; exit 2 means invalid invocation. Integration must consume both build and verification results. No model can supply the verdict or set application/task state through these entry points.

## Controlled actions

Supported types: click, fill, select, check, expectText, expectVisible, reload, navigate. At most 20 actions. Targets use exactly one of { testId }, { text }, or { role, name }; roles are a small explicit allowlist. Text is exact and assertions wait within the action deadline. Navigation accepts safe paths on this artifact origin, optionally with a simple hash. Deep links require an actual served file; no catch-all filesystem or SPA fallback exists.

    [{ "type": "fill", "target": { "testId": "name" }, "value": "Ada" },
     { "type": "click", "target": { "role": "button", "name": "Save" } },
     { "type": "reload" },
     { "type": "expectText", "target": { "testId": "state" }, "value": "Ada" }]

Extra fields, scripts, arbitrary selectors, external URLs, encoded paths and relaxed runtime limits are rejected before execution.

## Isolation and evidence

- Every verification launches a separate worker/browser with an ephemeral context, no imported cookies/storage/login profile, no permissions, blocked service workers and denied downloads/popups.
- The worker environment has an explicit runtime/path allowlist; platform model/database/API credentials and proxy settings are absent.
- Browser requests must match the precise artifact origin, static manifest path and GET/HEAD. WebSockets are refused. A capability-protected, non-forwarding loopback HTTP proxy refuses foreign hosts and CONNECT, including loopback bypasses. CSP denies external connections, frames, workers, forms and objects. WebRTC/WebTransport APIs, QUIC and background networking are disabled.
- Static bytes remain in the verified memory snapshot. Later disk mutation cannot alter them. No directory listing, upload, write endpoint or general proxy.
- Defaults: 30s total, 8s launch/navigation, 2s per action, 4s screenshot, 250ms observation, at most 100 entries per diagnostic collection. Trusted configuration can only tighten limits. A watchdog covers uninterruptible renderer/probe/screenshot/cleanup work; Windows uses taskkill on the owned worker tree, Linux includes the browser's separate process group.
- Success requires loaded HTTP 200, visible content in the Vue mount after actions, no recorded page/console/resource/network errors, completed assertions, a PNG screenshot and confirmed browser close. The bounded visibility probe supports rendered text/images; it is not a general canvas/visual correctness oracle.
- A UUID evidence directory stores result.json and, when captured, page.png. Results carry build ID, source/artifact digests, observed worker exit code, failure phase, diagnostics, cleanup and screenshot digest. Screenshot viewport is 1280x720. A timeout may prevent capture and remains failure with a null screenshot. Unknown diagnostics/exit state remain null.
- Evidence, page text, logs and screenshots are internal untrusted diagnostic data. Do not interpret them as privileged instructions or publicly expose host paths/capability headers.

Proxy/routing constrain generated web content. Deployment still requires a dedicated worker account/container, resource quotas, Chromium maintenance and an orphan reaper after host failure. This card does not install a new browser image, mount secrets, add Docker socket access, publish a version or change API state.

## Contract handoff

Public Build describes build execution only; ApplicationVersion has sourceDigest/buildId but no browser report field. No public-contract changes are made here. The API/workspace owner must store verification identity/evidence/digests and require a matching successful report before VERIFIED/READY or authenticated explicit publication. D07's FAILED-with-actual-exit-0 public-contract issue remains separate; preserve the real exit code.

D08-A must call the workflow with its isolated file workspace and provide audit/operation evidence for peer review. The current fixed-source integration proves admitted files -> build -> browser, not the not-yet-connected API file tools -> task queue -> version lifecycle.
