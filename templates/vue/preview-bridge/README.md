# D13-B selector bridge

The trusted gateway injects `renderPreviewSelector` before generated resources. It binds the server-issued
version and source digest and the exact configured platform origin. No source paths or credentials enter
the selector protocol. It does not alter the immutable build artifact.

Protocol: `codeless-selector/v1`. All messages have closed shapes; unknown/extra fields are ignored.

| Direction | Type | Exact fields after protocol/type |
| --- | --- | --- |
| Platform → preview | probe | versionId |
| Preview → platform | ready | versionId, sourceDigest, challenge |
| Platform → preview | init | versionId, sourceDigest, nonce, challenge |
| Preview → platform | ack / exit | versionId, sourceDigest, nonce |
| Platform → preview | mode | versionId, sourceDigest, nonce, enabled (boolean) |
| Platform → preview | clear | versionId, sourceDigest, nonce |
| Preview → platform | selection | versionId, sourceDigest, nonce, componentId, instance |

The read-only probe/ready bootstrap changes no editing state. Preview creates a random UUID challenge
for each document; platform creates a fresh random UUID nonce per frame session. Preview pins the first
valid init whose challenge matches. Every command and selection/exit then requires the pinned nonce,
same version/digest, exact origin and the specific parent/frame WindowProxy. Reload, credential renewal,
version change and disposal invalidate platform sessions. No wildcard targetOrigin is used.

`componentId` is null with `instance:null` to deselect; otherwise it follows D12 lower-kebab ID rules.
`instance` is exactly `{index,count}`, integers satisfying 1 ≤ index ≤ count ≤ 10000. It is informational
only: count includes all currently rendered DOM roots with the same ID, including hidden ones. It is not
a count of all instances in the application. Sidebar explicitly warns about shared instances on other pages.
Only the nearest component root is selected. Highlight overlay is outside generated components and has
pointer-events:none; original styles/attributes remain intact. Editing intercepts pointer/click and keyboard
activation; Esc disables it locally and informs the parent. Normal preview does not intercept input.

Generated scripts remain untrusted and can observe messages within their own origin. Nonce/window checks
protect sessions and cross-window routing; they do not authenticate generated DOM. D12 trusted mapping and
the authenticated API remain the authority for sourceFile and SOURCE_FILE scope. The browser forwards only
versionId/sourceDigest/componentId. Instance data never authorizes one-instance edits or source paths.
The pre-existing codeless-preview load/error signal remains a separate display-only channel.
