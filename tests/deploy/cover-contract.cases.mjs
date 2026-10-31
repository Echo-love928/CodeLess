import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
const read = async path => JSON.parse(await readFile(new URL('../../' + path, import.meta.url), 'utf8'))
test('cover is a pair of owner GET routes with no capture or public write endpoint', async () => {
  const api = await read('contracts/openapi.v0.json'), patch = await read('contracts/cover/openapi.patch.json')
  assert.equal(Object.keys(patch.paths).length, 2)
  for (const [path, item] of Object.entries(patch.paths)) {
    assert.deepEqual(api.paths[path], item); assert.deepEqual(Object.keys(item).sort(), ['get', 'parameters'])
    for (const code of ['200', '401', '404', '503']) assert.ok(item.get.responses[code])
  }
})
test('cover schema rejects guessed entry, invented success, leaked paths, missing nulls and excess attempts', async () => {
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true }); addFormats(ajv)
  const validate = ajv.compile(await read('contracts/cover/record.schema.json'))
  const v = { deploymentId: '11111111-1111-4111-8111-111111111111', applicationId: '22222222-2222-4222-8222-222222222222', versionId: '33333333-3333-4333-8333-333333333333',
    sourceDigest: 'sha256:' + 'a'.repeat(64), artifactDigest: 'sha256:' + 'b'.repeat(64), entryPath: '/tasks', status: 'FAILED', attempts: 0, failureCode: 'TARGET_REJECTED', imageDigest: null, imageBytes: null }
  assert.equal(validate(v), true, JSON.stringify(validate.errors))
  assert.equal(validate({ ...v, status: 'SUCCEEDED', attempts: 1, failureCode: null, imageDigest: 'sha256:' + 'c'.repeat(64), imageBytes: 240 }), true)
  for (const patch of [{ entryPath: '//127.0.0.1/' }, { entryPath: null }, { entryPath: undefined }, { attempts: 3 }, { status: 'SUCCEEDED' }, { failureCode: null }, { imageBytes: 0 }, { path: '/secret' }, { imageDigest: undefined }]) assert.equal(validate({ ...v, ...patch }), false, JSON.stringify(patch))
})
