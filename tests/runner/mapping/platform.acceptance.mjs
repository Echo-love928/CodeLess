// Extend the existing genuine platform acceptance, retaining every original check.
if (process.env.CODELESS_PREVIEW_ACCEPTANCE_MODEL !== 'deterministic-mock') throw new Error('Component acceptance requires explicit fixture provider')
process.env.CODELESS_COMPONENT_SELECTION_ACCEPTANCE = '1'
await import('../../../tests/agent/repair/preview-platform-http-diagnostics.acceptance.mjs')
