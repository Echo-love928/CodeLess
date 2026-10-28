// Maintainer command for the explicitly authorized D12 enabling branch.
import { readFile, writeFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const baseText = await readFile('contracts/openapi.v0.json', 'utf8')
const base = JSON.parse(baseText)
const additions = {}
const edit = await read('contracts/edit/openapi.patch.json')
const selection = { type: 'object', additionalProperties: false, required: ['versionId', 'sourceDigest', 'componentId'], properties: {
  versionId: { type: 'string', format: 'uuid', minLength: 36, maxLength: 36 }, sourceDigest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$', minLength: 71, maxLength: 71 },
  componentId: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$', minLength: 1, maxLength: 64 },
} }
const sourceFile = { type: 'string', pattern: '^src/(pages|components)/[A-Za-z][A-Za-z0-9_-]*\\.vue$', maxLength: 240 }
const selected = { type: 'object', additionalProperties: false, required: ['selectable', 'shared', 'notice', ...selection.required, 'sourceFile', 'fileDigest', 'scope'], properties: {
  ...selection.properties, selectable: { const: true }, shared: { const: true }, notice: { type: 'string' }, sourceFile, fileDigest: selection.properties.sourceDigest, scope: { const: 'SOURCE_FILE' },
} }
const denied = { type: 'object', additionalProperties: false, required: ['selectable', 'reason'], properties: { selectable: { const: false }, reason: { type: 'string', minLength: 1 } } }
const request = { type: 'object', additionalProperties: false, required: ['baseVersionId', 'prompt', 'selection'], properties: {
  baseVersionId: selection.properties.versionId, prompt: { type: 'string', minLength: 1, maxLength: 8000, pattern: '\\S' }, selection,
} }
const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://codeless.dev/contracts/mapping/component-edit.schema.json', $defs: { selection, selected, denied, request,
  response: { type: 'object', additionalProperties: false, required: ['task', 'baseVersionId', 'source'], properties: {
    task: { $ref: '../schemas/v0/task.schema.json' }, baseVersionId: selection.properties.versionId,
    source: { type: 'object', additionalProperties: false, required: ['type', 'componentId', 'versionId', 'sourceDigest', 'sourceFile'], properties: { type: { const: 'COMPONENT' }, ...selection.properties, sourceFile } },
  } },
} }
const error = { description: 'Request rejected; no task or version mutation', content: { 'application/json': { schema: { $ref: './schemas/v0/error.schema.json' } } } }
const response = (description, schema) => ({ description, content: { 'application/json': { schema } } })
const pathParameter = name => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } })
const operation = (operationId, summary, success, body) => ({ operationId, summary, tags: ['versions'], security: [{ sessionCookie: [] }],
  ...(body ? { parameters: [{ $ref: '#/components/parameters/CsrfToken' }], requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
  responses: { ...success, ...Object.fromEntries(['400', '401', '403', '404', '409', '503'].map(code => [code, error])) },
})
const paths = {
  '/api/v0/versions/{versionId}/component-mapping': { parameters: [pathParameter('versionId')], get: operation('getComponentMapping', 'Read the immutable version component sidecar; missing legacy mappings fail closed', { 200: response('Frozen component mapping', { $ref: './mapping/manifest.schema.json' }) }) },
  '/api/v0/versions/{versionId}/component-selection': { parameters: [pathParameter('versionId')], post: operation('resolveComponentSelection', 'Resolve an untrusted ID to shared source scope', { 200: response('Selectable source or explicit disabled reason', { oneOf: [selected, denied] }) }, selection) },
  '/api/v0/applications/{applicationId}/component-edits': { parameters: [pathParameter('applicationId')], post: operation('createComponentEdit', 'Create a new draft task with an owner/base lock and server-resolved component source', { 202: response('Component modification queued; never publishes', { $ref: './mapping/component-edit.schema.json#/$defs/response' }) }, { $ref: './mapping/component-edit.schema.json#/$defs/request' }) },
}
paths['/api/v0/applications/{applicationId}/component-edits'].post.parameters.push({ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,128}$' } })
// Keep reviewed additive admission responses when regenerating an already-enabled contract.
for (const [path, route] of Object.entries(paths)) for (const status of ['429', '503']) {
  const published = base.paths[path]?.post?.responses?.[status]
  if (route.post && published?.['x-codeless-capacity-codes']) route.post.responses[status] = structuredClone(published)
}
for (const [path, route] of Object.entries(edit.paths)) {
  const value = structuredClone(route)
  if (value.post) value.post.parameters = value.post.parameters.map(p => p.name === 'X-CSRF-Token' ? { $ref: '#/components/parameters/CsrfToken' } : p)
  additions[path] = value
}
Object.assign(additions, paths)
additions['/api/v0/tasks/{taskId}/edit'].get.responses['200'].content['application/json'].schema = {
  oneOf: [{ $ref: './edit/edit.schema.json#/$defs/response' }, { $ref: './mapping/component-edit.schema.json#/$defs/response' }],
}
await writeFile('contracts/mapping/component-edit.schema.json', JSON.stringify(schema, null, 2) + '\n')
await writeFile('contracts/mapping/openapi.patch.json', JSON.stringify({ paths }, null, 2) + '\n')
const existing = Object.keys(additions).filter(path => Object.hasOwn(base.paths, path))
if (existing.length) {
  if (existing.length !== Object.keys(additions).length || existing.some(path => !isDeepStrictEqual(base.paths[path], additions[path])))
    throw new Error('Existing D12 routes differ; maintainer must inspect before updating')
} else {
  // Preserve every existing line; public contract changes should be reviewable.
  const block = JSON.stringify(additions, null, 2).slice(2, -2).split('\n').map(line => '  ' + line).join('\n')
  const marker = /("paths"\s*:\s*\{)\r?\n/
  if (!marker.test(baseText)) throw new Error('Cannot locate public paths object')
  await writeFile('contracts/openapi.v0.json', baseText.replace(marker, '$1\n' + block + ',\n'))
}
console.log('D12 CHAT and component endpoints integrated into public OpenAPI.')
