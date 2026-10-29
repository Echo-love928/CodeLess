import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { syntheticBatch } from './fixtures.mjs'
import { buildReport } from '../../../scripts/eval/report.mjs'
import { compareReports } from '../../../scripts/eval/final-comparison.mjs'

test('D25 missing record remains in denominator; unknown usage and behavior remain unknown', t => {
  const baseline = syntheticBatch(), candidate = syntheticBatch({ omit: ['CAT-02'] })
  t.after(() => { rmSync(baseline.parent, { recursive: true, force: true }); rmSync(candidate.parent, { recursive: true, force: true }) })
  const result = compareReports(buildReport(baseline.dir), buildReport(candidate.dir))
  assert.equal(result.requirements.denominator, 9)
  assert.equal(result.requirements.successCountDelta, -1)
  assert.equal(result.samples.find(row => row.sampleId === 'CAT-02').transition, 'REGRESSED')
  assert.equal(result.usage.candidate.requirements.totalTokens, null)
  assert.equal(result.requirements.behaviorAssertions.requirementLevelFinalSuccess, null)
})

test('D25 comparison rejects mock, changed configuration, model and replaced samples', t => {
  const batch = syntheticBatch()
  t.after(() => rmSync(batch.parent, { recursive: true, force: true }))
  const report = buildReport(batch.dir)
  for (const change of [r => { r.mode = 'MOCK' }, r => { r.realModelEvidence = false },
    r => { r.frozen.runConfig = 'changed' }, r => { r.provider.model = 'other-model' },
    r => { r.requirements.denominator = 8 }, r => { r.requirements.sampleIds[0] = 'replacement' },
    r => { r.faults.results[0].sample.sampleId = 'replacement-fault' }]) {
    const candidate = structuredClone(report); change(candidate)
    assert.throws(() => compareReports(report, candidate))
  }
})
