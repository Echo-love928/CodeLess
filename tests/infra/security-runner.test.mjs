// Existing verify:runner glob and ci-gate execute every D19 security fixture.
// No skips or mocked browser/build success; infrastructure failure is a gate failure.
await import('../security/runner/store.test.mjs')
await import('../security/runner/build.test.mjs')
await import('../security/runner/network.test.mjs')
await import('../security/runner/browser.test.mjs')
await import('../security/runner/site.test.mjs')
