// Financial sidecar for the six explicitly authorized original edits. Never changes runtime caps.
import assert from 'node:assert/strict'
import { CANDIDATE } from './budgeted-batch.mjs'
export const EDIT_IDS = Object.freeze(['EDIT-01', 'EDIT-02', 'EDIT-03', 'EDIT-04', 'EDIT-05', 'EDIT-06'])
export const EDIT_CONSUMER = '6e79faf6464f33c260d8c8e47efdce3b0b6dddd2'
export function validateEditPlan(plan) {
  assert.equal(plan.scope, 'A_ORIGINAL_SIX_EDITS_ONLY'); assert.equal(plan.currency, 'CNY'); assert.equal(plan.maximum, '2')
  assert.equal(plan.candidate, CANDIDATE); assert.equal(plan.consumer, EDIT_CONSUMER)
  assert.equal(plan.model, 'deepseek-flash'); assert.deepEqual(plan.samples, EDIT_IDS)
  assert.equal(plan.generationRerunsAuthorized, false); assert.equal(plan.outerRetries, 0)
  assert.equal(plan.oldGenerationBudgetSeparate, true)
}
/** An unreadable journal, nonterminal task or incomplete API page keeps the full reservation. */
export function editExposureRecord(record, journal) {
  if (record?.mode !== 'REAL' || record.collection?.kind !== 'PLATFORM_API' ||
      !['READY', 'FAILED'].includes(record.edit?.task?.status) || !Array.isArray(record.modelCalls?.items) || !Array.isArray(journal)) return null
  if (journal.some((event, index) => event.taskId !== record.edit.task.id || event.sequence !== index + 1)) return null
  if (record.modelCalls.items.some(call => call.taskId !== record.edit.task.id)) return null
  return { mode: 'REAL', harnessError: null, modelCalls: record.modelCalls.items, journal }
}
