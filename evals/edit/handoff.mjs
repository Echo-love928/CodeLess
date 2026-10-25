// Read-only live handoff preflight. A batch archive is not a running platform.
// No task POST, model request, system/TLS change or fixture-to-REAL conversion.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateManifest } from '../../services/runner/src/mapping/manifest.mjs'
import { loadBatch, sha } from '../browser/core.mjs'
import { edits, requestFor } from './cases.mjs'
import { apiReader, readPlatformSnapshot } from './collect.mjs'
import { verified } from './records.mjs'

export async function preflight(loaded, report, get) {
  assert.equal(report.batchId, loaded.batch.batchId); assert.equal(report.mode, loaded.batch.mode)
  assert.equal(report.batchDigest, loaded.batchDigest)
  assert.match(loaded.batchDigest, /^sha256:[a-f0-9]{64}$/)
  assert.deepEqual(report.edits.map(r => r.sampleId), edits.map(e => e.id))
  const roots = new Map(), entries = []
  for (const edit of edits) {
    const base = loaded.rows.find(r => r.sampleId === edit.base), observed = report.edits.find(r => r.sampleId === edit.id)
    const entry = { sampleId: edit.id, baseSampleId: edit.base, prompt: edit.prompt, status: 'BLOCKED',
      passed: null, applicationId: base?.record?.task.applicationId ?? null, baseVersionId: base?.version?.id ?? null,
      dependsOn: ({ 'EDIT-02': 'EDIT-01', 'EDIT-03': 'EDIT-02', 'EDIT-05': 'EDIT-03' })[edit.id] ?? null }
    entries.push(entry)
    if (!base?.version || base.record?.task.status !== 'READY') { entry.failure = base ? 'BASE_GENERATION_FAILED' : 'BASE_RECORD_MISSING'; continue }
    if (!observed?.selection) { entry.failure = observed?.failure ?? 'B_SEMANTIC_PROBE_REQUIRED'; entry.mappingReason = observed?.mappingReason ?? null; continue }
    if (observed.baselineAlreadyMatches) { entry.failure = 'BASELINE_ALREADY_MATCHES'; continue }
    try {
      assert.equal(observed.baselineBrowser?.status, 'PASSED')
      assert.equal(observed.beforeVersionId, base.version.id)
      assert.equal(observed.beforeDigest, base.version.sourceDigest)
      const request = requestFor(edit, observed.selection, observed.trustedMapping)
      let live = roots.get(edit.base)
      if (!live) {
        const app = await get('applications/' + entry.applicationId)
        assert.equal(app.id, entry.applicationId)
        assert.equal(app.latestReadyVersionId, base.version.id, 'STALE_CURRENT_VERSION')
        live = await readPlatformSnapshot(get, base.version.id)
        for (const key of ['id', 'sourceDigest', 'number', 'buildId']) assert.equal(live.version[key], base.version[key], 'BASE_IDENTITY_MISMATCH')
        assert.equal(live.version.applicationId, entry.applicationId); assert.equal(live.version.taskId, base.record.task.id)
        verified(live)
        live.mapping = await get('versions/' + base.version.id + '/component-mapping')
        validateManifest(live.mapping, observed.trustedMapping)
        // Prove that audit permission exists before any paid editing starts.
        const audit = await get('admin/model-calls?taskId=' + base.record.task.id + '&page=0&size=100')
        assert.ok(Array.isArray(audit.items) && audit.items.length > 0 && audit.items.every(c => c.taskId === base.record.task.id))
        assert.ok(audit.items.every(c => c.provider === loaded.batch.provider.id &&
          (loaded.batch.mode !== 'REAL' || c.model === loaded.batch.provider.model)))
        roots.set(edit.base, live)
      }
      validateManifest(live.mapping, observed.trustedMapping)
      assert.equal(live.version.sourceDigest, observed.selection.sourceDigest)
      assert.equal(live.snapshot.files.find(f => f.path === observed.selection.sourceFile)?.digest,
        live.mapping.components.find(c => c.componentId === observed.selection.componentId)?.fileDigest)
      Object.assign(entry, { status: 'PREFLIGHT_READY', failure: null, request,
        executableNow: entry.dependsOn === null, selection: observed.selection, beforeDigest: live.version.sourceDigest })
    } catch (error) {
      // API bodies and environment values are never copied into the handoff.
      entry.failure = 'LIVE_BASE_UNAVAILABLE_OR_MISMATCH'
      entry.reason = error.code ?? (error.name === 'AssertionError' ? error.message.split('\n')[0] : 'API_READ_FAILED')
    }
  }
  return { schemaVersion: 1, kind: 'LIVE_EDIT_HANDOFF_PREFLIGHT', batchId: loaded.batch.batchId, mode: loaded.batch.mode,
    generatedAt: new Date().toISOString(), status: entries.every(e => e.status === 'PREFLIGHT_READY') ? 'PREFLIGHT_READY' : 'BLOCKED',
    realEditsExecuted: 0, additionalModelRequests: 0, tasks: entries,
    notice: 'Not an acceptance result or a database retention guarantee. Execute serially per application; re-probe each new current version and collect terminal records before teardown.' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [batchDir, reportPath, output] = process.argv.slice(2)
  try {
    assert.ok(batchDir && reportPath && output, 'Usage: handoff.mjs <A-batch> <B-report.json> <new-output-directory>')
    const loaded = await loadBatch(resolve(batchDir)), report = JSON.parse(await readFile(reportPath, 'utf8'))
    const result = await preflight(loaded, report, apiReader(process.env.CODELESS_EVAL_API_URL,
      process.env.CODELESS_EVAL_SESSION_COOKIE, fetch, process.env.CODELESS_EVAL_AUDIT_SESSION_COOKIE ?? process.env.CODELESS_EVAL_SESSION_COOKIE))
    result.batchDigest = loaded.batchDigest; result.bReportDigest = sha(await readFile(reportPath))
    await mkdir(resolve(output), { recursive: false })
    await writeFile(join(resolve(output), 'handoff.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ status: result.status, eligible: result.tasks.filter(t => t.status === 'PREFLIGHT_READY').length, denominator: 6, realEditsExecuted: 0 }))
    process.exitCode = result.status === 'PREFLIGHT_READY' ? 0 : 1
  } catch (error) { console.error(JSON.stringify({ status: 'FAILED', reason: error.code ?? 'INVALID_HANDOFF_OR_API_READ' })); process.exitCode = 1 }
}
