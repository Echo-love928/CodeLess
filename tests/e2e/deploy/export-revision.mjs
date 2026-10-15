import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { digest } from '../../../services/runner/src/artifacts/snapshot.mjs'

// Preserve the previous delivery evidence. This revision has its own complete
// command history, including environment/setup/stale-build failures.
const source = resolve('.local-data/d15-b'), output = resolve('tests/e2e/deploy/evidence/2026-10-15')
await mkdir(output, { recursive: true })
const runs = []
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('2026-10-15T')) continue
  const value = JSON.parse(await readFile(join(source, entry.name, 'run.json'), 'utf8'))
  try { value.termination = JSON.parse(await readFile(join(source, entry.name, 'termination.json'), 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  runs.push({ ...value, directory: entry.name, privateLog: `.local-data/d15-b/${entry.name}/command.log` })
}
runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
await writeFile(join(output, 'commands.json'), JSON.stringify(runs, null, 2))
for (const mode of ['static', 'runner', 'e2e', 'api', 'ab']) {
  const run = runs.filter(item => item.mode === mode).at(-1)
  if (!run) continue
  const log = await readFile(join(source, run.directory, 'command.log'), 'utf8')
  const summary = log.split(/\r?\n/).filter(line => /Tests run:|Tests  |Test Files|ℹ tests|ℹ pass|ℹ fail|ℹ skipped|[0-9]+ passed|[0-9]+ failed|BUILD SUCCESS|BUILD FAILURE|B-frozen|controlled Vue|No such image|Error:|ERROR /.test(line))
  await writeFile(join(output, mode + '-summary.json'), JSON.stringify({ command: run.command, status: run.status ?? 'RUNNING', exitCode: run.exitCode,
    signal: run.signal, logDigest: run.logDigest, privateLog: run.privateLog, termination: run.termination ?? null, summary }, null, 2))
}
let hosting
for (const run of runs.filter(run => ['e2e', 'hosting'].includes(run.mode)).reverse()) {
  try { await readFile(join(source, run.directory, 'hosting/acceptance.json')); hosting = run; break }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
if (hosting) for (const file of ['acceptance.json', 'public-tasks-refresh.png'])
  await copyFile(join(source, hosting.directory, 'hosting', file), join(output, file))
if (hosting) await writeFile(join(output, 'acceptance-origin.json'), JSON.stringify({ commandStatus: hosting.status,
  commandExitCode: hosting.exitCode, privateEvidence: `${hosting.directory}/hosting`,
  note: 'The hosting card assertions passed; an unrelated E2E failure does not become a successful full command.' }, null, 2))
const ab = runs.filter(run => run.mode === 'ab' && run.status === 'PASSED').at(-1)
if (ab) await copyFile(join(source, ab.directory, 'hosting/B-frozen-bridge.json'), join(output, 'B-frozen-bridge.json'))
for (const entry of await readdir(resolve('apps/web/test-results'), { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('deploy-flow-')) continue
  for (const name of await readdir(join('apps/web/test-results', entry.name)))
    if (name.endsWith('.png') && !name.startsWith('test-failed')) await copyFile(join('apps/web/test-results', entry.name, name), join(output, name))
}
const files = []
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name).replaceAll('\\', '/')
    if (entry.isDirectory()) { if (entry.name !== 'evidence') await scan(path) }
    else if (/\.(mjs|ts|vue|java|yml|template|md)$/.test(path)) {
      const bytes = await readFile(path)
      files.push({ path, digest: digest(bytes), lfDigest: digest(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'))) })
    }
  }
}
for (const directory of ['services/runner/src/publish', 'apps/web/src/features/deploy', 'infra/hosting', 'tests/e2e/deploy']) await scan(directory)
await writeFile(join(output, 'source-digests.json'), JSON.stringify(files.sort((a, b) => a.path.localeCompare(b.path)), null, 2))
const artifacts = []
for (const name of await readdir(output)) if (name !== 'artifact-digests.json') {
  const bytes = await readFile(join(output, name))
  artifacts.push({ path: name, bytes: bytes.length, digest: digest(bytes) })
}
await writeFile(join(output, 'artifact-digests.json'), JSON.stringify(artifacts, null, 2))
console.log(JSON.stringify({ output, runs: runs.length, sources: files.length, artifacts: artifacts.length }))
