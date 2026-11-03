// Operator acceptance only. Uses sealed sources and an explicit immutable image;
// never changes the shared policy tag, production limits, assertions or retries.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const [packageArg, manifestSha256, imageId, outputArg] = process.argv.slice(2)
assert.match(manifestSha256 ?? '', /^[a-f0-9]{64}$/)
assert.match(imageId ?? '', /^sha256:[a-f0-9]{64}$/)
const packageRoot = resolve(packageArg), output = resolve(outputArg)
const owned = path => {
  const rel = relative(resolve(root, 'tests/release/api/.private'), path)
  return rel && !isAbsolute(rel) && !rel.startsWith('..')
}
assert.ok(owned(packageRoot) && owned(output), 'Require task-private package and fresh output')
await mkdir(output) // Refuse to overwrite evidence.
const sha = data => createHash('sha256').update(data).digest('hex')
const manifestBytes = await readFile(join(packageRoot, 'release.json'))
assert.equal(sha(manifestBytes), manifestSha256)
const manifest = JSON.parse(manifestBytes)
for (const item of manifest.files ?? []) {
  assert.equal(sha(await readFile(join(packageRoot, item.path))), item.sha256)
}
const repo = join(packageRoot, 'repository')
const load = name => import(pathToFileURL(join(repo, 'services/runner/src', name)).href)
const { createBuildRunner } = await load('build/runner.mjs')
const { readSnapshot } = await load('artifacts/snapshot.mjs')
const { openArtifactService } = await load('artifacts/service.mjs')
const { createBrowserVerifier } = await load('verify/verifier.mjs')
const report = { task: 'D28-A-followup', candidate: manifest.sourceCommit, manifestSha256, imageId,
  startedAt: new Date().toISOString(), status: 'RUNNING', cases: [], modelRequests: 0,
  historicalFailureReproduced: false, historicalRootCauseClosed: false, policyTagChanged: false }
const save = () => writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n')
await save()
try {
  for (const [name, template, target, expectedStatus, expectedFailure] of [
    ['normal', '<h1>D28 unified candidate</h1>', { role: 'heading', name: 'D28 unified candidate' }, 'PASSED', null],
    ['ambiguous', '<h1 data-testid="profile-name">Ada Lovelace</h1><h2 data-testid="profile-name">Note G</h2>',
      { testId: 'profile-name' }, 'FAILED', 'ACTION_FAILED'],
  ]) {
    const directory = join(output, name), source = join(directory, 'source')
    await mkdir(join(source, 'src/pages'), { recursive: true })
    await writeFile(join(source, 'src/pages/HomePage.vue'), `<template><main>${template}</main></template>\n`)
    const sourceDigest = (await readSnapshot(source, { source: true })).manifest.digest
    const build = await (await createBuildRunner({ workRoot: join(directory, 'work'),
      artifactRoot: join(directory, 'artifacts'), imageId }))(source)
    await writeFile(join(directory, 'build.json'), JSON.stringify(build, null, 2) + '\n')
    // Save before assertions so any native failure remains reviewable.
    const item = { name, buildStatus: build.status, buildExitCode: build.exitCode,
      buildFailure: build.failure, buildCleanup: build.cleanup, buildId: build.id }
    report.cases.push(item); await save()
    assert.equal(build.imageId, imageId)
    assert.equal(build.status, 'SUCCEEDED'); assert.equal(build.exitCode, 0)
    assert.deepEqual(build.cleanup, { containerRemoved: true, workspaceRemoved: true, errors: [] })
    const handle = await openArtifactService({ artifactRoot: join(directory, 'artifacts'), build, sourceDigest })
    try {
      const verify = await createBrowserVerifier({ evidenceRoot: join(directory, 'browser') })
      const result = await verify(handle, [{ type: 'expectText', target,
        value: name === 'normal' ? 'D28 unified candidate' : 'Ada Lovelace' }])
      Object.assign(item, { verificationStatus: result.status, verificationFailure: result.failure,
        workerExitCode: result.workerExitCode, browserCleanup: result.cleanup,
        verificationReportSha256: sha(await readFile(result.reportPath)) })
      await save()
      assert.equal(result.status, expectedStatus); assert.equal(result.failure, expectedFailure)
      assert.equal(result.timedOut, false); assert.equal(result.cleanup.browserClosed, true)
      assert.equal(result.workerExitCode, expectedStatus === 'PASSED' ? 0 : 1)
      if (name === 'ambiguous') assert.match(result.error, /strict mode violation/)
    } finally { await handle.close() }
  }
  report.status = 'PASSED'
} catch (error) {
  report.status = 'FAILED'; report.errorType = error.code ?? error.name
  await writeFile(join(output, 'private-error.log'), error.stack ?? String(error))
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString(); await save()
}
console.log(JSON.stringify(report))
