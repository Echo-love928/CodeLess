import { readdir, readFile, mkdir, copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { root, sha } from './support.mjs'

const source = join(root, '.local-data/d22-b'), target = join(root, 'tests/performance/runner/evidence')
await mkdir(target, { recursive: true })
let previous = { reports: [], commands: [] }
try { previous = JSON.parse(await readFile(join(target, 'manifest.json'))) }
catch (error) { if (error.code !== 'ENOENT') throw error }
// A fresh checkout has no earlier private runs. Re-export must retain the
// published history, including failures, rather than replacing it with this host's subset.
const reports = new Map(previous.reports.map(report => [report.file, report]))
const commands = new Map(previous.commands.map(command => [command.directory, command]))
async function directories(path) {
  try { return await readdir(path, { withFileTypes: true }) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
}
const manifest = { reports: [], commands: [], generatedAt: new Date().toISOString(),
  note: 'Raw observations retain original status/canonical flags. Reports do not transfer success to later commits. Full logs stay in the private run directory; hashes below identify their exact bytes.' }
for (const entry of await directories(source)) {
  if (!entry.isDirectory() || entry.name === 'commands') continue
  const path = join(source, entry.name, 'report.json')
  let bytes
  try { bytes = await readFile(path) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
  const report = JSON.parse(bytes)
  const file = entry.name + '.json'
  if (reports.has(file) && reports.get(file).digest !== sha(bytes)) throw new Error('immutable report collision: ' + file)
  await copyFile(path, join(target, file))
  reports.set(file, { file, status: report.status, canonical: report.canonical, revision: report.revision,
    completedAt: report.completedAt, digest: sha(bytes) })
}
for (const entry of await directories(join(source, 'commands'))) {
  if (!entry.isDirectory()) continue
  const bytes = await readFile(join(source, 'commands', entry.name, 'command.json'))
  const report = JSON.parse(bytes)
  const prior = commands.get(entry.name)
  if (prior?.completedAt && ['exitCode', 'signal', 'logDigest', 'completedAt'].some(key => prior[key] !== report[key]))
    throw new Error('completed command collision: ' + entry.name)
  commands.set(entry.name, { directory: entry.name, ...report })
}
manifest.reports = [...reports.values()]
manifest.commands = [...commands.values()]
manifest.reports.sort((a, b) => a.file.localeCompare(b.file))
manifest.commands.sort((a, b) => a.directory.localeCompare(b.directory))
await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ reports: manifest.reports.length, commands: manifest.commands.length, target }))
