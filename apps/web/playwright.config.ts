import { defineConfig, devices } from '@playwright/test'
import { availableParallelism } from 'node:os'

const nativeAcceptances = [
  '**/e2e/runner/browser.spec.ts', '**/e2e/preview/flow.spec.ts',
  '**/e2e/deploy/hosting.spec.ts', '**/e2e/share/screenshot.spec.ts',
]

export default defineConfig({
  testDir: '../../tests',
  testMatch: ['**/e2e/**/*.spec.ts', '**/regression/release-ui/**/*.spec.ts'],
  globalTimeout: 120_000,
  // Native cases fork additional Docker/Chromium processes beyond these workers.
  workers: Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2))),
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  // Start native work first, one nested workload at a time, alongside UI cases.
  // The projects retain every existing case and its original deadline/assertions.
  projects: [{
    name: 'runner-chromium',
    testMatch: nativeAcceptances,
    workers: 1,
    use: {
      ...devices['Desktop Chrome'],
      channel: process.env.CODELESS_PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : undefined,
    },
  }, {
    name: 'chromium',
    testIgnore: nativeAcceptances,
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
