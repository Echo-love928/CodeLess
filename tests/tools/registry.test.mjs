import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv from 'ajv/dist/2020.js'

const registry = JSON.parse(await readFile(new URL('../../contracts/tools/registry.json', import.meta.url), 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: true })
const schemas = new Map(registry.tools.map(tool => [tool.name, ajv.compile(tool.inputSchema)]))

test('closed registry has five file tools and the existing runner quotas', () => {
  assert.deepEqual([...schemas.keys()], ['files.list', 'files.read', 'files.create', 'files.update', 'files.delete'])
  assert.deepEqual(registry.limits, { maxFiles: 40, maxFileBytes: 131072, maxTotalBytes: 524288, maxCalls: 20 })
  for (const [name, args] of [
    ['files.list', {}], ['files.read', { path: 'src/pages/HomePage.vue' }],
    ['files.create', { path: 'src/data/Items.ts', content: '' }],
    ['files.update', { path: 'src/components/Hero.vue', content: 'x', expectedDigest: `sha256:${'a'.repeat(64)}` }],
    ['files.delete', { path: 'src/components/Hero.vue', expectedDigest: `sha256:${'a'.repeat(64)}` }]
  ]) assert.equal(schemas.get(name)(args), true, JSON.stringify(schemas.get(name).errors))
})

test('schemas reject traversal, absolute paths, protected files, injected context, missing hash and invalid types', () => {
  for (const path of ['../secret.vue', '/src/pages/A.vue', 'C:/src/pages/A.vue', 'C:src/pages/A.vue', '\\\\host\\share',
    'src\\pages\\A.vue', 'src/pages/../A.vue', 'src/pages/A.vue:ads', 'src//pages/A.vue', 'src/pages/./A.vue',
    'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'src/main.ts', 'src/router.ts', '.env',
    'src/pages/NUL.vue', 'src/data/con.ts', 'src/components/LPT9.vue']) {
    assert.equal(schemas.get('files.read')({ path }), false, path)
  }
  for (const args of [{ taskId: 'other' }, { command: 'echo arbitrary' }, { workspace: '/tmp' }])
    assert.equal(schemas.get('files.list')(args), false)
  assert.equal(schemas.get('files.update')({ path: 'src/pages/A.vue', content: 'x' }), false)
  assert.equal(schemas.get('files.delete')({ path: 'src/pages/A.vue', expectedDigest: 'unknown' }), false)
  assert.equal(schemas.get('files.create')({ path: 'src/pages/A.vue', content: null }), false)
  assert.equal(schemas.get('files.create')({ path: 'src/pages/A.vue', content: 'x'.repeat(131073) }), false)
})
