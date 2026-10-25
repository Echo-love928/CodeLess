import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cases } from '../../../evals/browser/cases.mjs'
import { manifest, safeFile, sha, summarize, verdict } from '../../../evals/browser/core.mjs'
import { edits, requestFor, scopeDiff } from '../../../evals/edit/cases.mjs'

const target = 'src/pages/HomePage.vue'
const files = [ { path: target, digest: sha('before') }, { path: 'src/data/items.ts', digest: sha('stable') } ]
test('D21-B-T1: fixed nine requirements, each category has three; missing records stay failures', () => {
  assert.equal(cases.length, 9)
  for (const category of ['SHOWCASE', 'TASKS', 'CATALOG']) assert.equal(cases.filter(c => c.category === category).length, 3)
  const report = summarize([{ sampleId: 'SHOW-01', mode: 'REAL', passed: true }])
  assert.equal(report.denominator, 9); assert.equal(report.real.passed, 1); assert.equal(report.unknown, 8)
  assert.ok(report.samples.slice(1).every(sample => sample.passed === false))
  assert.throws(() => summarize([{ sampleId: 'X', mode: 'REAL' }]))
  assert.throws(() => summarize([{ sampleId: 'SHOW-01' }, { sampleId: 'SHOW-01' }]))
})
test('D21-B-T2: six requests retain only server-resolved selection fields', () => {
  assert.equal(edits.length, 6)
  for (const edit of edits) {
    const selection = { versionId: '00000000-0000-4000-8000-000000000001', sourceDigest: sha('frozen'), componentId: 'renamed-target', sourceFile: 'src/components/PortfolioPanel.vue', selectable: true, shared: true, scope: 'SOURCE_FILE' }
    const mapping = { protocol: 'codeless-component-mapping/v1', versionId: selection.versionId, sourceDigest: selection.sourceDigest, components: [{ componentId: selection.componentId, sourceFile: selection.sourceFile, scope: selection.scope, fileDigest: sha('file') }], disabled: [] }
    const request = requestFor(edit, selection, mapping)
    assert.deepEqual(Object.keys(request).sort(), ['baseVersionId', 'prompt', 'selection'])
    assert.deepEqual(Object.keys(request.selection).sort(), ['componentId', 'sourceDigest', 'versionId'])
    assert.throws(() => requestFor(edit, { ...selection, sourceFile: 'src/pages/Foreign.vue' }, mapping))
    assert.throws(() => requestFor(edit, { ...selection, selectable: false }, mapping))
  }
})
test('D21-B-T2: target must change; unrelated modifications, additions, deletions and no-op fail', () => {
  const after = files.map(file => file.path === target ? { ...file, digest: sha('after') } : file)
  assert.equal(scopeDiff(files, after, target).passed, true)
  assert.equal(scopeDiff(files, files, target).passed, false)
  assert.equal(scopeDiff(files, after.slice(0, 1), target).passed, false)
  assert.equal(scopeDiff(files, [...after, { path: 'src/data/new.ts', digest: sha('new') }], target).passed, false)
  const drift = after.map(file => ({ ...file, digest: sha('drift') }))
  assert.deepEqual(scopeDiff(files, drift, target).unrelated, ['src/data/items.ts'])
  assert.throws(() => scopeDiff([], after, target))
  assert.throws(() => scopeDiff(files, [...after, after[0]], target))
})
test('D21-B-T3: READY and successful build cannot override browser failures or unknowns', () => {
  const value = { platform: 'READY', build: { status: 'SUCCEEDED', exitCode: 0 }, browser: { status: 'PASSED' } }
  assert.equal(verdict(value).passed, true)
  for (const failure of ['WHITE_SCREEN', 'BEHAVIOR_ERROR', 'RUNTIME_ERROR']) {
    assert.deepEqual(verdict({ ...value, browser: { status: 'FAILED', failure } }), { passed: false, failure })
  }
  assert.equal(verdict({ ...value, browser: null }).passed, false)
  assert.equal(verdict({ ...value, build: { status: 'SUCCEEDED', exitCode: null } }).passed, false)
  assert.equal(verdict({ ...value, scope: { passed: false } }).failure, 'EDIT_SCOPE')
  assert.equal(verdict({ ...value, platform: 'FAILED' }).passed, false)
})
test('D21-B-T4: mock, real and unknown never share a success numerator', () => {
  const report = summarize([{ sampleId: 'SHOW-01', mode: 'MOCK', passed: true }, { sampleId: 'SHOW-02', mode: 'REAL', passed: false }])
  assert.equal(report.mock.passed, 1); assert.equal(report.real.passed, 0); assert.equal(report.real.failed, 1); assert.equal(report.unknown, 7)
})
test('source evidence rejects traversal and detects byte changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codeless-d21-'))
  try {
    await mkdir(join(root, 'src/pages'), { recursive: true }); await writeFile(join(root, target), 'before')
    const before = await manifest(root)
    await writeFile(join(root, target), 'after')
    const after = await manifest(root)
    assert.notEqual(before.digest, after.digest)
    assert.equal(before.files[0].digest, sha('before'))
    await assert.rejects(safeFile(root, '../outside'))
    await assert.rejects(safeFile(root, 'C:/outside'))
    await assert.rejects(safeFile(root, 'src\\pages\\HomePage.vue'))
  } finally { await rm(root, { recursive: true }) }
})
