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
  assert.deepEqual(actual, { CommentOnly: 'MISSING_COMPONENT_ID', DuplicateA: 'DUPLICATE_COMPONENT_ID', DuplicateB: 'DUPLICATE_COMPONENT_ID', HomePage: 'UNSAFE_MARKER', SharedCard: 'UNSAFE_MARKER', RepeatedRoot: 'UNSAFE_MARKER',
    Dynamic: 'UNSAFE_MARKER', Fragment: 'UNSUPPORTED_ROOT', Invalid: 'INVALID_COMPONENT_ID', Missing: 'MISSING_COMPONENT_ID',
    Nested: 'UNSAFE_MARKER', RootComponent: 'UNSUPPORTED_ROOT', Spread: 'UNSAFE_MARKER' })
  assert.equal(resolveSelection(result.manifest, { versionId: newVersionId, sourceDigest: snapshot.manifest.digest, componentId: 'duplicate-id' }).reason, 'DUPLICATE_COMPONENT_ID')
  assert.equal(result.manifest.components.length, 0)
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

test('R1: call-site spread and dynamic arguments cannot select another component source', { timeout: 120000 }, async () => {
  const source = join(scratch, 'call-site-overrides')
  await cp(fixture, source, { recursive: true })
  await writeFile(join(source, 'src/pages/HomePage.vue'), `<script setup lang="ts">
import SharedCard from '../components/SharedCard.vue'
const marker = 'data-ai-component'
</script>
<template><main data-ai-component="home-page">
<SharedCard label="spread" v-bind="{ 'data-ai-component': 'home-page' }" />
<section><SharedCard label="dynamic" :[marker]="'shared-card'" /></section>
<span v-bind="{ 'data-ai-component': 'shared-card' }">native spread</span>
</main></template>`)
  const snapshot = await readSnapshot(source, { source: true })
  const result = await buildVersionMapping({ sourceDirectory: source, versionId: newVersionId, sourceDigest: snapshot.manifest.digest, runBuild })
  assert.equal(result.status, 'MAPPED', JSON.stringify(result))
  const artifacts = await readSnapshot(result.build.artifact.directory)
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html'
    const bytes = artifacts.buffers.get(path)
    if (!bytes) { res.writeHead(404).end(); return }
    res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(bytes)
  })
  let browser
  try {
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.locator('h2').first().waitFor()
    const markers = await page.locator('h2').evaluateAll(nodes => nodes.map(node => node.closest('[data-ai-component]')?.getAttribute('data-ai-component')))
    // Keep the real Vue fallthrough behavior visible; disabling metadata must not
    // silently rewrite source or pretend the forged DOM is authenticated.
    assert.deepEqual(markers, ['home-page', 'shared-card'])
    const selections = markers.map(componentId => resolveSelection(result.manifest, { versionId: newVersionId, sourceDigest: snapshot.manifest.digest, componentId }))
    await evidence('D12-B-R1', { markers, selections, manifest: result.manifest, exitCode: result.build.exitCode, browser: browser.version() })
    assert(selections.every(value => !value.selectable && value.reason === 'UNSAFE_MARKER'))
    assert.equal(result.manifest.components.length, 0)
  } finally {
    try { if (browser) await browser.close() }
    finally { await new Promise(done => server.close(done)) }
  }
})

async function inspectCaseAliases(result, sourceDigest) {
  const artifacts = await readSnapshot(result.build.artifact.directory)
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html'
    const bytes = artifacts.buffers.get(path)
    if (!bytes) { res.writeHead(404).end(); return }
    res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html')
    res.end(bytes)
  })
  let browser
  try {
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.locator('h2').first().waitFor()
    const markers = await page.locator('h2').evaluateAll(nodes => nodes.map(node => node.closest('[data-ai-component]')?.getAttribute('data-ai-component')))
    const selections = markers.map(componentId => resolveSelection(result.manifest, { versionId: newVersionId, sourceDigest, componentId }))
    return { markers, selections, manifest: result.manifest, exitCode: result.build.exitCode, imageId: result.build.imageId, browser: browser.version(), realDocker: true, realChromium: true, modelRequests: 0 }
  } finally {
    try { await browser?.close() }
    finally { await new Promise(done => server.close(done)) }
  }
}

