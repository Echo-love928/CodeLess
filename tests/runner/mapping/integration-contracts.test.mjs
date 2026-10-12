import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const schema = await read('../../../contracts/mapping/component-edit.schema.json')
const api = await read('../../../contracts/openapi.v0.json')
const patch = await read('../../../contracts/mapping/openapi.patch.json')
const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv)
ajv.addSchema(await read('../../../contracts/schemas/v0/task.schema.json'), 'https://codeless.dev/contracts/schemas/v0/task.schema.json')
ajv.addSchema(schema)
const check = kind => ajv.getSchema(`${schema.$id}#/$defs/${kind}`)
const id = '55555555-5555-4555-8555-555555555555', digest = 'sha256:' + 'a'.repeat(64)
const selection = { versionId: id, sourceDigest: digest, componentId: 'profile-card' }
test('public OpenAPI includes every enabling path and session/CSRF/error boundary', () => {
  for (const [path, route] of Object.entries(patch.paths)) {
    assert.deepEqual(api.paths[path], route)
    const operation = route.get ?? route.post
    assert.deepEqual(operation.security, [{ sessionCookie: [] }])
    for (const code of ['400', '401', '403', '404', '409', '503']) assert.equal(operation.responses[code].content['application/json'].schema.$ref, './schemas/v0/error.schema.json')
    if (route.post) assert(route.post.parameters.some(p => p.$ref === '#/components/parameters/CsrfToken'))
  }
  for (const path of ['/api/v0/applications/{applicationId}/edits', '/api/v0/tasks/{taskId}/edit']) assert(api.paths[path])
})
test('closed component identity and edit request reject path, instance, publish and forged version', () => {
  const request = { baseVersionId: id, prompt: '修改共享介绍', selection }
  assert.equal(check('request')(request), true)
  for (const invalid of [{ ...request, publish: true }, { ...request, prompt: ' ' }, { ...request, selection: { ...selection, sourceFile: 'src/pages/HomePage.vue' } },
    { ...request, selection: { ...selection, instanceId: 'dom-1' } }, { ...request, selection: { ...selection, versionId: 'current' } },
    { ...request, selection: { ...selection, sourceDigest: digest + '\n' } }, { ...request, selection: { ...selection, componentId: 'profile-card\n' } }]) assert.equal(check('request')(invalid), false)
})

test('actual authenticated version snapshot declares the optional immutable sidecar digest', async () => {
  const versions = new Ajv2020({ strict: true, allErrors: true }); addFormats(versions)
  versions.addSchema(await read('../../../contracts/schemas/v0/version.schema.json'), 'https://codeless.dev/contracts/schemas/v0/version.schema.json')
  const schema = await read('../../../contracts/versions/response.schema.json'); versions.addSchema(schema)
  const validate = versions.getSchema(`${schema.$id}#/$defs/snapshot`)
  const snapshot = await read('./evidence/2026-10-12/integration/snapshot-public.json')
  assert.equal(snapshot.status, 'VERIFIED')
  assert.match(snapshot.validation.report.componentMappingDigest, /^sha256:[a-f0-9]{64}$/)
  assert.equal(validate(snapshot), true, JSON.stringify(validate.errors))
  const legacy = structuredClone(snapshot); delete legacy.validation.report.componentMappingDigest
  assert.equal(validate(legacy), true)
  for (const invalid of [null, 'sha256:bad', snapshot.validation.report.componentMappingDigest + '\n']) {
    const forged = structuredClone(snapshot); forged.validation.report.componentMappingDigest = invalid
    assert.equal(validate(forged), false)
  }
})
