import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

test('D15-B real static publication hosting and isolated probe', async () => {
  test.setTimeout(180_000)
  const observed = await new Promise<{ code: number | null; signal: string | null; output: string }>(done => {
    const child = spawn(process.execPath, ['--test', 'tests/e2e/deploy/hosting.acceptance.mjs'], {
      cwd: resolve('../..'), env: process.env, windowsHide: true,
    })
    let output = ''
    child.stdout.on('data', bytes => { output += bytes }); child.stderr.on('data', bytes => { output += bytes })
    child.once('error', error => done({ code: null, signal: null, output: error.message }))
    child.once('close', (code, signal) => done({ code, signal, output }))
  })
  expect(observed.signal, observed.output).toBeNull()
  expect(observed.code, observed.output).toBe(0)
})
