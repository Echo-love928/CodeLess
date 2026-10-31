import test from 'node:test'
import assert from 'node:assert/strict'
import { validateExecutionPlan, CANDIDATE, IDS, contained } from '../../scripts/eval/budgeted-batch.mjs'
import { resolve } from 'node:path'
import { mkdtempSync, mkdirSync, symlinkSync, unlinkSync, rmdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const plan = () => ({ candidate: CANDIDATE, samples: [...IDS], model: 'deepseek-flash', mode: 'REAL',
  budget: { currency: 'CNY', maximum: '2', scope: 'A_ONLY_14_SAMPLES', bFuturePaidAuthorized: false },
  handoff: 'ENCRYPTED_TRANSFER_BY_USER_SEPARATE_KEY', outerRetries: 0, retainEverySample: true, approvalServiceRestored: true })
test('the authorized immutable candidate, full fourteen, budget and private handoff are explicit', () => {
  assert.doesNotThrow(() => validateExecutionPlan(plan())); assert.equal(IDS.length, 14)
})
test('a source change, subset, reorder, mock, model switch, higher cap or B payment cannot silently start', () => {
  const mutations = [p => { p.candidate = 'another-head' }, p => { p.samples.pop() }, p => { p.samples.reverse() },
    p => { p.mode = 'MOCK' }, p => { p.model = 'another-model' }, p => { p.budget.maximum = '2.01' },
    p => { p.budget.bFuturePaidAuthorized = true }, p => { p.budget.scope = 'A_AND_B' }, p => { p.outerRetries = 1 },
    p => { p.retainEverySample = false }, p => { p.handoff = 'PUBLIC_UPLOAD' }]
  for (const mutate of mutations) { const p = plan(); mutate(p); assert.throws(() => validateExecutionPlan(p)) }
})
test('a user preference to continue after recovery is not proof the approval service recovered', () => {
  for (const value of [false, null, undefined, 'true']) { const p = plan(); p.approvalServiceRestored = value; assert.throws(() => validateExecutionPlan(p)) }
})
test('controller output and private paths cannot escape the supplied workspace', () => {
  const root = resolve('workspace-fixture')
  assert.equal(contained(root, resolve(root, 'private', 'retained')), resolve(root, 'private', 'retained'))
  assert.throws(() => contained(root, root)); assert.throws(() => contained(root, resolve(root, '..', 'outside')))
})
test('an existing directory junction cannot redirect private exports outside the workspace', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'codeless-budget-paths-'))
  const root = join(temporary, 'workspace'), outside = join(temporary, 'outside'), link = join(root, 'linked')
  mkdirSync(root); mkdirSync(outside)
  try {
    symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(() => contained(root, join(link, 'export.sql')), /Linked/)
    rmdirSync(outside)
    assert.throws(() => contained(root, join(link, 'export.sql')), /Linked/, 'Dangling links are also rejected')
  } finally {
    unlinkSync(link); rmdirSync(root); if (existsSync(outside)) rmdirSync(outside); rmdirSync(temporary)
  }
})
