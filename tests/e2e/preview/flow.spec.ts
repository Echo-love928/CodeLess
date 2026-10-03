import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

// Native Node preserves runner ESM imports; existing gate provisions locked Chromium and Vite.
test('D09-B: real builds, isolated preview iframe and refresh', async () => {
  test.setTimeout(115_000)
  const root = resolve(process.cwd(), '../..')
  const result = await new Promise<{code: number | null; output: string}>((done, reject) => {
    const child = spawn(process.execPath, ['--test', 'tests/e2e/preview/browser.acceptance.mjs'],
      { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-100_000) })
    child.stderr.on('data', chunk => { output = (output + chunk.toString()).slice(-100_000) })
    child.on('error', reject)
    child.on('close', code => done({ code, output }))
  })
  expect(result.code, result.output).toBe(0)
})
