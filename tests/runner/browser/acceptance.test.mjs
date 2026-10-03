import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { openArtifactService } from '../../../services/runner/src/artifacts/service.mjs'
import { digest, readSnapshot } from '../../../services/runner/src/artifacts/snapshot.mjs'
import { createBrowserVerifier } from '../../../services/runner/src/verify/verifier.mjs'
import { createBuildVerifier } from '../../../services/runner/src/verify/workflow.mjs'
import { completedFixture } from './fixtures.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
let scratch, artifactRoot, evidenceRoot, admin, adminOrigin, adminHits = 0
before(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'codeless-d08-browser-'))
  artifactRoot = join(scratch, 'artifacts')
  evidenceRoot = process.env.CODELESS_BROWSER_EVIDENCE_DIR ?? join(scratch, 'evidence')
  await mkdir(artifactRoot)
  await mkdir(evidenceRoot, { recursive: true })
  admin = createServer((_request, response) => { adminHits++; response.end('internal admin must remain unreachable') })
  await new Promise((done) => admin.listen(0, '127.0.0.1', done))
  adminOrigin = 'http://127.0.0.1:' + admin.address().port
})
after(async () => {
  await new Promise((done) => admin.close(done))
  assert.equal(adminHits, 0, 'internal admin received forbidden browser traffic')
  assert.equal(dirname(scratch), resolve(tmpdir()))
  await rm(scratch, { recursive: true, force: true })
})
async function record(label, result, extra = {}) {
  const report = { ...result, ...extra }
  console.log(label + ': ' + JSON.stringify(report))
  await writeFile(join(evidenceRoot, label + '.json'), JSON.stringify(report, null, 2))
  return result
}
async function fixtureVerify(options, actions = [], limits = {}) {
  const fixture = await completedFixture(artifactRoot, options)
  const handle = await openArtifactService({ artifactRoot, ...fixture })
  try {
    return await (await createBrowserVerifier({ evidenceRoot, limits }))(handle, actions)
  } finally { await handle.close() }
}
test('D08-B-T1/T4: real Vue files -> offline Docker build -> Chromium, screenshot and matching hashes', { timeout: 100000 }, async () => {
  const image = spawnSync('docker', ['build', '--file', 'infra/build-image/Dockerfile', '--tag', 'codeless-vue-build:d05', '.'],
    { cwd: root, encoding: 'utf8', timeout: 70000 })
  assert.equal(image.status, 0, image.stderr)
  const source = join(root, 'templates/vue/fixtures/showcase')
  const expected = await readSnapshot(source, { source: true, files: 40, bytes: 512 * 1024, fileBytes: 128 * 1024 })
  const run = await createBuildVerifier({ workRoot: join(scratch, 'work'), artifactRoot, evidenceRoot })
  const result = await run(source, [{ type: 'expectText', target: { role: 'heading', name: '林予安，设计与摄影' },
    value: '林予安，设计与摄影' }])
  assert.equal(result.status, 'VERIFIED', JSON.stringify(result))
  assert.equal(result.build.exitCode, 0)
  assert.equal(result.sourceDigest, expected.manifest.digest)
  assert.equal(result.verification.sourceDigest, expected.manifest.digest)
  assert.equal(result.verification.artifactDigest, result.build.artifact.digest)
  assert.equal(result.verification.screenshot.digest, digest(await readFile(result.verification.screenshot.path)))
  assert.equal(result.verification.cleanup.browserClosed, true)
  await record('D08-B-T1-normal', result.verification, { realBuild: result.build, fixture: false })
  await record('D08-B-T4-hashes', result.verification, { expectedSourceDigest: expected.manifest.digest,
    expectedArtifactDigest: result.build.artifact.digest, fixture: false })
})
test('D08-B-T1: blank and uncaught JavaScript exception pages fail with real screenshots', { timeout: 25000 }, async () => {
  const blank = await fixtureVerify({ html: '<!doctype html><div id="app"></div><script src="/page.js"></script>' })
  assert.equal(blank.failure, 'BLANK_PAGE', JSON.stringify(blank))
  assert.ok(blank.screenshot)
  await record('D08-B-T1-blank', blank, { fixture: true })
  const exception = await fixtureVerify({ js: 'throw new Error("d08 uncaught fixture")' })
  assert.equal(exception.failure, 'PAGE_EXCEPTION', JSON.stringify(exception))
  assert.match(exception.diagnostics.pageErrors[0], /d08 uncaught/)
  assert.ok(exception.screenshot)
  await record('D08-B-T1-exception', exception, { fixture: true })
})
test('D08-B-T2: page-open and screenshot timeouts retain distinct failure phases', { timeout: 20000 }, async () => {
  const navigation = await fixtureVerify({ js: 'while (true) {}' }, [], { navigationTimeoutMs: 500, runTimeoutMs: 5000 })
  assert.equal(navigation.status, 'FAILED')
  assert.equal(navigation.failure, 'PAGE_OPEN_TIMEOUT', JSON.stringify(navigation))
  await record('D08-B-T2-open-timeout', navigation, { fixture: true })
  const screenshot = await fixtureVerify({}, [], { screenshotTimeoutMs: 1 })
  assert.equal(screenshot.status, 'FAILED')
  assert.equal(screenshot.failure, 'SCREENSHOT_TIMEOUT', JSON.stringify(screenshot))
  assert.equal(screenshot.screenshot, null)
  await record('D08-B-T2-screenshot-timeout', screenshot, { fixture: true, screenshotBudgetMs: 1 })
})
test('D08-B-T3: internal admin navigation and cloud metadata fetch never reach their targets', { timeout: 25000 }, async () => {
  const navigation = await fixtureVerify({ html: '<!doctype html><div id="app"><a href="' + adminOrigin +
    '/admin">Admin</a></div><script src="/page.js"></script>' }, [{ type: 'click', target: { role: 'link', name: 'Admin' } }])
  assert.equal(navigation.status, 'FAILED')
  assert.ok(navigation.diagnostics.blockedRequests.some((item) => item.url.includes(adminOrigin)), JSON.stringify(navigation))
  assert.equal(adminHits, 0)
  await record('D08-B-T3-admin', navigation, { fixture: true, adminHits })
  const metadata = await fixtureVerify({ js: [
    'fetch("http://169.254.169.254/latest/meta-data/").catch(()=>{});',
    'fetch("http://metadata.google.internal/computeMetadata/v1/").catch(()=>{});',
    'fetch("http://100.100.100.200/latest/meta-data/").catch(()=>{});',
    'new WebSocket("ws://127.0.0.1:1/admin");'
  ].join('\n') })
  assert.equal(metadata.status, 'FAILED')
  assert.equal(metadata.failure, 'NETWORK_BLOCKED', JSON.stringify(metadata))
  assert.ok(metadata.diagnostics.blockedRequests.some((item) => /169\.254\.169\.254/.test(item.url)))
  assert.ok(metadata.diagnostics.blockedRequests.some((item) => /metadata\.google\.internal/.test(item.url)))
  assert.equal(adminHits, 0)
  await record('D08-B-T3-metadata', metadata, { fixture: true, adminHits })
})
test('fresh contexts isolate cookies and LocalStorage; controlled click/fill/reload really execute', { timeout: 25000 }, async () => {
  const options = { html: '<!doctype html><div id="app"><input data-testid="name"><button>Save</button>' +
    '<h1 data-testid="state">Fresh</h1></div><script src="/page.js"></script>',
    js: 'const state=document.querySelector("h1");state.textContent=localStorage.getItem("name")||"Fresh";' +
      'document.querySelector("button").onclick=()=>{localStorage.setItem("name",document.querySelector("input").value);' +
      'document.cookie="fixture=stored";state.textContent=localStorage.getItem("name")}' }
  const fixture = await completedFixture(artifactRoot, options)
  const handle = await openArtifactService({ artifactRoot, ...fixture })
  try {
    const verify = await createBrowserVerifier({ evidenceRoot })
    const first = await verify(handle, [
      { type: 'fill', target: { testId: 'name' }, value: 'Stored' },
      { type: 'click', target: { role: 'button', name: 'Save' } },
      { type: 'reload' }, { type: 'expectText', target: { testId: 'state' }, value: 'Stored' } ])
    assert.equal(first.status, 'PASSED', JSON.stringify(first))
    const second = await verify(handle, [{ type: 'expectText', target: { testId: 'state' }, value: 'Fresh' }])
    assert.equal(second.status, 'PASSED', JSON.stringify(second))
    assert.equal(second.diagnostics.freshContext.cookies, 0)
    assert.notEqual(first.id, second.id)
    const failed = await verify(handle, [{ type: 'expectText', target: { testId: 'state' }, value: 'Model claims success' }])
    assert.equal(failed.status, 'FAILED')
    assert.equal(failed.failure, 'ACTION_FAILED')
    await record('D08-B-actions-and-isolation', second, { fixture: true })
  } finally { await handle.close() }
})
test('whole-run watchdog kills a stalled browser process tree instead of reporting success', { timeout: 12000 }, async () => {
  // The load event completes; a runaway timer stalls the content probe or screenshot afterwards.
  const result = await fixtureVerify({ js: 'window.addEventListener("load",()=>setTimeout(()=>{while(true){}},0))' },
    [], { runTimeoutMs: 3500, navigationTimeoutMs: 500 })
  assert.equal(result.status, 'FAILED', JSON.stringify(result))
  assert.equal(result.timedOut, true, JSON.stringify(result))
  assert.equal(result.cleanup.processTreeTerminated, true, JSON.stringify(result))
  assert.match(result.failure, /_TIMEOUT$/)
  await record('D08-B-watchdog', result, { fixture: true })
})

test('a controlled click that empties the Vue mount is rejected at the final visibility check', { timeout: 12000 }, async () => {
  const result = await fixtureVerify({ html: '<!doctype html><div id="app"><button>Clear</button></div><script src="/page.js"></script>',
    js: 'document.querySelector("button").onclick=()=>{document.getElementById("app").replaceChildren()}' },
    [{ type: 'click', target: { role: 'button', name: 'Clear' } }])
  assert.equal(result.status, 'FAILED')
  assert.equal(result.failure, 'BLANK_PAGE', JSON.stringify(result))
  assert.equal(result.diagnostics.visibleContent, false)
  await record('D08-B-final-content', result, { fixture: true })
})
