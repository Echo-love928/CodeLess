import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createBuildRunner } from '../../../services/runner/src/build/runner.mjs'
import { openArtifactService } from '../../../services/runner/src/artifacts/service.mjs'
import { readSnapshot } from '../../../services/runner/src/artifacts/snapshot.mjs'
import { createBrowserVerifier } from '../../../services/runner/src/verify/verifier.mjs'
import { createScreenshotQueue } from '../../../services/runner/src/screenshot/queue.mjs'
import { policy } from '../../../infra/runner/policy.mjs'
import { workerPolicy, TRIAL_LIMITS } from '../../../infra/runner/profiles.mjs'
import { root, sha, command, docker, machine, codeIdentity, disk, staging, ownedPath, sleep, observeOOM } from './support.mjs'

let work, output, faultImage, startSources, startChanges, revision
const imageTags = ['codeless-d22-vue:' + randomUUID(), 'codeless-d22-fault:' + randomUUID()]
const report = { task: 'D22-B', status: 'RUNNING', startedAt: new Date().toISOString(),
  coldDefinition: 'first fresh container in this run; immutable dependencies already installed; host/VM page cache NOT flushed',
  warmDefinition: 'subsequent fresh containers using the identical pinned image; no shared writable source or Vite cache',
  samples: [], resources: [], queue: null, apiIsolation: 'separate api-isolation.mjs required', paidModelRequests: 0 }
before(async () => {
  output = join(root, '.local-data/d22-b', new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID())
  await mkdir(output, { recursive: true })
  console.log('D22-B evidence: ' + output)
  revision = command('git', ['rev-parse', 'HEAD']); startChanges = command('git', ['status', '--porcelain'])
  startSources = await codeIdentity()
  docker(['build', '-f', 'infra/build-image/Dockerfile', '-t', imageTags[0], '.'])
  docker(['build', '-f', 'tests/runner/build/fixtures/Dockerfile', '-t', imageTags[1], '.'])
  faultImage = docker(['image', 'inspect', imageTags[1], '--format', '{{.Id}}'])
  report.machine = machine(imageTags[0]); report.limits = policy()
  report.imageTags = imageTags
  work = await mkdtemp(join(tmpdir(), 'codeless-d22-'))
  for (const name of ['work', 'artifacts', 'browser', 'queue']) await mkdir(join(work, name))
  report.baseline = { disk: await disk(join(work, 'work')), staging: await staging() }
})
after(async () => {
  try {
    if (work) {
      report.after = { disk: await disk(join(work, 'work')), staging: await staging() }
      assert.deepEqual(report.after.disk, report.baseline.disk)
      await rm(ownedPath(tmpdir(), work), { recursive: true, force: true })
      report.ownedRootRemoved = true
    }
    for (const tag of imageTags) docker(['image', 'rm', tag])
    report.imageAliasesRemoved = true
  } catch (error) {
    report.cleanupError = error.stack
    throw error
  } finally {
    report.completedAt = new Date().toISOString(); report.revision = revision; report.revisionRole = 'checkout-reference'
    report.sources = startSources; report.endSources = await codeIdentity()
    report.canonical = startChanges === '' && command('git', ['status', '--porcelain']) === '' &&
      revision === command('git', ['rev-parse', 'HEAD']) && JSON.stringify(startSources) === JSON.stringify(report.endSources)
    report.status = report.samples.length === 4 && report.resources.length === 3 && report.queue?.passed && report.queue?.closed &&
      report.profileValidationPassed && report.imageAliasesRemoved && !report.cleanupError && report.ownedRootRemoved &&
      report.samples.every(s => s.passed) && report.resources.every(s => s.passed) ? 'PASSED' : 'FAILED'
    if (output) await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  }
})
function clean(result) {
  assert.deepEqual(result.cleanup, { containerRemoved: true, workspaceRemoved: true, errors: [] })
  assert.equal(docker(['ps', '-a', '--filter', `name=^/${result.containerName}$`, '--format', '{{.ID}}']), '')
}
function inspectLimits(id) {
  const info = JSON.parse(docker(['inspect', id]))[0]
  const c = info.HostConfig
  assert.equal(c.Memory, 512 * 1024 * 1024); assert.equal(c.MemorySwap, c.Memory)
  assert.equal(c.NanoCpus, 1e9); assert.equal(c.PidsLimit, 128); assert.equal(c.ReadonlyRootfs, true)
  assert.equal(c.NetworkMode, 'none'); assert.deepEqual(c.CapDrop, ['ALL']); assert.equal(c.LogConfig.Type, 'none')
  assert.ok(c.SecurityOpt.includes('no-new-privileges')); assert.notEqual(info.Config.User, '0:0')
  assert.equal(info.Mounts.filter(m => m.Type === 'bind').length, 2)
  assert.equal(info.Mounts.find(m => m.Destination === '/input').RW, false)
  assert.equal(info.Mounts.some(m => /docker.sock|cache|node_modules/.test(m.Destination)), false)
  return { hostConfig: c, user: info.Config.User, mounts: info.Mounts }
}

