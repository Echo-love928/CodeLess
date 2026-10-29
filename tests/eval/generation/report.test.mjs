import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildReport, checkReport, writeReport } from '../../../scripts/eval/report.mjs'
import { verifyBatch } from '../../../scripts/eval/verify-batch.mjs'
import { defaultRecord, syntheticBatch } from './fixtures.mjs'
import { compareReports } from '../../../scripts/eval/final-comparison.mjs'
import { joinBehavior } from '../../../scripts/eval/final-metrics.mjs'

test('D25 missing record remains in denominator, with usage and behavior unknown', t => {
  const baseline = syntheticBatch(), candidate = syntheticBatch({ omit: ['CAT-02'] })
  t.after(() => { rmSync(baseline.parent, { recursive: true, force: true }); rmSync(candidate.parent, { recursive: true, force: true }) })
  const result = compareReports(buildReport(baseline.dir), buildReport(candidate.dir))
  assert.equal(result.requirements.denominator, 9)
  assert.equal(result.requirements.successCountDelta, -1)
  assert.equal(result.samples.find(row => row.sampleId === 'CAT-02').transition, 'REGRESSED')
  assert.equal(result.usage.candidate.requirements.totalTokens, null)
  assert.equal(result.requirements.behaviorAssertions.requirementLevelFinalSuccess, null)
})

test('D25 comparison rejects mock, configuration/model drift and replaced samples', t => {
  const batch = syntheticBatch(); t.after(() => rmSync(batch.parent, { recursive: true, force: true }))
  const report = buildReport(batch.dir)
  for (const change of [r => { r.mode = 'MOCK' }, r => { r.realModelEvidence = false },
    r => { r.frozen.runConfig = 'changed' }, r => { r.provider.model = 'other-model' },
    r => { r.requirements.denominator = 8 }, r => { r.requirements.sampleIds[0] = 'replacement' },
    r => { r.faults.results[0].sample.sampleId = 'replacement-fault' }]) {
    const candidate = structuredClone(report); change(candidate)
    assert.throws(() => compareReports(report, candidate))
  }
})

test('D25 behavior join lowers platform success and rejects unknown, mock or mismatched evidence', t => {
  const batch = syntheticBatch(); t.after(() => rmSync(batch.parent, { recursive: true, force: true }))
  const platform = buildReport(batch.dir)
  const behavior = { mode: 'REAL', batchId: platform.batchId, completedAt: '2026-10-29T10:22:00Z', status: 'FAILED', additionalModelRequests: 0,
    rows: platform.requirements.samples.map(sample => ({ sampleId: sample.sampleId, taskId: sample.taskId, mode: 'REAL', passed: true,
      rawDigest: platform.inputs['samples/' + sample.sampleId + '/record.json'], versionId: sample.finalVersion.id,
      sourceDigest: sample.finalVersion.sourceDigest, originalVerification: { status: 'PASSED' }, build: { status: 'SUCCEEDED', exitCode: 0 }, browser: { status: 'PASSED' } })) }
  behavior.rows[0].passed = false
  assert.equal(joinBehavior(platform, behavior).passed, 8)
  for (const change of [r => { r.mode = 'MOCK' }, r => { r.rows[1].mode = 'MOCK' }, r => { r.rows[1].taskId = 'other' }, r => { r.rows[1].sourceDigest = 'other' },
    r => { r.rows[1].rawDigest = 'other' }, r => { r.rows[1].passed = null }, r => { r.rows[1].build.exitCode = 1 },
    r => { r.rows.pop() }, r => { r.completedAt = null }]) {
    const invalid = structuredClone(behavior); change(invalid)
    assert.throws(() => joinBehavior(platform, invalid))
  }
})

test('D25 finalizer rejects reduced denominators and replaced platform rows', t => {
  const batch = syntheticBatch(); t.after(() => rmSync(batch.parent, { recursive: true, force: true }))
  const platform = buildReport(batch.dir)
  for (const change of [r => { r.requirements.denominator = 8 }, r => { r.requirements.sampleIds.pop() },
    r => { r.requirements.sampleIds[1] = r.requirements.sampleIds[0] }, r => { r.requirements.samples.pop() }]) {
    const invalid = structuredClone(platform); change(invalid)
    assert.throws(() => joinBehavior(invalid, {}))
  }
})

const failed = (result) => result.checks.filter((c) => !c.pass).map((c) => c.id)

test('T4: the written report equals a fresh recomputation, and any raw-record change is detected', (t) => {
  const { dir, parent } = syntheticBatch()
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  const report = writeReport(dir)
  assert.equal(report.realModelEvidence, true)
  assert.deepEqual([report.requirements.firstPass.count, report.requirements.finalSuccess.count], [9, 9])
  assert.deepEqual([report.faults.code.passed, report.faults.environment.passed], [3, 2])
  assert.equal(checkReport(dir).ok, true)
  assert.ok(Object.keys(report.inputs).includes('samples/SHOW-01/record.json'))
  // One tampered token count in one raw record makes the committed report stale.
  const path = join(dir, 'samples/SHOW-02/record.json')
  const record = JSON.parse(readFileSync(path, 'utf8'))
  record.modelCalls[0].inputTokens += 1
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n')
  const stale = checkReport(dir)
  assert.equal(stale.ok, false)
  assert.deepEqual(stale.problems, ['report.json differs from recomputation', 'report.md differs from recomputation'])
  assert.equal(buildReport(dir).requirements.usage.knownInputTokens, report.requirements.usage.knownInputTokens + 1)
})

