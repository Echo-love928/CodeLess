// Explicit execution entry: one POST per frozen edit, no retry on ambiguous submission.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile, writeFile, open } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'

const [batchArg, runtimeArg, bArg, outputArg] = process.argv.slice(2)
assert.ok(batchArg && runtimeArg && bArg && outputArg, 'Usage: execute-retained-edits.mjs <batch> <private-runtime> <B-checkout> <new-output>')
const batchDir = resolve(batchArg), runtime = resolve(runtimeArg), bRoot = resolve(bArg), output = resolve(outputArg)
await mkdir(output, { recursive: false })
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))
const save = (name, value) => writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n')
const moduleAt = path => import(pathToFileURL(join(bRoot, path)).href)
const { loadBatch } = await moduleAt('evals/browser/core.mjs')
const { edits, requestFor } = await moduleAt('evals/edit/cases.mjs')
const { apiReader, collect } = await moduleAt('evals/edit/collect.mjs')
const { preflight } = await moduleAt('evals/edit/handoff.mjs')
const loaded = await loadBatch(batchDir), session = await readJSON(join(runtime, 'session.private.json'))
assert.equal((await readJSON(join(runtime, 'restoration-check.json'))).batchId, loaded.batch.batchId)
const url = new URL(session.api)
assert.ok(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.pathname === '/api/v0/')
const get = apiReader(session.api, session.owner.cookie, fetch, session.audit.cookie)
const tasks = { batchId: loaded.batch.batchId, mode: loaded.batch.mode, tasks: [] }
const invocations = [], skipped = []
let replayCount = 0
async function replay(records) {
  const logPath = join(output, 'replay-' + (++replayCount) + '.log'), log = await open(logPath, 'wx')
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (/CODELESS_|API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/.test(key)) delete env[key]
  const args = ['evals/browser/run.mjs', '--batch', batchDir, ...(records ? ['--edit-records', records] : [])]
  const startedAt = new Date().toISOString()
  const child = spawn(process.execPath, args, { cwd: bRoot, env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
  const [exitCode, signal] = await once(child, 'close'); await log.close()
  const text = await readFile(logPath, 'utf8'), first = JSON.parse(text.split(/\r?\n/)[0])
  const reportPath = join(first.output, 'report.json'), report = await readJSON(reportPath)
  assert.equal(report.batchId, loaded.batch.batchId)
  invocations.push({ startedAt, args, revision: report.revision, changes: report.changes, exitCode, signal,
    log: logPath, report: reportPath, reportDigest: 'sha256:' + createHash('sha256').update(await readFile(reportPath)).digest('hex') })
  await save('invocations.json', invocations)
  return report
}
let report = await replay()
const handoff = await preflight(loaded, report, get)
await save('handoff.json', handoff)
console.log(JSON.stringify({ handoff: handoff.status, eligible: handoff.tasks.filter(t => t.status === 'PREFLIGHT_READY').map(t => t.sampleId) }))
let records = null
for (const id of ['EDIT-01', 'EDIT-02', 'EDIT-03', 'EDIT-05', 'EDIT-04', 'EDIT-06']) {
  const edit = edits.find(e => e.id === id), initial = handoff.tasks.find(t => t.sampleId === id)
  const dependency = ({ 'EDIT-02': 'EDIT-01', 'EDIT-03': 'EDIT-02', 'EDIT-05': 'EDIT-03' })[id]
  if (initial.status !== 'PREFLIGHT_READY' || (dependency && report.edits.find(e => e.sampleId === dependency)?.passed !== true)) {
    skipped.push({ sampleId: id, reason: initial.failure ?? 'DEPENDENCY_NOT_PASSED' }); await save('skipped.json', skipped); continue
  }
  const observed = report.edits.find(e => e.sampleId === id)
  assert.ok(observed.selection && !observed.baselineAlreadyMatches)
  const payload = requestFor(edit, observed.selection, observed.trustedMapping)
  const application = loaded.rows.find(row => row.sampleId === edit.base).record.task.applicationId
  const key = 'D21-' + id + '-' + randomUUID()
  await save(id + '-request.json', { applicationId: application, idempotencyKey: key, payload,
    selection: observed.selection, trustedMapping: observed.trustedMapping })
  let response
  try {
    response = await fetch(new URL('applications/' + application + '/component-edits', url), { method: 'POST', redirect: 'error',
      headers: { Cookie: session.owner.cookie, 'X-CSRF-Token': session.owner.csrf, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) })
  } catch {
    await save(id + '-submission-uncertain.json', { sampleId: id, status: 'UNKNOWN_NO_RETRY', idempotencyKey: key })
    throw new Error(id + ': submission outcome unknown; inspect platform before any further paid request')
  }
  const submitted = await response.json()
  await save(id + '-response.json', { status: response.status, body: submitted })
  assert.equal(response.status, 202, id + ': component edit rejected; no automatic resend')
  const taskId = submitted.task.id
  assert.match(taskId, /^[a-f0-9-]{36}$/)
  console.log(JSON.stringify({ sampleId: id, taskId, status: 'SUBMITTED' }))
  let task
  const deadline = Date.now() + 16 * 60000
  do {
    task = await get('tasks/' + taskId + '/edit')
    if (['READY', 'FAILED'].includes(task.task.status)) break
    assert.ok(Date.now() < deadline, id + ': terminal observation deadline; do not resubmit')
    await new Promise(done => setTimeout(done, 2000))
  } while (true)
  let versionId = null
  if (task.task.status === 'READY') {
    versionId = (await get('applications/' + application)).latestReadyVersionId
    assert.equal((await get('versions/' + versionId)).taskId, taskId)
  }
  tasks.tasks.push({ sampleId: id, taskId, versionId }); await save('task-index.json', tasks)
  records = join(output, 'records-' + tasks.tasks.length)
  await collect(loaded.batch, tasks, records, get)
  report = await replay(records)
  console.log(JSON.stringify({ sampleId: id, platform: task.task.status, accepted: report.edits.find(e => e.sampleId === id)?.passed }))
}
await save('final.json', { batchId: loaded.batch.batchId, mode: loaded.batch.mode, records, skipped,
  requirements: report.requirements, editSummary: report.editSummary, targets: report.targets,
  status: report.targets.generationMet && report.targets.editsMet ? 'D21_TARGETS_MET_PENDING_PEER_REVIEW' : 'D21_TARGETS_NOT_MET' })
console.log(JSON.stringify({ output, records, generation: report.requirements.real, edits: report.editSummary.real, targets: report.targets }))
