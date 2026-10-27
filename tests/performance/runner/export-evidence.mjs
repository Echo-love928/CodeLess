import { readdir, readFile, mkdir, copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { root, sha } from './support.mjs'

const source = join(root, '.local-data/d22-b'), target = join(root, 'tests/performance/runner/evidence')
await mkdir(target, { recursive: true })
const manifest = { reports: [], commands: [], generatedAt: new Date().toISOString(),
  note: 'Raw observations retain original status/canonical flags. Reports do not transfer success to later commits. Full logs stay in the private run directory; hashes below identify their exact bytes.' }
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'commands') continue
  const path = join(source, entry.name, 'report.json')
  let bytes
  try { bytes = await readFile(path) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
  const report = JSON.parse(bytes)
  const file = entry.name + '.json'
  await copyFile(path, join(target, file))
  manifest.reports.push({ file, status: report.status, canonical: report.canonical, revision: report.revision,
    completedAt: report.completedAt, digest: sha(bytes) })
}
for (const entry of await readdir(join(source, 'commands'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const bytes = await readFile(join(source, 'commands', entry.name, 'command.json'))
  const report = JSON.parse(bytes)
  manifest.commands.push({ directory: entry.name, ...report })
}
manifest.reports.sort((a, b) => a.file.localeCompare(b.file))
manifest.commands.sort((a, b) => a.directory.localeCompare(b.directory))
await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ reports: manifest.reports.length, commands: manifest.commands.length, target }))
