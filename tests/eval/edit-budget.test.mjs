import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEditPlan, editExposureRecord, EDIT_IDS, EDIT_CONSUMER } from '../../scripts/eval/edit-budget.mjs'
import { CANDIDATE } from '../../scripts/eval/budgeted-batch.mjs'
import { CnyBatchBudget } from '../../scripts/eval/cny-budget.mjs'
const plan = () => ({ scope: 'A_ORIGINAL_SIX_EDITS_ONLY', currency: 'CNY', maximum: '2', candidate: CANDIDATE,
  consumer: EDIT_CONSUMER, model: 'deepseek-flash', samples: [...EDIT_IDS], generationRerunsAuthorized: false, outerRetries: 0, oldGenerationBudgetSeparate: true })
test('new two yuan authorizes only the six frozen edits and cannot fund generation or retries', () => {
  validateEditPlan(plan())
  for (const change of [{ maximum: '2.01' }, { scope: 'GENERATION' }, { generationRerunsAuthorized: true },
    { candidate: 'other' }, { consumer: 'other' }, { outerRetries: 1 }, { samples: EDIT_IDS.slice(1) }, { oldGenerationBudgetSeparate: false }])
    assert.throws(() => validateEditPlan({ ...plan(), ...change }))
})
test('unknown usage and incomplete/misattributed evidence never release the whole task bound', () => {
  const raw = { mode: 'REAL', collection: { kind: 'PLATFORM_API' }, edit: { task: { id: 'task', status: 'FAILED' } },
    modelCalls: { items: [{ taskId: 'task', provider: 'deepseek', model: 'deepseek-flash', status: 'FAILED', inputTokens: null, outputTokens: null }] } }
  const events = [{ taskId: 'task', sequence: 1, kind: 'model.request' }]
  for (const record of [editExposureRecord(raw, events), editExposureRecord(raw, null),
    editExposureRecord(raw, [{ ...events[0], taskId: 'other' }]), editExposureRecord({ ...raw, mode: 'MOCK' }, events)]) {
    const b = new CnyBatchBudget('2'); b.begin('EDIT-01'); b.settle('EDIT-01', record)
    assert.equal(b.snapshot().reservedOrSettledUpperCny, '0.4'); assert.equal(b.snapshot().actualCny, null)
  }
})
test('known failed calls still cost money; exact terminal evidence permits all six within the independent cap', () => {
  const budget = new CnyBatchBudget('2')
  for (const id of EDIT_IDS) {
    assert.equal(budget.begin(id), true)
    const record = { mode: 'REAL', collection: { kind: 'PLATFORM_API' }, edit: { task: { id, status: 'FAILED' } },
      modelCalls: { items: [{ taskId: id, provider: 'deepseek', model: 'deepseek-flash', status: 'FAILED', inputTokens: 1000, outputTokens: 500 }] } }
    budget.settle(id, editExposureRecord(record, [{ taskId: id, sequence: 1, kind: 'model.request' }]))
  }
  assert.equal(budget.snapshot().reservedOrSettledUpperCny, '0.036'); assert.equal(budget.snapshot().entries.length, 6)
})
