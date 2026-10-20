import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

test('D16-B screenshot queue and real Chromium acceptance', async () => {
  test.setTimeout(60000)
  const result = await new Promise<{ code: number | null; signal: string | null; output: string }>(done => {
    const child = spawn(process.execPath, ['--test', 'tests/e2e/share/screenshot.acceptance.mjs', 'tests/e2e/share/queue.acceptance.mjs'], { cwd: resolve('../..'), windowsHide: true })
    let output = ''
    child.stdout.on('data', bytes => { output += bytes }); child.stderr.on('data', bytes => { output += bytes })
    const timer = setTimeout(() => child.kill(), 55000)
    child.once('close', (code, signal) => { clearTimeout(timer); done({ code, signal, output }) })
  })
  expect(result.signal, result.output).toBeNull(); expect(result.code, result.output).toBe(0)
})
