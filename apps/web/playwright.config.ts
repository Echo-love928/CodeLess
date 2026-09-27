import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '../../tests/e2e/bootstrap',
  globalTimeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      channel: process.env.CODELESS_PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : undefined,
    },
  }],
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/login',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
