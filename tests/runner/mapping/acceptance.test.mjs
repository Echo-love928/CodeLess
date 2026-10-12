import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdtemp, mkdir, cp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { createServer } from 'node:http'
import { chromium } from '@playwright/test'
import { createBuildRunner } from '../../../services/runner/src/build/runner.mjs'
import { readSnapshot } from '../../../services/runner/src/artifacts/snapshot.mjs'
import { buildVersionMapping, validateManifest, resolveSelection } from '../../../services/runner/src/mapping/manifest.mjs'

const versionId = '55555555-5555-4555-8555-555555555555'
const newVersionId = '66666666-6666-4666-8666-666666666666'
const fixture = resolve('templates/vue/fixtures/mapping')
let scratch, runBuild, mapped
async function evidence(name, value) {
  console.log(`${name}: ${JSON.stringify(value)}`)
  if (process.env.CODELESS_MAPPING_EVIDENCE_DIR) {
    await mkdir(process.env.CODELESS_MAPPING_EVIDENCE_DIR, { recursive: true })
    await writeFile(join(process.env.CODELESS_MAPPING_EVIDENCE_DIR, `${name}.json`), JSON.stringify(value, null, 2) + '\n')
  }
}
before(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'codeless-d12-'))
  runBuild = await createBuildRunner({ workRoot: join(scratch, 'work'), artifactRoot: join(scratch, 'artifacts') })
  const source = await readSnapshot(fixture, { source: true })
  mapped = await buildVersionMapping({ sourceDirectory: fixture, versionId, sourceDigest: source.manifest.digest, runBuild })
  assert.equal(mapped.status, 'MAPPED', JSON.stringify(mapped))
}, { timeout: 120000 })
after(async () => {
  if (scratch) {
    assert.equal(dirname(scratch), resolve(tmpdir()))
    await rm(scratch, { recursive: true, force: true })
  }
})
const request = (componentId, patch = {}) => ({ versionId, sourceDigest: mapped.manifest.sourceDigest, componentId, ...patch })

test('D12-B-T1: real production build locates a bounded existing immutable source file', async () => {
  const selected = resolveSelection(mapped.manifest, request('shared-card'))
  assert.equal(selected.selectable, true)
  assert.equal(selected.sourceFile, 'src/components/SharedCard.vue')
  const snapshot = await readSnapshot(fixture, { source: true })
  assert.equal(snapshot.manifest.files.find(file => file.path === selected.sourceFile).digest, selected.fileDigest)
  assert.match(snapshot.buffers.get(selected.sourceFile).toString(), /data-ai-component="shared-card"/)
  assert.equal(mapped.build.exitCode, 0)
  assert.deepEqual(mapped.build.cleanup, { containerRemoved: true, workspaceRemoved: true, errors: [] })
  await evidence('D12-B-T1', { manifest: mapped.manifest, selection: selected, buildId: mapped.build.id,
    imageId: mapped.build.imageId, exitCode: mapped.build.exitCode, artifactDigest: mapped.build.artifact.digest, log: mapped.build.log })
})

test('D12-B-T2: real nested and repeated Vue instances select the same shared source scope', { timeout: 30000 }, async () => {
  const artifacts = await readSnapshot(mapped.build.artifact.directory)
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html'
    const bytes = artifacts.buffers.get(path)
    if (!bytes) { res.writeHead(404).end(); return }
    res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html')
    res.end(bytes)
  })
  let browser
  try {
    await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.locator('[data-ai-component="shared-card"]').first().waitFor()
    const markers = await page.locator('h2').evaluateAll(nodes => nodes.map(node => node.closest('[data-ai-component]')?.getAttribute('data-ai-component')))
    assert.deepEqual(markers, ['shared-card', 'shared-card', 'shared-card'])
    assert.equal(await page.locator('section [data-ai-component="shared-card"]').count(), 1)
    assert.equal(await page.locator('[data-ai-component="home-page"]').count(), 1)
    const selections = markers.map(marker => resolveSelection(mapped.manifest, request(marker)))
    assert(selections.every(selection => selection.selectable && selection.shared && selection.scope === 'SOURCE_FILE'))
    assert.equal(new Set(selections.map(selection => selection.sourceFile)).size, 1)
    await evidence('D12-B-T2', { markers, selections, browser: browser.version(), source: 'real Docker/Vue/Chromium; no model' })
  } finally {
    try { if (browser) await browser.close() }
    finally { await new Promise((done, reject) => server.close(error => error ? reject(error) : done())) }
  }
})

test('D12-B-T3: even identical source bytes cannot reuse an old version mapping', async () => {
  assert.deepEqual(resolveSelection(mapped.manifest, request('shared-card', { versionId: newVersionId })), { selectable: false, reason: 'VERSION_MISMATCH' })
  assert.deepEqual(resolveSelection(mapped.manifest, request('shared-card', { sourceDigest: 'sha256:' + 'a'.repeat(64) })), { selectable: false, reason: 'SOURCE_DIGEST_MISMATCH' })
  const changed = structuredClone(mapped.manifest); changed.versionId = newVersionId
  assert.throws(() => validateManifest(changed, mapped.manifest), /MAPPING_TAMPERED/)
  await evidence('D12-B-T3', { oldVersionId: versionId, newVersionId, sameSourceDigest: mapped.manifest.sourceDigest, result: 'VERSION_MISMATCH' })
})

