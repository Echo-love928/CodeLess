import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '../../tests',
  testMatch: ['**/e2e/**/*.spec.ts', '**/regression/release-ui/**/*.spec.ts'],
  globalTimeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  // This native acceptance has its own 115s budget. Enqueue it before UI
  // files so it gets the existing global budget instead of starting at ~78s.
  // The two projects partition the same tests; neither deadlines nor retries change.
  projects: [{
    name: 'runner-chromium',
    testMatch: '**/e2e/runner/browser.spec.ts',
    use: {
      ...devices['Desktop Chrome'],
      channel: process.env.CODELESS_PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : undefined,
    },
  }, {
    name: 'chromium',
    testIgnore: '**/e2e/runner/browser.spec.ts',
    use: {
      ...devices['Desktop Chrome'],
      channel: process.env.CODELESS_PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : undefined,
    },
  }],
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/login',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
