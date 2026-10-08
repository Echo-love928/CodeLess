// Observe the original failing platform entry without changing its actions, retries or deadlines.
if(process.env.CODELESS_PREVIEW_ACCEPTANCE_MODEL==='deterministic-mock') {
  process.env.CODELESS_REPAIR_HTTP_DIAGNOSTICS='1'
  await import('./preview-http-observe.mjs')
}
await import('../../e2e/preview/platform.acceptance.mjs')
