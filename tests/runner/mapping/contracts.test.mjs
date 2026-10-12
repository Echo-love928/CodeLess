import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import { bindCatalog, validateManifest, sourcePath } from '../../../services/runner/src/mapping/manifest.mjs'
const digest = 'sha256:' + 'a'.repeat(64)
const path = 'src/components/Card.vue'
const identity = { versionId: '55555555-5555-4555-8555-555555555555', sourceDigest: digest }
const sourceManifest = { digest, files: [{ path, bytes: 1, digest }] }
const catalog = { protocol: 'codeless-component-catalog/v1', files: [{ sourceFile: path, fileDigest: digest, componentId: 'card', disabledReason: null }] }
const schema = JSON.parse(await readFile(new URL('../../../contracts/mapping/manifest.schema.json', import.meta.url), 'utf8'))
const check = new Ajv2020({ strict: true, allErrors: true }).compile(schema)

test('mapping schema matches selectable/disabled runtime contract and rejects unsafe shape', () => {
  const manifest = bindCatalog({ catalog, sourceManifest, ...identity })
  assert.equal(check(manifest), true, JSON.stringify(check.errors))
  const disabled = bindCatalog({ catalog: { ...catalog, files: [{ ...catalog.files[0], componentId: null, disabledReason: 'MISSING_COMPONENT_ID' }] }, sourceManifest, ...identity })
  assert.equal(check(disabled), true)
  for (const patch of [{ sourceFile: '../secret.vue' }, { sourceFile: 'src/components/NUL.vue' }, { scope: 'DOM_INSTANCE' }, { fileDigest: 'bad' }, { componentId: 'Invalid' },
    { sourceFile: path + '\n' }, { componentId: 'card\n' }, { fileDigest: digest + '\n' }]) {
    const forged = structuredClone(manifest); Object.assign(forged.components[0], patch)
    assert.equal(check(forged), false)
    assert.throws(() => validateManifest(forged), /INVALID_MAPPING/)
  }
})

test('catalog digest, missing files, aliases, duplicate ID and snapshot-only binding fail closed', () => {
  for (const patch of [{ fileDigest: 'sha256:' + 'b'.repeat(64) }, { sourceFile: 'src/components/Other.vue' }]) {
    assert.throws(() => bindCatalog({ catalog: { ...catalog, files: [{ ...catalog.files[0], ...patch }] }, sourceManifest, ...identity }), /CATALOG_SOURCE_MISMATCH/)
  }
  const alias = { ...catalog, files: [...catalog.files, { ...catalog.files[0], sourceFile: 'src/components/card.vue' }] }
  assert.throws(() => bindCatalog({ catalog: alias, sourceManifest, ...identity }), /INVALID_BUILD_CATALOG/)
  const duplicate = { ...catalog, files: [...catalog.files, { ...catalog.files[0], sourceFile: 'src/pages/HomePage.vue' }] }
  const result = bindCatalog({ catalog: duplicate, sourceManifest, ...identity })
  assert.equal(result.components.length, 0)
  assert.deepEqual(result.disabled, [{ sourceFile: path, componentId: 'card', reason: 'DUPLICATE_COMPONENT_ID' }])
  assert(!result.disabled.some(file => file.sourceFile === 'src/pages/HomePage.vue'))
  for (const value of ['src/components/CON.vue', 'src/components/COM1.vue', 'src/components/Card.vue:secret', '/src/components/Card.vue', 'src/components/Card.Vue']) assert.equal(sourcePath(value), false)
})

test('unsafe marker namespace disables even a different valid target ID', () => {
  for (const disabledReason of ['UNSAFE_MARKER', 'UNSUPPORTED_ROOT']) {
    const poisoned = { ...catalog, files: [...catalog.files, { ...catalog.files[0], sourceFile: 'src/pages/HomePage.vue', componentId: 'home-page', disabledReason }] }
    const result = bindCatalog({ catalog: poisoned, sourceManifest, ...identity })
    assert.deepEqual(result.components, [])
    assert.deepEqual(result.disabled, [{ sourceFile: path, componentId: 'card', reason: 'UNSAFE_MARKER' }])
    assert.equal(check(result), true)
  }
})
