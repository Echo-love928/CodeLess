import test from 'node:test'
import assert from 'node:assert/strict'
import { CnyBatchBudget, sampleExposure, cnyToNanos, nanosToCny, TASK_RESERVATION } from '../../scripts/eval/cny-budget.mjs'

const call = (inputTokens = 1000, outputTokens = 1000, status = 'SUCCEEDED') =>
  ({ provider: 'deepseek', model: 'deepseek-flash', status, inputTokens, outputTokens })
const record = calls => ({ mode: 'REAL', harnessError: null, modelCalls: calls, journal: calls.map(() => ({ kind: 'model.request' })) })

test('the entire unchanged 50000-token task is reserved at the highest peak price before launch', () => {
  assert.equal(nanosToCny(TASK_RESERVATION), '0.4')
  const b = new CnyBatchBudget('2'); assert.equal(b.begin('SHOW-01'), true)
  assert.equal(b.snapshot().remainingCny, '1.6'); assert.equal(b.snapshot().active, 'SHOW-01')
  assert.throws(() => b.begin('SHOW-02'), /one sample/i)
})
test('fourteen completed samples can release reservations without changing sample count or runtime limits', () => {
  const b = new CnyBatchBudget('2')
  for (let i = 0; i < 14; i++) { assert.equal(b.begin('case-' + i), true); b.settle('case-' + i, record([call(10000, 2000)])) }
  assert.equal(b.snapshot().entries.length, 14)
  assert.equal(b.snapshot().reservedOrSettledUpperCny, '0.504')
  assert.equal(b.snapshot().actualCny, null)
})
test('five UNKNOWN tasks consume the full allowance; sixth is refused before a process or model can start', () => {
  const b = new CnyBatchBudget('2')
  for (let i = 0; i < 5; i++) { assert.equal(b.begin('unknown-' + i), true); b.settle('unknown-' + i, null) }
  assert.equal(b.begin('blocked-sixth'), false); assert.equal(b.snapshot().reservedOrSettledUpperCny, '2')
  assert.equal(b.snapshot().entries.at(-1).launched, false)
})
test('failed calls still cost money and cached inputs never receive an assumed discount', () => {
  const r = record([{ ...call(10000, 2000, 'FAILED'), cacheHitTokens: 10000 }])
  assert.equal(nanosToCny(sampleExposure(r).upperNanos), '0.036')
  assert.equal(sampleExposure(r).actualCny, null)
})
test('missing counts, records, harness status, journal, mismatched request counts and provider retain a whole task bound', () => {
  for (const r of [null, {}, { ...record([]), modelCalls: undefined }, { ...record([call()]), journal: [] },
    { ...record([call()]), harnessError: { type: 'collection-failed' } }, { ...record([call()]), journal: undefined },
    record([call(1000, null)]), record([{ ...call(), provider: 'deterministic-mock' }]), record([{ ...call(), model: 'another-model' }]),
    record([{ ...call(), status: 'STARTED' }]), record([{ ...call(), inputTokens: -1 }]), record([{ ...call(), totalTokens: 1 }])]) {
    const v = sampleExposure(r); assert.equal(v.upperNanos, TASK_RESERVATION); assert.equal(v.usage, 'UNKNOWN'); assert.equal(v.actualCny, null)
  }
})
test('only recorded zero calls with an empty journal may have a zero financial exposure', () => {
  assert.equal(sampleExposure(record([])).upperNanos, 0n)
  assert.equal(sampleExposure({ ...record([]), journal: [{ kind: 'model.request' }] }).upperNanos, TASK_RESERVATION)
})
test('integer decimal accounting neither rounds a request into the cap nor treats residual funds as enough', () => {
  assert.equal(nanosToCny(cnyToNanos('0.399999999')), '0.399999999')
  assert.equal(new CnyBatchBudget('0.399999999').begin('not-affordable'), false)
  assert.throws(() => new CnyBatchBudget('2.000000001'), /maximum/)
  assert.throws(() => cnyToNanos('NaN')); assert.throws(() => cnyToNanos('-1'))
})
test('a crash keeps the active reservation; re-entry or settling another sample cannot free it', () => {
  const b = new CnyBatchBudget(); b.begin('crashed')
  assert.equal(b.snapshot().reservedOrSettledUpperCny, '0.4')
  assert.equal(b.snapshot().entries[0].status, 'RESERVED_UNKNOWN_OUTCOME')
  assert.throws(() => b.settle('different', record([]))); assert.equal(b.snapshot().remainingCny, '1.6')
})
test('a settled sample can never be retried and an impossible observed runtime total fails closed', () => {
  const b = new CnyBatchBudget(); b.begin('once'); b.settle('once', record([call()]))
  assert.throws(() => b.begin('once'), /Never retry/)
  assert.throws(() => sampleExposure(record([call(40000, 10001)])), /BOUND_BROKEN/)
})