test('T4: recomputation is byte-stable and tolerates CRLF checkouts of the report', (t) => {
  const { dir, parent } = syntheticBatch()
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  writeReport(dir)
  const first = readFileSync(join(dir, 'report.json'))
  writeFileSync(join(dir, 'report.md'), readFileSync(join(dir, 'report.md'), 'utf8').replaceAll('\n', '\r\n'))
  assert.equal(checkReport(dir).ok, true)
  writeReport(dir)
  assert.ok(readFileSync(join(dir, 'report.json')).equals(first))
})

test('T1 + T3: a missing record stays in the denominator and makes usage unknown, never 0', (t) => {
  const { dir, parent, repo } = syntheticBatch({ omit: ['CAT-02'] })
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  const r = writeReport(dir).requirements
  assert.deepEqual([r.denominator, r.finalSuccess.count, r.missingRecords], [9, 8, ['CAT-02']])
  assert.equal(r.taskIds['CAT-02'], null)
  assert.deepEqual([r.usage.complete, r.usage.totalTokens], [false, null])
  assert.match(readFileSync(join(dir, 'report.md'), 'utf8'), /实际 token：≥\d+/)
  assert.deepEqual(failed(verifyBatch(dir, { repositoryRoot: repo })), ['CAT-02: raw record present'])
})

test('T3: the dead-route fault keeps its single failed call unknown; its charge is a separate estimate', (t) => {
  const { dir, parent } = syntheticBatch()
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  const report = writeReport(dir)
  const network = report.faults.results.find((result) => result.faultId === 'FAULT-ENV-02')
  assert.deepEqual([network.sample.usage.unknownCalls, network.sample.usage.totalTokens, network.sample.usage.complete], [1, null, false])
  assert.deepEqual([report.faults.usage.complete, report.faults.usage.totalTokens], [false, null])
  assert.equal(network.sample.charged.estimatedCalls, 1)
})

test('T1: verification passes a complete batch and names every broken invariant', (t) => {
  const { dir, parent, repo } = syntheticBatch()
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  writeReport(dir)
  assert.deepEqual(failed(verifyBatch(dir, { repositoryRoot: repo })), [])
  const a = JSON.parse(readFileSync(join(dir, 'samples/SHOW-01/record.json'), 'utf8'))
  const b = JSON.parse(readFileSync(join(dir, 'samples/SHOW-02/record.json'), 'utf8'))
  b.task.id = a.task.id
  b.task.prompt += ' '
  writeFileSync(join(dir, 'samples/SHOW-02/record.json'), JSON.stringify(b))
  mkdirSync(join(dir, 'samples/SHOW-99'))
  writeFileSync(join(dir, 'batch-complete.json'), JSON.stringify({ secretScan: { credentialOccurrences: 1 } }))
  assert.deepEqual(failed(verifyBatch(dir, { repositoryRoot: repo })), [
    'no sample directory outside the plan', 'SHOW-02: task prompt is the frozen prompt byte-for-byte',
    'task IDs unique across samples', 'no credential bytes in outputs', 'report equals recomputation from raw records'])
})

test('T1: a changed frozen set or a moved batch is rejected', (t) => {
  const { dir, parent, repo } = syntheticBatch()
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  writeReport(dir)
  const path = join(repo, 'evals/generation/requirements.json')
  writeFileSync(path, readFileSync(path, 'utf8').replace('Grace Hopper 个人展示', 'Grace Hopper 展示'))
  assert.deepEqual(failed(verifyBatch(dir, { repositoryRoot: repo })), ['frozen set equals repository frozen set'])
  assert.deepEqual(failed(verifyBatch(dir, { repositoryRoot: repo, historical: true })), [])
  const moved = join(repo, 'elsewhere')
  renameSync(join(repo, 'evals/generation/runs'), moved)
  assert.deepEqual(failed(verifyBatch(join(moved, '2026-10-23T00-00-00Z-real-fixture'), { repositoryRoot: repo, historical: true })),
    ['mode matches location'])
})

test('mock statistics are labelled and mock calls inside a REAL batch void the real-evidence flag', (t) => {
  const mock = syntheticBatch({ mode: 'MOCK' })
  t.after(() => rmSync(mock.parent, { recursive: true, force: true }))
  const report = writeReport(mock.dir)
  assert.deepEqual([report.mode, report.realModelEvidence, report.statistics], ['MOCK', false, 'DETERMINISTIC_MOCK_HARNESS_DRY_RUN_NOT_MODEL_QUALITY'])
  assert.deepEqual(failed(verifyBatch(mock.dir, { repositoryRoot: mock.repo })), [])
  const mixed = syntheticBatch({ overrides: { 'SHOW-01': (sample, batchId) => defaultRecord(sample, batchId, 'MOCK') } })
  t.after(() => rmSync(mixed.parent, { recursive: true, force: true }))
  const mixedReport = writeReport(mixed.dir)
  assert.deepEqual([mixedReport.realModelEvidence, mixedReport.callsFromOtherProviders > 0], [false, true])
  assert.deepEqual(failed(verifyBatch(mixed.dir, { repositoryRoot: mixed.repo })), [
    'SHOW-01: record identity', 'SHOW-01: model calls only from the batch provider'])
})
