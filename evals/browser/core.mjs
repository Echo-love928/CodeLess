import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { cases } from './cases.mjs'

export const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex')
export const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))
export async function safeFile(root, relative) {
  assert.ok(typeof relative === 'string' && relative.length < 250 && !relative.includes('\\') && !relative.startsWith('/') && relative.split('/').every(p => p && p !== '.' && p !== '..' && !p.includes(':')), 'Unsafe relative path')
  const base = await realpath(root)
  let current = base
  for (const part of relative.split('/')) {
    current = join(current, part)
    assert.equal((await lstat(current)).isSymbolicLink(), false, 'Linked input rejected')
  }
  assert.ok((await realpath(current)).startsWith(base + sep), 'Input escaped root')
  return current
}

export async function manifest(root) {
  const files = []
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix + entry.name
      const full = await safeFile(root, path)
      if (entry.isDirectory()) { assert.ok(['src', 'src/pages', 'src/components', 'src/data'].includes(path)); await visit(full, path + '/') }
      else {
        assert.match(path, /^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/)
        const info = await lstat(full)
        assert.ok(info.isFile() && info.nlink === 1 && info.size <= 131072)
        const bytes = await readFile(full)
        files.push({ path, bytes: bytes.length, digest: sha(bytes) })
        assert.ok(files.length <= 40 && files.reduce((sum, f) => sum + f.bytes, 0) <= 524288)
      }
    }
  }
  await visit(resolve(root))
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return { files, digest: sha(JSON.stringify(files)) }
}

export function verdict({ platform, build, browser, scope = null }) {
  if (platform !== 'READY') return { passed: false, failure: 'PLATFORM_FAILURE' }
  if (!build || build.status !== 'SUCCEEDED' || build.exitCode !== 0) return { passed: false, failure: 'BUILD_FAILURE_OR_UNKNOWN' }
  if (!browser || browser.status !== 'PASSED') return { passed: false, failure: browser?.failure ?? 'BROWSER_UNKNOWN' }
  if (scope && !scope.passed) return { passed: false, failure: 'EDIT_SCOPE' }
  return { passed: true, failure: null }
}

export function summarize(rows, ids = cases.map(c => c.id)) {
  assert.equal(new Set(rows.map(r => r.sampleId)).size, rows.length, 'Duplicate samples are not retries')
  assert.ok(rows.every(row => ids.includes(row.sampleId)), 'Unexpected sample')
  const samples = ids.map(id => rows.find(row => row.sampleId === id) ?? { sampleId: id, mode: 'UNKNOWN', passed: false, failure: 'MISSING_RECORD' })
  const bucket = mode => ({ denominator: ids.length, observed: samples.filter(row => row.mode === mode).length,
    passed: samples.filter(row => row.mode === mode && row.passed === true).length,
    failed: samples.filter(row => row.mode === mode && row.passed === false).length,
    notExecuted: samples.filter(row => row.mode === mode && row.passed === null).length })
  return { denominator: ids.length, samples, real: bucket('REAL'), mock: bucket('MOCK'), unknown: samples.filter(row => row.mode === 'UNKNOWN').length }
}

export async function loadBatch(directory) {
  const batchBytes = await readFile(await safeFile(directory, 'batch.json'))
  const batch = JSON.parse(batchBytes)
  assert.ok(['REAL', 'MOCK'].includes(batch.mode) && /^[A-Za-z0-9_.-]+$/.test(batch.batchId))
  assert.ok(batch.mode !== 'REAL' || (batch.realModelEvidence === true && batch.provider.id !== 'deterministic-mock'))
  const frozen = await readFile(await safeFile(directory, 'frozen/requirements.json'))
  assert.equal(sha(frozen), batch.frozen.requirements.sha256)
  const requirements = JSON.parse(frozen).requirements
  assert.deepEqual(requirements.map(r => r.id), cases.map(r => r.id), 'Frozen nine requirements differ')
  assert.deepEqual(batch.samples.filter(s => s.kind === 'REQUIREMENT').map(s => s.id), cases.map(c => c.id))
  const rows = [], taskIds = new Set()
  for (const definition of requirements) {
    const id = definition.id
    let record
    try { record = await readJSON(await safeFile(directory, `samples/${id}/record.json`)) }
    catch (error) { if (error.code !== 'ENOENT') throw error; rows.push({ sampleId: id, mode: batch.mode, missing: true }); continue }
    assert.equal(record.sampleId, id); assert.equal(record.batchId, batch.batchId); assert.equal(record.mode, batch.mode)
    assert.equal(record.attempt, 1); assert.equal(record.task.prompt, definition.prompt)
    assert.match(record.task.id, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/); assert.ok(!taskIds.has(record.task.id)); taskIds.add(record.task.id)
    assert.ok(record.modelCalls.every(call => call.provider === batch.provider.id && (batch.mode === 'MOCK' || call.model === batch.provider.model)))
    const invocation = await readJSON(await safeFile(directory, `samples/${id}/invocation-result.json`))
    const versions = record.versions ?? []
    const candidates = versions.filter(v => v.status === 'VERIFIED')
    const final = candidates.sort((a, b) => b.number - a.number)[0] ?? null
    const source = final ? record.sources.find(s => s.versionId === final.id) : null
    rows.push({ sampleId: id, mode: batch.mode, record, invocation, version: final, source, rawDigest: sha(await readFile(await safeFile(directory, `samples/${id}/record.json`))) })
  }
  return { batch, batchDigest: sha(batchBytes), rows }
}
