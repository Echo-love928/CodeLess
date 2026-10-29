// D21-A batch verifier: denominator and task-ID completeness (T1), raw-input fidelity, append-only shape,
// process-result integrity, mock/real separation, credential scan and report recomputation (T4).
// Exit 0 only if every check passes.
//   node scripts/eval/verify-batch.mjs <batchDir> [--historical]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CATEGORIES, REAL_RUNS, REAL_RESULT_RUNS, isRealRunLocation, loadFrozen, plannedSamples, root, sha256 } from './lib.mjs'
import { checkReport, loadBatch } from './report.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Success claims in the committed report, read independently of the ledger that produced them. */
function claimedSuccess(dir) {
  const path = join(dir, 'report.json')
  const claims = new Map()
  if (!existsSync(path)) return claims
  let report
  try { report = JSON.parse(readFileSync(path, 'utf8')) } catch { return claims }
  for (const s of report.requirements?.samples ?? []) claims.set(s.sampleId, s.finalSuccess === true || s.firstPass === true)
  for (const r of report.faults?.results ?? []) claims.set(r.faultId, r.status === 'PASSED' || r.sample?.finalSuccess === true)
  return claims
}

export function verifyBatch(batchDir, { historical = false, repositoryRoot = root } = {}) {
  const checks = []
  const add = (id, pass, detail = null) => checks.push({ id, pass: Boolean(pass), detail })
  let loaded
  try { loaded = loadBatch(batchDir) } catch (error) {
    add('batch loads with intact frozen copies', false, error.message)
    return { ok: false, checks }
  }
  const { dir, batch, frozen, items, complete } = loaded
  add('batch loads with intact frozen copies', true)
  const current = loadFrozen(repositoryRoot)
  const drift = Object.keys(batch.frozen).filter((key) => batch.frozen[key].sha256 !== current[key].sha256)
  add('frozen set equals repository frozen set', historical || drift.length === 0, drift.length ? 'changed: ' + drift.join(', ') : null)
  const expected = plannedSamples(frozen).map((s) => s.id)
  add('plan is the full frozen set (no subset)', batch.subset === null && batch.samples.map((s) => s.id).join() === expected.join(),
    batch.subset ? 'dry-run subset ' + batch.subset.join(',') : null)
  const requirements = items.filter((i) => i.planned.kind === 'REQUIREMENT')
  add('requirement denominator is 9', requirements.length === 9, requirements.length)
  for (const category of CATEGORIES) {
    add('category ' + category + ' has 3 requirements', requirements.filter((i) => i.planned.category === category).length === 3)
  }
  add('fault denominator is 3 CODE + 2 ENVIRONMENT', items.filter((i) => i.planned.kind === 'CODE_FAULT').length === 3
    && items.filter((i) => i.planned.kind === 'ENV_FAULT').length === 2)
  const present = existsSync(join(dir, 'samples')) ? readdirSync(join(dir, 'samples')).sort() : []
  const extra = present.filter((id) => !expected.includes(id))
  add('no sample directory outside the plan', extra.length === 0, extra.length ? extra.join(', ') : null)
  const underRuns = isRealRunLocation(dir, repositoryRoot)
  add('mode matches location', batch.mode === 'REAL' ? underRuns : !underRuns, batch.mode + (underRuns ? ' under ' : ' outside ') + REAL_RUNS + ' or ' + REAL_RESULT_RUNS)
  const taskIds = []
  const appIds = []
  const logged = existsSync(join(dir, 'batch-events.jsonl'))
    ? readFileSync(join(dir, 'batch-events.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []
  const claims = claimedSuccess(dir)
  for (const item of items) {
    const id = item.planned.id
    const spec = item.spec
    add(id + ': spec is the frozen raw input', spec && spec.batchId === batch.batchId && spec.mode === batch.mode
      && JSON.stringify(spec.requirement) === JSON.stringify(item.planned.requirement)
      && JSON.stringify(spec.fault) === JSON.stringify(item.planned.fault))
    const started = existsSync(join(dir, 'samples', id, 'invocation.json'))
      ? JSON.parse(readFileSync(join(dir, 'samples', id, 'invocation.json'), 'utf8')) : null
    add(id + ': exactly one attempt started and finished', started?.attempt === 1 && item.invocation?.attempt === 1)
    // The process result decides whether anything may count: it must agree with the append-only log
    // written at the same moment, and only a JVM that exited 0 by itself may back a success claim.
    const result = item.invocation
    const event = logged.find((entry) => entry.sampleId === id)
    add(id + ': process result matches the append-only event log', Boolean(result && event) && event.exitCode === result.exitCode
      && event.timedOut === result.timedOut && event.recordPresent === result.recordPresent)
    add(id + ': record presence matches the process result', result?.recordPresent === Boolean(item.record))
    const cleanExit = result?.exitCode === 0 && result.timedOut === false && !result.signal && !result.launchError
    add(id + ': success claimed only after a clean process exit', cleanExit || claims.get(id) !== true,
      cleanExit ? null : 'exitCode=' + (result?.exitCode ?? null) + ' timedOut=' + (result?.timedOut ?? null))
    const record = item.record
    add(id + ': raw record present', Boolean(record), record ? null : 'missing record counts as a failure in the denominator')
    if (!record) continue
    add(id + ': record identity', record.sampleId === id && record.attempt === 1 && record.mode === batch.mode && record.batchId === batch.batchId)
    const task = record.task
    add(id + ': task ID recorded', task && UUID.test(task.id), task?.id ?? record.harnessError?.message ?? null)
    if (!task) continue
    taskIds.push(task.id)
    appIds.push(task.applicationId)
    add(id + ': task prompt is the frozen prompt byte-for-byte', task.prompt === item.planned.requirement.prompt)
    add(id + ': application data mode is frozen', record.application?.dataMode === item.planned.requirement.dataMode
      && record.application?.name === item.planned.requirement.applicationName)
    // REAL: provider and model must both match. MOCK dry runs only need the mock provider label.
    const foreign = (record.modelCalls ?? []).filter((call) => call.provider !== batch.provider.id
      || (batch.mode === 'REAL' && call.model !== batch.provider.model))
    add(id + ': model calls only from the batch provider', foreign.length === 0, foreign.length ? foreign.length + ' foreign calls' : null)
    let sourceOk = true
    for (const source of record.sources ?? []) {
      for (const file of source.files) {
        const path = join(dir, 'samples', id, source.directory, file.path)
        if (!existsSync(path) || sha256(readFileSync(path)) !== file.sha256) sourceOk = false
      }
    }
    for (const shot of record.screenshots ?? []) {
      const path = join(dir, 'samples', id, shot.path)
      if (!existsSync(path) || sha256(readFileSync(path)) !== shot.sha256) sourceOk = false
    }
    add(id + ': exported sources and screenshots match recorded digests', sourceOk)
  }
  add('task IDs unique across samples', new Set(taskIds).size === taskIds.length)
  add('application IDs unique across samples', new Set(appIds).size === appIds.length)
  const events = logged.map((entry) => entry.sampleId)
  add('append-only event log has one entry per sample', events.length === expected.length && new Set(events).size === events.length
    && expected.every((id) => events.includes(id)), events.length + ' entries')
  add('batch completed', Boolean(complete))
  add('no credential bytes in outputs', complete?.secretScan?.credentialOccurrences === 0, complete?.secretScan?.credentialOccurrences ?? null)
  const report = checkReport(dir)
  add('report equals recomputation from raw records', report.ok, report.problems.join('; ') || null)
  return { ok: checks.every((c) => c.pass), checks }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [dir, ...flags] = process.argv.slice(2)
  if (!dir) { console.error('usage: node scripts/eval/verify-batch.mjs <batchDir> [--historical]'); process.exit(2) }
  const result = verifyBatch(dir, { historical: flags.includes('--historical') })
  for (const check of result.checks) console.log((check.pass ? 'PASS ' : 'FAIL ') + check.id + (check.detail === null ? '' : ' — ' + check.detail))
  console.log(JSON.stringify({ ok: result.ok, passed: result.checks.filter((c) => c.pass).length, total: result.checks.length }))
  process.exitCode = result.ok ? 0 : 1
}
