import { defineConfig, devices } from '@playwright/test'

if (!process.env.CODELESS_DEMO_PASSWORD || !process.env.CODELESS_D06_DB_CONTAINER) {
  throw new Error('Live acceptance requires the isolated D06-A API on :8080, demo password and fixture database container')
}

export default defineConfig({
  testDir: '.',
  testMatch: 'live.acceptance.ts',
  timeout: 60000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', ...devices['Desktop Chrome'],
    channel: process.env.CODELESS_PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : undefined },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',
    cwd: '../../../apps/web',
    url: 'http://127.0.0.1:5173/login',
    reuseExistingServer: false,
  },
})
