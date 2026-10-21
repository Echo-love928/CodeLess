import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
const root = resolve('.local-data/d19-b'), output = resolve('tests/security/runner/evidence/2026-10-21')
await mkdir(output, { recursive: true })
const commands = []
let latestResults
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^2026-/.test(entry.name)) continue
  const directory = join(root, entry.name)
  let metadata
  try { metadata = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8')) } catch { continue }
  const { sources, ...command } = metadata
  commands.push({ run: entry.name, ...command, sourcesSha256: createHash('sha256').update(JSON.stringify(sources)).digest('hex') })
  await writeFile(join(output, entry.name + '-sources.json'), JSON.stringify(sources, null, 2))
  if (metadata.exitCode === null || metadata.exitCode === undefined) continue
  const log = await readFile(join(directory, 'command.log'), 'utf8')
  const summary = log.split(/\r?\n/).filter(line => /ci-gate|Tests run:|BUILD SUCCESS|BUILD FAILURE|ℹ |Test Files|Tests\s+\d+|passed|failed|cancelled|skipped|✖|^  AssertionError|^  apiRequestContext|^  'test timed|^  locator\.evaluate/.test(line)).join('\n')
  await writeFile(join(output, entry.name + '-summary.txt'), summary + '\n')
  if (['security', 'gate', 'runner'].includes(metadata.mode) && metadata.exitCode === 0 &&
      (!latestResults || metadata.completedAt > latestResults.completedAt)) latestResults = { directory, completedAt: metadata.completedAt }
}
if (latestResults) for (const name of await readdir(join(latestResults.directory, 'results')))
  await copyFile(join(latestResults.directory, 'results', name), join(output, name))
await writeFile(join(output, 'commands.json'), JSON.stringify(commands, null, 2))
console.log(JSON.stringify({ output, runs: commands.length }))
