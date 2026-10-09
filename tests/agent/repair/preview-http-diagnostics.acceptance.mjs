// Execute B's original acceptance module and actions unchanged; only test-private observability is added.
process.env.CODELESS_REPAIR_HTTP_DIAGNOSTICS='1'
await import('./preview-http-observe.mjs')
await import('../../e2e/generation/m1-platform.acceptance.mjs')
