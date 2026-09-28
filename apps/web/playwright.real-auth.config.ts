import { defineConfig, devices } from '@playwright/test'

if (!process.env.CODELESS_DEMO_PASSWORD || !process.env.CODELESS_ADMIN_PASSWORD) {
  throw new Error('Set CODELESS_DEMO_PASSWORD and CODELESS_ADMIN_PASSWORD for real auth tests')
}

export default defineConfig({
  testDir: '../../tests/live-auth',
  globalTimeout: 120_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      channel: process.env.CODELESS_PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : undefined,
    },
  }],
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/login',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