test('D12-B-T4: forged paths, existing-file remaps and malformed mappings are rejected', async () => {
  const paths = ['../secret', '/etc/passwd', 'src/pages/../HomePage.vue', 'src\\components\\SharedCard.vue',
    'src/components/%2e%2e.vue', 'src/components/NUL.vue', 'src/components/Card.vue:secret', 'src/components/Missing.vue', 'src/pages/HomePage.vue']
  for (const sourceFile of paths) {
    const forged = structuredClone(mapped.manifest)
    forged.components[0].sourceFile = sourceFile
    assert.throws(() => validateManifest(forged, mapped.manifest), /INVALID_MAPPING|MAPPING_TAMPERED/)
    assert.deepEqual(resolveSelection(mapped.manifest, { ...request('shared-card'), sourceFile }), { selectable: false, reason: 'INVALID_SELECTION' })
  }
  for (const patch of [{ scope: 'DOM_INSTANCE' }, { componentId: '__proto__' }, { fileDigest: 'sha256:bad' }]) {
    const forged = structuredClone(mapped.manifest); Object.assign(forged.components[0], patch)
    assert.throws(() => validateManifest(forged, mapped.manifest), /INVALID_MAPPING/)
  }
  assert.throws(() => validateManifest({ ...mapped.manifest, arbitrary: true }), /INVALID_MAPPING/)
  await evidence('D12-B-T4', { paths, result: 'all rejected; client cannot provide sourceFile or instance scope' })
})

test('missing, dynamic, nested, fragment and duplicate identifiers disable selection in an actual build', { timeout: 120000 }, async () => {
  const source = join(scratch, 'invalid')
  await cp(fixture, source, { recursive: true })
  const variants = {
    Missing: '<main>no id</main>', Invalid: '<main data-ai-component="../bad">bad id</main>',
    Dynamic: '<main :data-ai-component="\'dynamic-id\'">dynamic</main>',
    Fragment: '<div data-ai-component="fragment-id"/><div/>',
    Nested: '<main data-ai-component="nested-id"><div data-ai-component="spoof-id"/></main>',
    DuplicateA: '<main data-ai-component="duplicate-id"/>', DuplicateB: '<main data-ai-component="duplicate-id"/>',
    Spread: '<main data-ai-component="spread-id" v-bind="{ title: \'a\' }"/>',
    RootComponent: '<SharedCard data-ai-component="root-component" label="a"/>',
    CommentOnly: '<!-- <main data-ai-component="fake-id"/> --><main/>',
    RepeatedRoot: '<article v-for="item in [1,2]" :key="item" data-ai-component="repeated-root">{{ item }}</article>',
  }
  for (const [name, template] of Object.entries(variants)) {
    const script = name === 'RootComponent' ? '<script setup lang="ts">\nimport SharedCard from "./SharedCard.vue";\n</script>\n' : ''
    await writeFile(join(source, 'src/components', name + '.vue'), script + '<template>' + template + '</template>')
  }
  const snapshot = await readSnapshot(source, { source: true })
  const result = await buildVersionMapping({ sourceDirectory: source, versionId: newVersionId, sourceDigest: snapshot.manifest.digest, runBuild })
  assert.equal(result.status, 'MAPPED', JSON.stringify(result))
  const actual = Object.fromEntries(result.manifest.disabled.map(file => [file.sourceFile.split('/').at(-1).slice(0, -4), file.reason]))
  assert.deepEqual(actual, { CommentOnly: 'MISSING_COMPONENT_ID', DuplicateA: 'DUPLICATE_COMPONENT_ID', DuplicateB: 'DUPLICATE_COMPONENT_ID',
    Dynamic: 'UNSAFE_MARKER', Fragment: 'UNSUPPORTED_ROOT', Invalid: 'INVALID_COMPONENT_ID', Missing: 'MISSING_COMPONENT_ID',
    Nested: 'UNSAFE_MARKER', RootComponent: 'UNSUPPORTED_ROOT', Spread: 'UNSAFE_MARKER' })
  assert.equal(resolveSelection(result.manifest, { versionId: newVersionId, sourceDigest: snapshot.manifest.digest, componentId: 'duplicate-id' }).reason, 'DUPLICATE_COMPONENT_ID')
  assert.equal(result.manifest.components.find(file => file.componentId === 'repeated-root').scope, 'SOURCE_FILE')
  assert.equal(resolveSelection(result.manifest, { versionId: newVersionId, sourceDigest: snapshot.manifest.digest, componentId: null }).reason, 'MISSING_COMPONENT_ID')
  await evidence('D12-B-disabled', { manifest: result.manifest, exitCode: result.build.exitCode })
})

test('source mismatch and build failure never produce a selectable manifest', async () => {
  let calls = 0
  await assert.rejects(buildVersionMapping({ sourceDirectory: fixture, versionId, sourceDigest: 'sha256:' + 'a'.repeat(64), runBuild: () => { calls++ } }), /SOURCE_DIGEST_MISMATCH/)
  assert.equal(calls, 0)
  // Explicit worker failure fixture; does not stand in for the real build above.
  const failure = { status: 'FAILED', exitCode: null, artifact: null, failure: 'RUNNER_UNAVAILABLE' }
  const result = await buildVersionMapping({ sourceDirectory: fixture, versionId, sourceDigest: mapped.manifest.sourceDigest, runBuild: async () => failure })
  assert.deepEqual(result, { status: 'BUILD_FAILED', build: failure, manifest: null })
})
