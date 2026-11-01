// Same-commit API/client assembly. No deployment, registry upload or secret input.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, open, readFile, writeFile, cp } from 'node:fs/promises'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { root, hash, verify, pnpm, command } from '../../../infra/release/client/package.mjs'
import { environment } from '../../e2e/full/support.mjs'
const [commit, destination] = process.argv.slice(2)
assert.match(commit, /^[a-f0-9]{40}$/)
assert.equal(command('git', ['rev-parse', `${commit}^{commit}`]), commit)
const output = resolve(destination), rel = relative(resolve(root, '.local-data/d27-b'), output)
assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..'))
await mkdir(output)
await mkdir(join(output, 'release'))
const env = environment(); delete env.NODE_OPTIONS; env.PYTHONUTF8 = '1'
const portable = path => relative(root, path).replaceAll('\\', '/')
const report = { task: 'D27-AB', commit, status: 'BUILDING', modelRequests: 0, productionDeployed: false,
  authenticatedPublicAcceptance: 'BLOCKED_NO_CANDIDATE_HOST', queueIncident: 'OPEN_ENOTEMPTY', commands: [] }
const save = () => writeFile(join(output, 'combined.json'), JSON.stringify(report, null, 2) + '\n')
await save()
async function run(name, executable, args) {
  const logPath = join(output, name + '.log'), fd = await open(logPath, 'wx')
  const item = { name, command: [executable, ...args].map(p => p.startsWith(root) ? portable(p) : p),
    startedAt: new Date().toISOString(), exitCode: null, signal: null }
  report.commands.push(item); await save()
  try {
    const child = spawn(executable, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', fd.fd, fd.fd] })
    ;[item.exitCode, item.signal] = await once(child, 'close')
  } finally { await fd.close() }
  item.completedAt = new Date().toISOString(); item.logSha256 = hash(await readFile(logPath)); await save()
  assert.equal(item.exitCode, 0, name + ' failed'); assert.equal(item.signal, null)
}
try {
  const api = join(output, 'release/api'), clientBuild = join(output, 'client-build')
  const apiArgs = ['-B', 'scripts/release/api_release.py', 'build', '--revision', commit,
    '--output', api, '--log', join(output, 'api-maven.log')]
  const results = await Promise.allSettled([
    run('api-build', 'python', apiArgs),
    run('client-build', process.execPath, ['infra/release/client/package.mjs', 'build', commit, clientBuild]),
  ])
  for (const result of results) if (result.status !== 'fulfilled') throw result.reason
  const apiBytes = await readFile(join(api, 'release.json')), apiManifest = JSON.parse(apiBytes)
  const clientBundle = join(clientBuild, 'bundle'), clientManifest = await verify(clientBundle, commit)
  assert.equal(apiManifest.sourceCommit, commit)
  await run('api-verify', 'python', ['-B', 'scripts/release/api_release.py', 'verify', '--package', api, '--manifest-sha256', hash(apiBytes)])
  await cp(clientBundle, join(output, 'release/client'), { recursive: true, errorOnExist: true })
  const shared = []
  for (const item of apiManifest.sourceFiles) {
    const path = item.path.replace(/^repository\//, '')
    let bytes
    try { bytes = await readFile(join(clientBuild, 'runner-check', path)) } catch (error) {
      if (error.code === 'ENOENT') continue; throw error
    }
    assert.equal(hash(bytes), item.sha256, 'Mixed repository bytes: ' + path)
    shared.push({ path, sha256: item.sha256, gitBlob: item.gitBlob })
  }
  for (const path of ['services/api/agent-runner.mjs', 'services/runner/src/verify/workflow.mjs',
    'services/runner/src/screenshot/queue.mjs', 'infra/runner/policy.mjs', 'docs/generated-project-readme.md']) {
    assert.ok(shared.some(item => item.path === path), 'Required shared runtime missing: ' + path)
  }
  // Keep the verified sealed package immutable. Install host dependencies in a runtime copy.
  const runtime = join(output, 'runtime/repository')
  await cp(join(api, 'repository'), runtime, { recursive: true, errorOnExist: true })
  await writeFile(join(output, 'runtime-install.log'), pnpm(['install', '--frozen-lockfile'], { cwd: runtime, env }) + '\n')
  for (const item of apiManifest.sourceFiles) {
    assert.equal(hash(await readFile(join(runtime, item.path.replace(/^repository\//, '')))), item.sha256)
  }
  await run('bridge-runner-only', process.execPath, ['tests/release/browser/bridge.mjs', commit,
    clientBundle, join(clientBuild, 'runner-check'), join(output, 'bridge-runner-only')])
  await run('bridge-api-root', process.execPath, ['tests/release/browser/bridge.mjs', commit,
    clientBundle, runtime, join(output, 'bridge-api-root')])
  // Verification still succeeds after runtime installation; the sealed API was not modified.
  await run('api-reverify', 'python', ['-B', 'scripts/release/api_release.py', 'verify', '--package', api, '--manifest-sha256', hash(apiBytes)])
  report.api = { package: portable(api), manifestSha256: hash(apiBytes), jarSha256: apiManifest.files.find(x => x.path === 'api.jar').sha256, fileCount: apiManifest.files.length }
  report.client = { package: portable(join(output, 'release/client')), manifestSha256: hash(await readFile(join(clientBundle, 'manifest.json'))) }
  report.sharedRuntimeSources = shared
  report.repositoryMapping = { actualLocalRoot: portable(runtime), source: 'sealed API repository copied without modification; dependencies installed only into this runtime copy',
    CODELESS_AGENT_REPOSITORY_ROOT: portable(runtime), exportRepositoryRoot: portable(runtime),
    workerFixedRoot: '/srv/codeless/repository', workerInstallation: 'NOT_DEPLOYED; operator must install this same runtime snapshot at the fixed worker root',
    platformDist: portable(join(output, 'release/client/web')) }
  report.status = 'BUILT_AND_BRIDGES_VERIFIED_HOLD'
} catch (error) { report.status = 'FAILED'; report.error = error.code ?? error.message; process.exitCode = 1 }
await save(); console.log(JSON.stringify(report))