test('D22 T1/T3/T4: first/warm A-A-B-A builds, browser/screenshot samples and cleanup', { timeout: 240000 }, async () => {
  const markers = { A: 'D22_TENANT_A_' + randomUUID(), B: 'D22_TENANT_B_' + randomUUID() }
  for (const owner of ['A', 'B']) {
    await mkdir(join(work, owner, 'src/pages'), { recursive: true })
    await writeFile(join(work, owner, 'src/pages/HomePage.vue'), `<template><main><h1>${markers[owner]}</h1></main></template>`)
  }
  const verify = await createBrowserVerifier({ evidenceRoot: join(work, 'browser') })
  let config
  const run = await createBuildRunner({ workRoot: join(work, 'work'), artifactRoot: join(work, 'artifacts'),
    imageId: report.machine.imageId,
    onContainerCreated: id => { config = inspectLimits(id) } })
  for (const [index, owner] of ['A', 'A', 'B', 'A'].entries()) {
    const sample = { index, owner, temperature: index === 0 ? 'first-container' : 'warm-image', passed: false }
    report.samples.push(sample)
    const selectedRun = index === 3 ? await createBuildRunner({ workRoot: join(work, 'work'), artifactRoot: join(work, 'artifacts'),
      imageId: report.machine.imageId, profile: 'trial', onContainerCreated: id => { config = inspectLimits(id) } }) : run
    sample.profile = index === 3 ? 'trial' : 'default'
    const start = performance.now(), build = await selectedRun(join(work, owner))
    sample.buildMs = performance.now() - start; sample.build = build; sample.isolation = config
    assert.equal(build.status, 'SUCCEEDED', JSON.stringify(build)); clean(build)
    assert.equal(build.imageId, report.machine.imageId)
    assert.ok(!(await staging()).includes(build.workspaceName), 'exact job staging directory must be removed')
    const combined = (await Promise.all(build.artifact.files.filter(f => f.path.endsWith('.js')).map(f => readFile(join(build.artifact.directory, f.path), 'utf8')))).join('\n')
    assert.ok(combined.includes(markers[owner])); assert.ok(!combined.includes(markers[owner === 'A' ? 'B' : 'A']))
    if (owner === 'A' && index > 0) assert.equal(build.artifact.digest, report.samples[0].build.artifact.digest)
    if (owner === 'B') assert.notEqual(build.artifact.digest, report.samples[0].build.artifact.digest)
    assert.equal(new Set(report.samples.map(s => s.build.id)).size, report.samples.length)
    sample.sourceDigest = (await readSnapshot(join(work, owner))).manifest.digest
    const handle = await openArtifactService({ artifactRoot: join(work, 'artifacts'), build,
      sourceDigest: sample.sourceDigest })
    try {
      const begin = performance.now()
      const browser = await verify(handle, [{ type: 'expectText', target: { role: 'heading', name: markers[owner] }, value: markers[owner] }])
      sample.browserIncludingScreenshotMs = performance.now() - begin; sample.browser = browser
      assert.equal(browser.status, 'PASSED', JSON.stringify(browser)); assert.equal(browser.cleanup.browserClosed, true)
      assert.equal(browser.sourceDigest, sample.sourceDigest); assert.equal(browser.artifactDigest, build.artifact.digest); assert.equal(browser.buildId, build.id)
      sample.exitedPids = [browser.workerPid, browser.diagnostics.browserPid]
      for (const pid of sample.exitedPids) {
        assert.ok(Number.isSafeInteger(pid) && pid > 1)
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'completed worker/browser PID must be absent')
      }
      assert.ok(browser.diagnostics.timingsMs.SCREENSHOT > 0)
      sample.screenshotMs = browser.diagnostics.timingsMs.SCREENSHOT
      await writeFile(join(output, `sample-${index}.png`), await readFile(browser.screenshot.path))
    } finally { await handle.close() }
    sample.persistedArtifact = await disk(build.artifact.directory)
    await rm(ownedPath(join(work, 'artifacts'), build.artifact.directory), { recursive: true })
    const browserDirectory = join(work, 'browser', sample.browser.id)
    await rm(ownedPath(join(work, 'browser'), browserDirectory), { recursive: true })
    sample.after = { work: await disk(join(work, 'work')), artifacts: await disk(join(work, 'artifacts')),
      evidence: await disk(join(work, 'browser')), newStaging: (await staging()).filter(p => !report.baseline.staging.includes(p)) }
    for (const key of ['work', 'artifacts', 'evidence']) assert.deepEqual(sample.after[key], { bytes: 0, files: 0 })
    sample.passed = true
  }
})

