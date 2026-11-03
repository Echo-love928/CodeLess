import { defineConfig, devices } from '@playwright/test'
import { availableParallelism } from 'node:os'

const nativeAcceptances = [
  '**/e2e/preview/flow.spec.ts',
  '**/e2e/deploy/hosting.spec.ts', '**/e2e/share/screenshot.spec.ts',
]

export default defineConfig({
  testDir: '../../tests',
  testMatch: ['**/e2e/**/*.spec.ts', '**/regression/release-ui/**/*.spec.ts'],
  globalTimeout: 120_000,
  // Two native lanes must not occupy every CI worker: retain one runnable UI
  // slot, while capping developer-host concurrency and nested browser pressure.
  workers: Math.min(4, Math.max(3, Math.floor(availableParallelism() / 2))),
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  // D08 keeps its original early slot. The other native workloads share one
  // additional slot: putting all four in one lane exhausted the120s global
  // budget before D16. UI work can run alongside these two bounded lanes.
  projects: [{
    name: 'runner-chromium',
    testMatch: '**/e2e/runner/browser.spec.ts',
    workers: 1,
    use: {
      ...devices['Desktop Chrome'],
      channel: process.env.CODELESS_PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : undefined,
    },
  }, {
    name: 'native-chromium',
    testMatch: nativeAcceptances,
    workers: 1,
    use: {
      ...devices['Desktop Chrome'],
      channel: process.env.CODELESS_PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : undefined,
    },
  }, {
    name: 'chromium',
    workers: 2,
    testIgnore: ['**/e2e/runner/browser.spec.ts', ...nativeAcceptances],
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
