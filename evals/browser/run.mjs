// Usage: node evals/browser/run.mjs --fixture | --batch <A batch directory>
import assert from 'node:assert/strict'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import { createBuildRunner } from '../../services/runner/src/build/runner.mjs'
import { cases, behavior, requirementsDigest } from './cases.mjs'
import { edits, editTarget, scopeDiff } from '../edit/cases.mjs'
import { sha, manifest, loadBatch, safeFile, summarize, verdict } from './core.mjs'
import { fixture, changeFixture } from './fixture.mjs'
import { inspect } from './browser.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const fixtureMode = process.argv[2] === '--fixture'
assert.ok(fixtureMode || (process.argv[2] === '--batch' && process.argv[3]), 'Expected --fixture or --batch <directory>')
const output = join(root, '.local-data/d21-b/runs', new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID())
await mkdir(output, { recursive: true })
const report = { schemaVersion: 1, task: 'D21-B', retries: 0, startedAt: new Date().toISOString(),
  mode: fixtureMode ? 'MOCK' : null, statistics: fixtureMode ? 'DETERMINISTIC_FIXTURE_NOT_MODEL_QUALITY' : 'A_BATCH_SOURCE_REPLAY',
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  changes: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  runnerImage: null, additionalModelRequests: 0, additionalRuntimeTokens: 0, status: 'RUNNING', rows: [], edits: [], controls: [] }
const save = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
await save(); console.log(JSON.stringify({ output }))
let browser
try {
  const build = await createBuildRunner({ workRoot: join(output, 'work'), artifactRoot: join(output, 'artifacts') })
  const browserEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:PATH|SYSTEMROOT|WINDIR|USERPROFILE|HOME|TEMP|TMP|LOCALAPPDATA|PLAYWRIGHT_BROWSERS_PATH|LANG)$/i.test(key)))
  browser = await chromium.launch({ headless: true, timeout: 30000, env: browserEnv })
  if (fixtureMode) {
    const source = join(output, 'source'); await fixture(source)
    const before = await manifest(source), built = await build(source)
    report.runnerImage = built.imageId; report.fixtureBuild = built
    assert.equal(built.status, 'SUCCEEDED', JSON.stringify(built))
    for (const c of cases) {
      const browserResult = await inspect(browser, built.artifact, { id: c.id, route: c.route, query: '?case=' + c.id, output: join(output, c.id) })
      report.rows.push({ sampleId: c.id, mode: 'MOCK', sourceDigest: before.digest, browser: browserResult, ...verdict({ platform: 'READY', build: built, browser: browserResult }) })
      await save()
    }
    for (const edit of edits) {
      const candidate = join(output, edit.id, 'source'); await cp(source, candidate, { recursive: true })
      await changeFixture(candidate, edit)
      const after = await manifest(candidate), scope = scopeDiff(before.files, after.files, edit.file), builtAfter = await build(candidate)
      const route = cases.find(c => c.id === edit.base).route
      const baselineBrowser = await inspect(browser, built.artifact, { route, query: '?case=' + edit.base, output: join(output, edit.id, 'before'), action: (page, expect) => editTarget(page, edit, expect, 'before') })
      const browserResult = builtAfter.status === 'SUCCEEDED' ? await inspect(browser, builtAfter.artifact, { route, query: '?case=' + edit.base, output: join(output, edit.id, 'after'), action: async (page, expect) => {
        await editTarget(page, edit, expect)
        if (edit.base === 'TASK-01') await behavior(page, edit.base, expect)
        if (edit.file.endsWith('WorkCard.vue')) for (const title of ['Harvard Mark I 编程','A-0 编译器','COBOL 标准化']) await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      } }) : null
      const outcome = verdict({ platform: 'READY', build: builtAfter, browser: browserResult, scope })
      report.edits.push({ sampleId: edit.id, mode: 'MOCK', request: edit.prompt, beforeDigest: before.digest, afterDigest: after.digest, scope, build: builtAfter, baselineBrowser, browser: browserResult,
        ...outcome, passed: outcome.passed && baselineBrowser.status === 'PASSED' })
      await save()
    }
    for (const [name, query, expected] of [['white-screen', '&blank=1', 'WHITE_SCREEN'], ['lost-persistence', '&noStorage=1', 'BEHAVIOR_ERROR'], ['runtime-error', '&runtimeError=1', 'RUNTIME_ERROR']]) {
      const result = await inspect(browser, built.artifact, { id: 'TASK-01', route: '/tasks', query: '?case=TASK-01' + query, output: join(output, 'controls', name) })
      report.controls.push({ name, expected, browser: result, detected: result.status === 'FAILED' && result.failure === expected, final: verdict({ platform: 'READY', build: built, browser: result }) })
    }
    const drifted = before.files.map(file => file.path.endsWith('stable.ts') ? { ...file, digest: sha('changed unrelated file') } : file.path.endsWith('HomePage.vue') ? { ...file, digest: sha('target changed') } : file)
    report.controls.push({ name: 'unrelated-file', detected: !scopeDiff(before.files, drifted, 'src/pages/HomePage.vue').passed })
  } else {
    const directory = resolve(process.argv[3]), loaded = await loadBatch(directory)
    assert.equal(loaded.batch.frozen.requirements.sha256, requirementsDigest, 'Behavior suite targets a different frozen requirement set')
    report.batchId = loaded.batch.batchId; report.mode = loaded.batch.mode
    report.batchDigest = sha(await readFile(join(directory, 'batch.json')))
    const catalogs = new Map()
    for (const row of loaded.rows) {
      const record = row.record, version = row.version
      const result = { sampleId: row.sampleId, mode: row.mode, taskId: record?.task.id ?? null, versionId: version?.id ?? null,
        sourceDigest: version?.sourceDigest ?? null, rawDigest: row.rawDigest ?? null, platform: record?.task.status ?? 'UNKNOWN',
        platformFailureCode: record?.task.failureCode ?? null, originalVerification: null, build: null, browser: null }
      try {
        if (!record || record.task.status !== 'READY') { Object.assign(result, verdict({ platform: result.platform })); report.rows.push(result); await save(); continue }
        assert.ok(!record.harnessError && row.invocation.exitCode === 0 && !row.invocation.timedOut, 'A harness failed')
        assert.ok(version && row.source, 'Missing immutable version source')
        assert.equal(version.sourceTaskId, record.task.id); assert.equal(row.source.sourceDigest, version.sourceDigest)
        const original = record.journal.filter(event => event.kind === 'runner.result' && event.payload.build.id === version.buildId).at(-1)?.payload
        assert.ok(original && original.status === 'VERIFIED' && original.verification.status === 'PASSED' && original.build.exitCode === 0)
        assert.equal(original.verification.sourceDigest, version.sourceDigest); assert.equal(original.verification.buildId, version.buildId)
        result.originalVerification = { status: original.verification.status, id: original.verification.id, buildId: version.buildId, artifactDigest: original.verification.artifactDigest }
        const sourceRoot = await safeFile(directory, `samples/${row.sampleId}/${row.source.directory}`)
        const actual = await manifest(sourceRoot)
        assert.equal(actual.digest, version.sourceDigest, 'Source aggregate digest mismatch')
        assert.deepEqual(actual.files, row.source.files.map(f => ({ path: f.path, bytes: f.bytes, digest: f.sha256 })), 'Source file digest mismatch')
        result.build = await build(sourceRoot)
        report.runnerImage = result.build.imageId
        if (result.build.status === 'SUCCEEDED') result.browser = await inspect(browser, result.build.artifact, { id: row.sampleId, route: cases.find(c => c.id === row.sampleId).route, output: join(output, row.sampleId) })
        if (result.build.status === 'SUCCEEDED') catalogs.set(row.sampleId, JSON.parse(await readFile(join(result.build.artifact.directory, 'ai-component-catalog.json'), 'utf8')))
        Object.assign(result, verdict({ platform: result.platform, build: result.build, browser: result.browser }))
      } catch (error) { Object.assign(result, { passed: false, failure: 'EVIDENCE_OR_HARNESS', error: error.message }) }
      report.rows.push(result); await save()
    }
    // A exports generation tasks, not component-edit tasks. Assess eligibility without
    // forging selectors, changing immutable sources, or spending on new model tasks.
    for (const edit of edits) {
      const mapping = catalogs.get(edit.base)?.files.find(file => file.sourceFile === edit.file)
      report.edits.push({ sampleId: edit.id, mode: loaded.batch.mode, baseSampleId: edit.base,
        prompt: edit.prompt, componentId: edit.componentId, targetFile: edit.file, mapping: mapping ?? null,
        passed: null, status: 'NOT_EXECUTED', failure: !mapping || mapping.disabledReason || mapping.componentId !== edit.componentId ? 'COMPONENT_MAPPING_UNAVAILABLE' : 'EDIT_TASK_RECORD_REQUIRED',
        modelRequests: 0 })
    }
  }
  report.requirements = summarize(report.rows)
  report.editSummary = summarize(report.edits, edits.map(edit => edit.id))
  report.targets = { generationAtLeast: 8, generationMet: report.requirements.real.observed === 9 ? report.requirements.real.passed >= 8 : null,
    editsAtLeast: 5, editsMet: report.editSummary.real.observed === 6 && report.editSummary.real.notExecuted === 0 ? report.editSummary.real.passed >= 5 : null }
  report.status = report.rows.every(row => row.passed) && (fixtureMode ? report.edits.every(row => row.passed) && report.controls.every(c => c.detected) : true) ? 'PASSED' : 'FAILED'
} catch (error) {
  report.status = 'FAILED'; report.error = error.stack
  report.requirements ??= summarize(report.rows)
  report.editSummary ??= summarize(report.edits, edits.map(edit => edit.id))
}
finally {
  await browser?.close()
  report.completedAt = new Date().toISOString()
  await save()
  // CI does not retain runner work directories. Keep the failed phase visible
  // without logging immutable source contents or changing any verdict.
  if (report.status === 'FAILED') {
    const phase = value => value ? { status: value.status, failure: value.failure,
      error: value.error?.replaceAll(root, '<repo>'), evidenceError: value.evidenceError?.replaceAll(root, '<repo>') } : null
    console.log(JSON.stringify({ failures: {
      requirements: report.rows.filter(row => !row.passed).map(row => ({ sampleId: row.sampleId, failure: row.failure,
        platformFailureCode: row.platformFailureCode, build: phase(row.build), browser: phase(row.browser) })),
      edits: report.edits.filter(row => row.passed === false).map(row => ({ sampleId: row.sampleId, failure: row.failure,
        build: phase(row.build), baselineBrowser: phase(row.baselineBrowser), browser: phase(row.browser), scope: row.scope })),
      controls: report.controls.filter(control => !control.detected).map(control => ({ name: control.name, browser: phase(control.browser) })),
    } }))
  }
  console.log(JSON.stringify({ output, status: report.status, requirements: report.requirements?.[report.mode?.toLowerCase()], edits: report.editSummary?.[report.mode?.toLowerCase()], error: report.error }))
  process.exitCode = report.status === 'PASSED' ? 0 : 1
}
