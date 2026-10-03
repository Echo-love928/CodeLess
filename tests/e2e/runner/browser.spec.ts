import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

// Run the runner's real browser acceptance where locked Chromium is provisioned by existing CI.
test('D08-B runner: build artifacts, controlled browser actions and isolation', async () => {
  test.setTimeout(115_000)
  const root = resolve(process.cwd(), '../..')
  const observed = await new Promise<{ code: number | null, output: string }>((done, reject) => {
    const child = spawn(process.execPath, ['--test', 'tests/runner/browser/acceptance.test.mjs'],
      { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => { output = (output + chunk.toString()).slice(-100_000) })
    child.stderr.on('data', (chunk) => { output = (output + chunk.toString()).slice(-100_000) })
    child.on('error', reject)
    child.on('close', (code) => done({ code, output }))
  })
  expect(observed.code, observed.output).toBe(0)
})