test('D22 calibrated profile only tightens reviewed host limits', () => {
  assert.deepEqual(workerPolicy(), policy())
  assert.equal(workerPolicy('trial').timeoutMs, TRIAL_LIMITS.timeoutMs)
  assert.equal(workerPolicy('trial').logBytes, TRIAL_LIMITS.logBytes)
  for (const [profile, limits] of [['unknown', {}], ['trial', { timeoutMs: 60001 }], ['trial', { logBytes: 16385 }],
    ['trial', { memoryMiB: 513 }], ['trial', { shell: 1 }]]) assert.throws(() => workerPolicy(profile, limits))
  assert.equal(workerPolicy('trial', { timeoutMs: 1000 }).timeoutMs, 1000)
  report.profileValidationPassed = true
})

test('D22 T1/T2: concurrency one retains cgroup/timeout/log limits and reclaims CPU/OOM jobs', { timeout: 90000 }, async () => {
  for (const [mode, limits, failure] of [['timeout', { timeoutMs: 5000 }, 'TIMEOUT'], ['logs', { logBytes: 16384 }, 'BUILD_EXIT'],
    ['memory', { memoryMiB: 96, timeoutMs: 15000 }, 'OOM']]) {
    let observation
    const sample = { mode, limits, passed: false }; report.resources.push(sample)
    const run = await createBuildRunner({ workRoot: join(work, 'work'), artifactRoot: join(work, 'artifacts'), imageId: faultImage, limits,
      onContainerCreated: mode === 'memory' ? id => { observation = observeOOM(id).then(value => ({ value }), error => ({ error: error.message })) } : undefined })
    const start = performance.now()
    const result = await run(join(root, 'tests/runner/build/fixtures', mode)); sample.elapsedMs = performance.now() - start; sample.result = result
    if (observation) { sample.liveOOM = await observation; assert.equal(sample.liveOOM.error, undefined) }
    clean(result); assert.equal(result.status, 'FAILED'); assert.equal(result.failure, failure, JSON.stringify(result)); assert.equal(result.artifact, null)
    assert.ok(!(await staging()).includes(result.workspaceName), 'exact failed job staging must be removed')
    if (mode === 'logs') {
      assert.equal(result.exitCode, 7); assert.equal(result.log.bytes, 16384); assert.equal(result.log.observedBytes, 400000); assert.equal(result.log.truncated, true)
    } else { assert.equal(result.exitCode, 137); assert.equal(result.oomKilled, mode === 'memory') }
    if (mode === 'timeout') assert.match(result.log.text, /loop child started/)
    assert.deepEqual(await readdir(join(work, 'work')), []); sample.passed = true
  }
})

test('D22 T2: screenshot queue bounds admission at 100 and coalesces concurrent workers', { timeout: 30000 }, async () => {
  let release, entered, active = 0, peak = 0
  const blocked = new Promise(done => { release = done }), started = new Promise(done => { entered = done })
  const identity = { applicationId: randomUUID(), versionId: randomUUID(), sourceDigest: sha('source'), artifactDigest: sha('artifact') }
  const queue = await createScreenshotQueue({ queueRoot: join(work, 'queue'), maxAttempts: 1 }, {
    resolveTarget: async () => identity,
    capture: async () => { active++; peak = Math.max(peak, active); entered(); await blocked; active--;
      return { status: 'FAILED', failure: 'CAPTURE_FAILED', cleanupConfirmed: true } }
  })
  try {
    const ids = Array.from({ length: 101 }, () => randomUUID())
    for (const id of ids.slice(0, 100)) await queue.enqueue(id)
    const a = queue.runNext(), b = queue.runNext(); assert.equal(a, b); await started
    const begin = performance.now(); await assert.rejects(queue.enqueue(ids[100]), /QUEUE_FULL/)
    const rejectMs = performance.now() - begin
    assert.equal(queue.get(ids[100]), null); assert.equal(active, 1)
    assert.equal(queue.get(ids[1]).status, 'QUEUED')
    release(); assert.equal((await a).status, 'FAILED'); assert.equal(peak, 1)
    // Terminal eviction frees exactly one slot, preserving other queued work.
    await queue.enqueue(ids[100]); assert.equal(queue.get(ids[0]), null); assert.equal(queue.get(ids[100]).status, 'QUEUED')
    report.queue = { passed: true, admitted: 100, rejected: 'QUEUE_FULL', rejectMs, peakActive: peak, retries: 0,
      boundary: 'production screenshot queue; API generation admission is owned by D22-A' }
  } finally { release(); await queue.close(); if (report.queue) report.queue.closed = true }
})
