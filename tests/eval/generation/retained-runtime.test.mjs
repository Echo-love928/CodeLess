import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { assertRestoredApplication, copyOriginalStore } from '../../../scripts/eval/retained-runtime.mjs'

test('a failed application with no ready version may omit the API null field', () => {
  assertRestoredApplication({ id: 'app', latestReadyVersionId: null }, { id: 'app' })
  assertRestoredApplication({ id: 'app', latestReadyVersionId: 'v1' }, { id: 'app', latestReadyVersionId: 'v1' })
})
test('missing/wrong ready versions and wrong application IDs still fail identity validation', () => {
  for (const restored of [{ id: 'other', latestReadyVersionId: 'v1' }, { id: 'app' }, { id: 'app', latestReadyVersionId: 'v2' }])
    assert.throws(() => assertRestoredApplication({ id: 'app', latestReadyVersionId: 'v1' }, restored))
  assert.throws(() => assertRestoredApplication({ id: 'app', latestReadyVersionId: null }, { id: 'app', latestReadyVersionId: 'invented' }))
})
async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'codeless-retained-store-'))
  t.after(async () => { assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true }) })
  return root
}
test('an explicitly empty original store creates no version or source files', async t => {
  const root = await temporary(t), source = join(root, 'absent-original'), destination = join(root, 'runtime/versions')
  await copyOriginalStore(source, destination, true)
  assert.deepEqual(await readdir(destination), [])
  await assert.rejects(readdir(source), { code: 'ENOENT' })
})
test('missing version, journal or model stores are rejected by default', async t => {
  const root = await temporary(t)
  await assert.rejects(copyOriginalStore(join(root, 'absent'), join(root, 'destination')), { code: 'ENOENT' })
})
test('existing immutable members copy byte-for-byte and never overwrite a prior member', async t => {
  const root = await temporary(t), source = join(root, 'source'), destination = join(root, 'destination')
  await mkdir(source); await writeFile(join(source, 'v1.json'), '{"digest":"original"}\n')
  await copyOriginalStore(source, destination)
  assert.deepEqual(await readFile(join(source, 'v1.json')), await readFile(join(destination, 'v1.json')))
  await assert.rejects(copyOriginalStore(source, destination))
  assert.equal(await readFile(join(destination, 'v1.json'), 'utf8'), '{"digest":"original"}\n')
})
