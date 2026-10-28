// Existing runner gate discovers this task-specific test without shared CI/script changes.
await import('../performance/runner/acceptance.test.mjs')
await import('../performance/runner/evidence.test.mjs')
await import('../performance/runner/api-evidence.test.mjs')
await import('../performance/runner/resource-monitor.test.mjs')
