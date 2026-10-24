// Existing runner gate discovers the task's deterministic assertion tests.
await import('../eval/browser/core.test.mjs')
await import('../eval/browser/batch.test.mjs')
await import('../eval/browser/behavior.test.mjs')
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('D21-B real Docker/Vue/Chromium: nine behaviors, six edits and negative controls', { timeout: 240000 }, () => {
  const cwd = fileURLToPath(new URL('../../', import.meta.url))
  const image = spawnSync('docker', ['build', '--file', 'infra/build-image/Dockerfile', '--tag', 'codeless-vue-build:d05', '.'], { cwd, encoding: 'utf8', timeout: 180000, windowsHide: true })
  assert.equal(image.status, 0, image.stderr)
  const result = spawnSync(process.execPath, ['evals/browser/run.mjs', '--fixture'], { cwd, encoding: 'utf8', timeout: 210000, windowsHide: true })
  console.log(result.stdout)
  assert.equal(result.signal, null)
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stderr + result.stdout)
})
