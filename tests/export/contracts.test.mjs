import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { verify, FIXED, DEFAULTS } from './verify-export.mjs'

const url = p => new URL('../../' + p, import.meta.url)
const read = async p => JSON.parse(await readFile(url(p), 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true }); addFormats(ajv)
const EVIDENCE = 'tests/export/evidence/2026-10-19/'
const ROUTE = '/api/v0/versions/{versionId}/export'

test('OpenAPI fragment: one owner GET, ZIP with digest headers, JSON errors, no selector parameters', async () => {
  const patch = await read('contracts/export/openapi.patch.json'), api = await read('contracts/openapi.v0.json')
  assert.deepEqual(Object.keys(patch.paths), [ROUTE])
  const item = patch.paths[ROUTE]
  assert.deepEqual(Object.keys(item).sort(), ['get', 'parameters'])
  assert.deepEqual(item.parameters.map(p => [p.name, p.in, p.required]), [['versionId', 'path', true]])
  assert.equal(item.get.parameters, undefined, 'no path/file/version query selector')
  assert.deepEqual(item.get.security, [{ sessionCookie: [] }])
  assert.deepEqual(Object.keys(item.get.responses), ['200', '400', '401', '404', '409', '503'])
  const ok = item.get.responses['200']
  assert.deepEqual(Object.keys(ok.content), ['application/zip'])
  for (const header of ['Content-Disposition', 'Cache-Control', 'X-Content-Type-Options', 'X-CodeLess-Version-Id', 'X-CodeLess-Source-Digest',
    'X-CodeLess-Artifact-Digest', 'X-CodeLess-Content-Digest']) assert.ok(ok.headers[header], header)
  for (const status of ['400', '401', '404', '409', '503'])
    assert.deepEqual(item.get.responses[status].content, { 'application/json': { schema: { $ref: './schemas/v0/error.schema.json' } } })
  // Shared registration is the maintainer's; once registered it must equal this reviewed fragment.
  if (api.paths[ROUTE]) assert.deepEqual(api.paths[ROUTE], item)
})

test('manifest schema is strict and accepts the actual exported manifest only', async () => {
  const validate = ajv.compile(await read('contracts/export/manifest.schema.json'))
  const manifest = (await read(EVIDENCE + 'D16-A-T4.json')).manifest
  assert.equal(validate(manifest), true, JSON.stringify(validate.errors))
  const bad = [
    { ...manifest, extra: true }, { ...manifest, protocol: 'codeless-source-export/v2' }, { ...manifest, status: 'DRAFT' },
    { ...manifest, sourceDigest: 'sha256:' + 'A'.repeat(64) }, { ...manifest, toolchain: { node: 'latest', pnpm: '12.6.0' } },
    { ...manifest, files: manifest.files.slice(0, 3) },
    ...['.env', 'node_modules/vue/index.js', 'dist/index.html', 'src/pages/../../.env', 'logs/api.log', 'allowed-dependencies.json',
      'src/pages/Home.ts', 'codeless-export.json']
      .map(path => ({ ...manifest, files: [...manifest.files.slice(1), { ...manifest.files[0], path }] })),
    { ...manifest, files: [...manifest.files.slice(1), { ...manifest.files[0], origin: 'MANIFEST' }] },
  ]
  for (const value of bad) assert.equal(validate(value), false, JSON.stringify(value).slice(0, 120))
})

test('independent verifier re-checks the published evidence archive against the recorded hashes', async () => {
  const t4 = await read(EVIDENCE + 'D16-A-T4.json')
  const zip = (await readdir(url(EVIDENCE))).filter(name => /^export-[0-9a-f-]{36}\.zip$/.test(name))
  assert.equal(zip.length, 1)
  const result = verify(await readFile(url(EVIDENCE + zip[0])), { versionId: t4.manifest.versionId,
    sourceDigest: t4.manifest.sourceDigest, artifactDigest: t4.manifest.artifactDigest })
  assert.deepEqual(result.failures, [])
  assert.equal(result.archiveDigest, t4.archiveSha256)
  assert.deepEqual(result.recomputed, { contentDigest: t4.manifest.contentDigest, sourceDigest: t4.manifest.sourceDigest,
    templateDigest: t4.manifest.templateDigest })
  const t1 = await read(EVIDENCE + 'D16-A-T1.json')
  assert.equal(t1.cleanBuild.status, 'PASSED'); assert.equal(t1.cleanBuild.exitCode, 0)
  assert.equal(t1.cleanBuild.archiveDigest, t4.archiveSha256)
  assert.equal(t1.artifactReproduction.artifactReproduced, true)
  assert.equal(t1.artifactReproduction.reproduction, 'REPRODUCED')
  assert.equal(t1.artifactReproduction.distDigest, t4.manifest.artifactDigest)
  // Build success and reproduction are separate: a wrong expected digest builds but exits 3, never 0.
  assert.deepEqual(t1.mismatchedExpectation, { status: 'PASSED', reproduction: 'NOT_REPRODUCED' })
  assert.equal(t1.mismatchedExpectationExit, 3)
})

test('independent verifier allowlist equals the Java implementation allowlist', async () => {
  const java = await readFile(url('services/api/src/main/java/dev/codeless/api/export/ExportTemplate.java'), 'utf8')
  const list = name => [...java.match(new RegExp(`${name} = List\\.of\\(([^;]+)\\);`))[1].matchAll(/"([^"]+)"/g)].map(m => m[1])
  assert.deepEqual(list('FIXED'), FIXED)
  assert.deepEqual(list('DEFAULTS'), DEFAULTS)
})
