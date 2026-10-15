import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { preflight, requiredSettings } from '../../infra/hosting/preflight.mjs'

test('publication resource check enumerates missing inputs without claiming public success', async () => {
  assert.deepEqual(await preflight({}), { status: 'BLOCKED', missing: requiredSettings, publicMilestoneReached: false })
})
test('publication resource check rejects shared sites and credential-bearing preview origins', async () => {
  const values = Object.fromEntries(requiredSettings.map(key => [key, 'not-a-path']))
  Object.assign(values, { CODELESS_PUBLICATION_ORIGIN: 'https://sites.codeless-public.test',
    CODELESS_PLATFORM_ORIGIN: 'https://app.codeless.test', CODELESS_PREVIEW_ORIGIN: 'https://preview.codeless-public.test' })
  await assert.rejects(preflight(values), /separate site/)
  values.CODELESS_PREVIEW_ORIGIN = 'https://user:password@preview.codeless-preview.test'
  await assert.rejects(preflight(values), /HTTPS origin required/)
})
test('missing public resources produce native CLI exit 2', () => {
  const env = { ...process.env }; for (const key of requiredSettings) delete env[key]
  const result = spawnSync(process.execPath, ['infra/hosting/preflight.mjs'], { encoding: 'utf8', env, windowsHide: true })
  assert.equal(result.status, 2, result.stderr)
  assert.equal(result.signal, null)
  assert.equal(JSON.parse(result.stdout).publicMilestoneReached, false)
})