test('R2: call-site HTML marker case aliases cannot select the parent source', { timeout: 120000 }, async () => {
  const source = join(scratch, 'case-call-sites')
  await cp(fixture, source, { recursive: true })
  const page = join(source, 'src/pages/HomePage.vue')
  const content = await readFile(page, 'utf8')
  assert(content.includes('<SharedCard label="丙" />'))
  await writeFile(page, content.replace('<SharedCard label="丙" />', `<SharedCard label="uppercase" DATA-AI-COMPONENT="home-page" />
<SharedCard label="mixed" Data-Ai-Component="home-page" />
<SharedCard label="bind-uppercase" :DATA-AI-COMPONENT="'home-page'" />
<SharedCard label="bind-mixed" :Data-Ai-Component="'home-page'" />`))
  const snapshot = await readSnapshot(source, { source: true })
  const result = await buildVersionMapping({ sourceDirectory: source, versionId: newVersionId, sourceDigest: snapshot.manifest.digest, runBuild })
  assert.equal(result.status, 'MAPPED', JSON.stringify(result))
  const actual = await inspectCaseAliases(result, snapshot.manifest.digest)
  await evidence('D12-B-R2-call-sites', actual)
  // Preserve the actual fallthrough/HTML behavior; a forged marker is not rewritten.
  assert.equal(actual.markers.length, 6)
  assert.equal(actual.markers[2], 'home-page')
  assert(actual.selections.every(value => !value.selectable && value.reason === 'UNSAFE_MARKER'))
  assert.equal(result.manifest.components.length, 0)
})

test('R2: root case aliases, duplicate aliases and static bind arguments disable the namespace', { timeout: 120000 }, async () => {
  const source = join(scratch, 'case-roots')
  await cp(fixture, source, { recursive: true })
  const variants = {
    RootUpper: '<main DATA-AI-COMPONENT="upper-root"><h2>upper root</h2></main>',
    RootMixed: '<main Data-Ai-Component="mixed-root"><h2>mixed root</h2></main>',
    RootDuplicate: '<main data-ai-component="duplicate-root" DATA-AI-COMPONENT="home-page"><h2>duplicate root</h2></main>',
    RootBind: '<main data-ai-component="bind-root" :DATA-AI-COMPONENT="\'home-page\'"><h2>bind root</h2></main>',
  }
  const imports = [], calls = []
  for (const [name, template] of Object.entries(variants)) {
    await writeFile(join(source, 'src/components', name + '.vue'), '<template>' + template + '</template>')
    imports.push(`import ${name} from '../components/${name}.vue'`)
    calls.push(`<${name}/>`)
  }
  const page = join(source, 'src/pages/HomePage.vue')
  await writeFile(page, (await readFile(page, 'utf8')).replace('</script>', imports.join('\n') + '\n</script>').replace('</main>', calls.join('\n') + '\n</main>'))
  const snapshot = await readSnapshot(source, { source: true })
  const result = await buildVersionMapping({ sourceDirectory: source, versionId: newVersionId, sourceDigest: snapshot.manifest.digest, runBuild })
  assert.equal(result.status, 'MAPPED', JSON.stringify(result))
  const actual = await inspectCaseAliases(result, snapshot.manifest.digest)
  await evidence('D12-B-R2-roots', actual)
  assert.equal(actual.markers.length, 7)
  for (const name of Object.keys(variants)) assert.equal(result.manifest.disabled.find(file => file.sourceFile === `src/components/${name}.vue`)?.reason, 'UNSAFE_MARKER', name)
  assert(actual.selections.every(value => !value.selectable && value.reason === 'UNSAFE_MARKER'))
  assert.equal(result.manifest.components.length, 0)
})
