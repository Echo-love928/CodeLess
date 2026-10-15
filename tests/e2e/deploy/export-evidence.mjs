import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const source = resolve('.local-data/d15-b'), output = resolve('tests/e2e/deploy/evidence/2026-10-14')
await mkdir(output, { recursive: true })
const runs = []
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^2026-/.test(entry.name)) continue
  const path = join(source, entry.name)
  const value = JSON.parse(await readFile(join(path, 'run.json'), 'utf8'))
  runs.push({ ...value, privateLog: `.local-data/d15-b/${entry.name}/command.log`, directory: entry.name })
}
runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
await writeFile(join(output, 'commands.json'), JSON.stringify(runs, null, 2))
const sourceFiles = ['apps/web/src/features/workbench/WorkbenchPage.vue']
async function list(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name).replaceAll('\\', '/')
    if (entry.isDirectory()) { if (entry.name !== 'evidence') await list(path) }
    else if (/\.(mjs|ts|vue|yml|template)$/.test(path)) sourceFiles.push(path)
  }
}
for (const directory of ['services/runner/src/publish', 'apps/web/src/features/deploy', 'infra/hosting', 'tests/e2e/deploy']) await list(directory)
sourceFiles.push('tests/infra/publish.test.mjs')
await writeFile(join(output, 'source-digests.json'), JSON.stringify(await Promise.all(sourceFiles.sort().map(async path => ({ path,
  digest: 'sha256:' + createHash('sha256').update(await readFile(path)).digest('hex') }))), null, 2))
const latest = mode => runs.filter(run => run.mode === mode && run.status === 'PASSED').at(-1)
for (const mode of ['static', 'unit', 'boundary', 'runner', 'e2e']) {
  const run = latest(mode)
  if (run) await copyFile(join(source, run.directory, 'command.log'), join(output, mode + '.log'))
}
const bounded = latest('e2e-bounded')
if (bounded) await copyFile(join(source, bounded.directory, 'command.log'), join(output, 'e2e-bounded.log'))
const hosting = bounded ?? latest('e2e') ?? latest('hosting')
if (hosting) for (const file of ['acceptance.json', 'public-tasks-refresh.png'])
  await copyFile(join(source, hosting.directory, 'hosting', file), join(output, file))
const screenshotRoot = resolve('apps/web/test-results')
for (const entry of await readdir(screenshotRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('deploy-flow-')) continue
  for (const file of await readdir(join(screenshotRoot, entry.name))) {
    if (file.endsWith('.png') && !file.startsWith('test-failed')) await copyFile(join(screenshotRoot, entry.name, file), join(output, file))
  }
}
const api = runs.filter(run => run.mode === 'api').at(-1)
const repro = latest('api-repro')
if (api) {
  const log = await readFile(join(source, api.directory, 'command.log'), 'utf8')
  const summary = log.split(/\r?\n/).filter(line => /Tests run: 210|BUILD FAILURE|PLATFORM_HTTP_NON_JSON/.test(line)).map(line => line.slice(0, 400))
  await writeFile(join(output, 'api-summary.json'), JSON.stringify({ fullStage: api.status, exitCode: api.exitCode, summary,
    fullLogDigest: api.logDigest, privateLog: api.privateLog, isolatedReproduction: repro ?? null,
    warning: 'A passing isolated reproduction does not change the failed full API stage or prove its intermittent cause.' }, null, 2))
}
const files = (await readdir(output)).filter(name => name !== 'artifact-digests.json')
const manifest = await Promise.all(files.map(async path => {
  const bytes = await readFile(join(output, path))
  return { path, bytes: bytes.length, digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex') }
}))
await writeFile(join(output, 'artifact-digests.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({ output, runs: runs.length, files: manifest.length }))
