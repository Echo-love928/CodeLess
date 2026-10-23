import { defineConfig, devices } from '@playwright/test'

if (!process.env.CODELESS_FULL_OUTPUT || !process.env.CODELESS_FULL_ORIGIN) throw new Error('Start tests/e2e/full/run.mjs first')
export default defineConfig({
  testDir: '.', testMatch: 'business.acceptance.ts', workers: 1, retries: 0,
  timeout: 180_000, globalTimeout: 200_000,
  outputDir: process.env.CODELESS_FULL_OUTPUT + '/browser',
  reporter: [['list'], ['json', { outputFile: process.env.CODELESS_FULL_OUTPUT + '/playwright.json' }]],
  expect: { timeout: 15_000 },
  use: { ...devices['Desktop Chrome'], baseURL: process.env.CODELESS_FULL_ORIGIN, ignoreHTTPSErrors: true,
    trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block', actionTimeout: 10_000, navigationTimeout: 15_000,
    launchOptions: { args: ['--host-resolver-rules=MAP *.test 127.0.0.1', '--no-proxy-server'] },
    proxy: { server: 'http://127.0.0.1:9', bypass: '*.test,127.0.0.1' } },
})
