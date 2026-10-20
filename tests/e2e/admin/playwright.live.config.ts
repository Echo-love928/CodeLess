import { defineConfig, devices } from '@playwright/test'
if (!process.env.CODELESS_ADMIN_LIVE_WEB_ORIGIN) throw new Error('Start the isolated live harness first')
export default defineConfig({ testDir: '.', testMatch: 'real.acceptance.ts', workers: 1, globalTimeout: 120_000,
  outputDir: process.env.CODELESS_ADMIN_LIVE_OUTPUT + '/browser', reporter: [['list']],
  use: { baseURL: process.env.CODELESS_ADMIN_LIVE_WEB_ORIGIN, timezoneId: 'Asia/Shanghai', trace: 'retain-on-failure', ...devices['Desktop Chrome'] } })
