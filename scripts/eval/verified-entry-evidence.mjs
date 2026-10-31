// Offline reconciliation only. Production must read its own immutable ledger and authorize the owner.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { snapshotSource, verified } from '../../evals/edit/records.mjs'

export function verifiedEntryEvidence(record, journal) {
  assert.equal(record.mode, 'REAL', 'REAL_RECORD_REQUIRED')
  assert.equal(record.edit.task.status, 'READY', 'READY_REQUIRED')
  snapshotSource(record.after); verified(record.after)
  const version = record.after.version, report = record.after.snapshot.validation.report
  assert.ok(Array.isArray(journal) && journal.length > 0, 'JOURNAL_REQUIRED')
  assert.ok(journal.every(e => e.taskId === record.edit.task.id), 'TASK_BINDING_REQUIRED')
  const drafts = journal.filter(e => e.kind === 'draft' && e.payload.versionId === version.id)
  assert.equal(drafts.length, 1, 'ONE_BOUND_DRAFT_REQUIRED')
  const draft = drafts[0], results = journal.filter(e => e.kind === 'runner.result' && e.sequence > draft.sequence)
  assert.equal(results.length, 1, 'ONE_BOUND_RESULT_REQUIRED')
  const run = results[0].payload, verification = run.verification
  assert.equal(draft.payload.sourceDigest, version.sourceDigest, 'SOURCE_BINDING_REQUIRED')
  assert.equal(run.sourceDigest, version.sourceDigest, 'SOURCE_BINDING_REQUIRED')
  assert.equal(run.status, 'VERIFIED', 'NATIVE_VERIFIED_REQUIRED')
  assert.equal(run.build.id, version.buildId, 'BUILD_BINDING_REQUIRED')
  assert.equal(run.build.status, 'SUCCEEDED', 'BUILD_SUCCESS_REQUIRED'); assert.equal(run.build.exitCode, 0)
  assert.equal(verification.id, report.verificationId, 'VERIFICATION_BINDING_REQUIRED')
  assert.equal(verification.buildId, version.buildId, 'BUILD_BINDING_REQUIRED')
  assert.equal(verification.sourceDigest, version.sourceDigest, 'SOURCE_BINDING_REQUIRED')
  assert.equal(verification.artifactDigest, report.artifactDigest, 'ARTIFACT_BINDING_REQUIRED')
  assert.equal(verification.status, 'PASSED', 'NATIVE_BROWSER_REQUIRED')
  assert.equal(verification.failure, null); assert.equal(verification.workerExitCode, 0)
  assert.equal(verification.timedOut, false); assert.equal(verification.cleanup.browserClosed, true)
  const actions = draft.payload.actions
  assert.ok(Array.isArray(actions) && actions.length > 0 && actions.length <= 20, 'BOUNDED_ACTIONS_REQUIRED')
  const paths = new Set()
  for (const action of actions.filter(a => a.type === 'navigate')) {
    assert.deepEqual(Object.keys(action).sort(), ['path', 'type'], 'CLOSED_NAVIGATION_REQUIRED')
    assert.ok(['/', '/tasks', '/catalog'].includes(action.path), 'ENTRY_PATH_REJECTED')
    paths.add(action.path)
  }
  assert.equal(paths.size, 1, 'ENTRY_PATH_AMBIGUOUS')
  const outcomes = verification.diagnostics.actions
  assert.ok(Array.isArray(outcomes) && outcomes.length === actions.length, 'COMPLETE_NATIVE_OUTCOMES_REQUIRED')
  for (const [index, action] of actions.entries()) {
    assert.equal(outcomes[index].index, index); assert.equal(outcomes[index].type, action.type)
    assert.equal(outcomes[index].status, 'PASSED', 'ALL_NATIVE_ACTIONS_MUST_PASS')
  }
  return { kind: 'OFFLINE_BOUND_NATIVE_ENTRY_EVIDENCE_NOT_PRODUCTION_COVER', sampleId: record.sampleId,
    taskId: record.edit.task.id, versionId: version.id, sourceDigest: version.sourceDigest,
    artifactDigest: report.artifactDigest, buildId: version.buildId, verificationId: verification.id,
    entryPath: [...paths][0], productionCoverRouteEnabled: false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [recordPath, journalPath] = process.argv.slice(2)
  assert.ok(recordPath && journalPath, 'Usage: verified-entry-evidence.mjs <record> <journal>')
  console.log(JSON.stringify(verifiedEntryEvidence(JSON.parse(readFileSync(recordPath)), JSON.parse(readFileSync(journalPath))), null, 2))
}
