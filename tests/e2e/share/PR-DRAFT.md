Title: feat(share): add bounded deployment cover queue and version-bound source downloads

Base: main (`03c790545041e0651ff47a819d7a1bbdd4b4be57` at task start)
Head: codex/d16-b-share-cover
State: local draft; do not merge or approve before integration and all exact-head checks pass.

Deployments need an independent cover lifecycle so screenshot timeouts cannot turn
a successful website into a failed deployment. This adds a private ID-only capture
queue with durable states, fixed deadlines, finite retries, trusted frozen-asset
binding and a restricted Chromium/HTTPS transport. The deployment panel keeps the
successful address available with a placeholder when its cover is unavailable.

Sharing now labels the deployment/version separately from the selected source
version. A provisional download adapter pins the exact version and source digest,
checks archive identity/bytes, rejects redirects and invalid responses, and discards
late results after selection/account changes.

Validation and exact command results: `docs/handoffs/D16-B.md` and
`tests/e2e/share/evidence/2026-10-19/commands.json`. Real Chromium is used; HTTP/export
fixtures are explicitly labeled. No fixture ZIP is claimed to pass clean build.

Integration is blocked on D16-A's actual export contract and source ZIP producer,
plus maintainer registration of the cover HTTP/coordinator adapter and shared
OpenAPI. These are deliberately outside B's allowed production paths. The private
adapter and installation proposal are in `services/runner/src/screenshot/README.md`.
No API, migration, root lock, CI or dependency versions were modified. Main and the
pre-existing `.idea/` are preserved. This local draft is not a remote PR or approval.
