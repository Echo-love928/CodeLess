import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testDir: '../../tests/regression/release-ui',
  workers: 1,
  retries: 0,
  outputDir: '../../.local-data/d26-b/browser',
  reporter: [['list'], ['json', { outputFile: '../../.local-data/d26-b/playwright.json' }]],
})
