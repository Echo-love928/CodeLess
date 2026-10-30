// Read-only evidence reconciliation. Success means consistency, never quality acceptance.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { edits, scopeDiff } from '../../evals/edit/cases.mjs'
import { loadEditRecords, snapshotSource, verified } from '../../evals/edit/records.mjs'

const directory = resolve(process.argv[2] ?? 'evals/results/D25-A/six-edits-2026-10-30')
const read = path => JSON.parse(readFileSync(join(directory, path)))
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const index = read('records/index.json'), report = read('behavior/report.json'), budget = read('execution/budget.json')
assert.equal(index.mode, 'REAL'); assert.equal(report.mode, 'REAL'); assert.equal(report.batchId, index.batchId)
assert.equal(report.revision, '6e79faf6464f33c260d8c8e47efdce3b0b6dddd2')
assert.equal(new Set(index.records.map(r => r.sampleId)).size, 6)
assert.deepEqual(index.records.map(r => r.sampleId).sort(), edits.map(e => e.id).sort())
const records = await loadEditRecords(join(directory, 'records'), index)
let inputTokens = 0, outputTokens = 0, calls = 0
const versions = new Map(), callIds = new Set(), rows = []
for (const { sampleId } of index.records) {
  const record = records.get(sampleId).record, task = record.edit.task
  assert.equal(record.mode, 'REAL'); assert.equal(record.batchId, index.batchId)
  assert.equal(record.sampleId, sampleId); assert.equal(task.status, 'READY')
  assert.ok(task.repairAttempts <= 3)
  const before = snapshotSource(record.before), after = snapshotSource(record.after)
  verified(record.before); verified(record.after)
  const diff = scopeDiff(before, after, record.edit.source.sourceFile)
  assert.equal(diff.passed, true)
  assert.equal(record.edit.baseVersionId, record.before.version.id)
  assert.equal(task.applicationId, record.before.version.applicationId)
  assert.equal(task.applicationId, record.after.version.applicationId)
  const predecessor = { 'EDIT-02': 'EDIT-01', 'EDIT-03': 'EDIT-02', 'EDIT-05': 'EDIT-03' }[sampleId]
  if (predecessor) assert.equal(record.before.version.id, versions.get(predecessor))
  versions.set(sampleId, record.after.version.id)
  const behavior = report.edits.filter(r => r.sampleId === sampleId)
  assert.equal(behavior.length, 1); assert.equal(behavior[0].mode, 'REAL'); assert.equal(behavior[0].status, 'PASSED')
  assert.ok(record.modelCalls.items.length > 0 && record.modelCalls.items.length <= 12)
  let taskTokens = 0
  for (const call of record.modelCalls.items) {
    assert.equal(callIds.has(call.id), false); callIds.add(call.id)
    assert.equal(call.taskId, task.id); assert.equal(call.applicationId, task.applicationId)
    assert.equal(call.provider, 'deepseek'); assert.equal(call.model, 'deepseek-flash'); assert.equal(call.usage, 'KNOWN')
    for (const field of ['inputTokens', 'outputTokens', 'totalTokens']) assert.ok(Number.isSafeInteger(call[field]) && call[field] >= 0)
    assert.equal(call.totalTokens, call.inputTokens + call.outputTokens)
    const audit = read('model-audits/' + call.id + '.json')
    assert.equal(audit.callId, call.id); assert.equal(audit.taskId, task.id)
    assert.equal(audit.usage.inputTokens, call.inputTokens); assert.equal(audit.usage.outputTokens, call.outputTokens)
    inputTokens += call.inputTokens; outputTokens += call.outputTokens; taskTokens += call.totalTokens; calls++
  }
  assert.ok(taskTokens <= 50000)
  const journal = read('execution/' + sampleId + '-journal.json')
  assert.ok(journal.every(e => e.taskId === task.id))
  assert.ok(journal.filter(e => e.kind === 'tool.request').length <= 20)
  assert.ok(Date.parse(task.updatedAt) - Date.parse(task.createdAt) <= 720000)
  for (const phase of ['before', 'after']) for (const file of record[phase].files)
    assert.equal(sha(readFileSync(join(directory, 'sources', sampleId, phase, file.path))), file.digest)
  rows.push({ sampleId, taskId: task.id, versionId: record.after.version.id, calls: record.modelCalls.items.length, totalTokens: taskTokens })
}
const micro = value => { assert.match(value, /^\d+(?:\.\d{1,6})?$/); const [a, b = ''] = value.split('.'); return BigInt(a) * 1000000n + BigInt(b.padEnd(6, '0')) }
assert.equal(budget.price.inputMissPerMillion, 2); assert.equal(budget.price.outputPerMillion, 8)
assert.equal(budget.authorizedCapCny, '2'); assert.equal(budget.actualCny, null)
const upperMicro = BigInt(inputTokens) * 2n + BigInt(outputTokens) * 8n
assert.equal(micro(budget.reservedOrSettledUpperCny), upperMicro)
assert.equal(micro(budget.remainingCny) + upperMicro, micro(budget.authorizedCapCny))
assert.equal(budget.entries.length, 6)
assert.equal(report.requirements.real.denominator, 9)
assert.equal(report.requirements.real.passed, report.rows.filter(r => r.mode === 'REAL' && r.passed === true).length)
assert.equal(report.editSummary.real.denominator, 6); assert.equal(report.editSummary.real.passed, rows.length)
assert.equal(report.targets.generationMet, false); assert.equal(report.targets.editsMet, true)
console.log(JSON.stringify({ consistency: 'PASSED', quality: 'HOLD', rows, calls, inputTokens, outputTokens,
  totalTokens: inputTokens + outputTokens, upperCny: budget.reservedOrSettledUpperCny, actualCny: null,
  requirements: report.requirements.real, edits: report.editSummary.real, additionalModelRequests: 0 }, null, 2))
