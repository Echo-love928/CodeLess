import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'

const root = '.local-data/d14-b', output = 'tests/e2e/visual-edit/evidence/2026-10-14'
mkdirSync(output, { recursive: true })
const runs = readdirSync(root).filter(name => existsSync(join(root, name, 'run.json'))).map(name => {
  const meta = JSON.parse(readFileSync(join(root, name, 'run.json'), 'utf8'))
  if (meta.status === 'RUNNING') return { ...meta, directory: join(root, name), exportedResult: 'UNKNOWN' }
  const log = readFileSync(join(root, name, 'command.log'))
  if ('sha256:' + createHash('sha256').update(log).digest('hex') !== meta.logDigest) throw new Error('Log digest mismatch')
  const text = log.toString('utf8')
  // Full browser/static logs contain no platform sessions. API/gate raw logs stay private.
  const summary = ['unit', 'static', 'browser'].includes(meta.mode) ? text : text.split(/\r?\n/).filter(line =>
    /\[ci-gate\]|Tests run:|Tests:|Test Files|tests \d|pass \d|fail \d|skipped \d|\d+ passed|\d+ failed|BUILD SUCCESS|BUILD FAILURE|^\$|DirectoryNotEmptyException|AssertionError/.test(line)).join('\n') + '\n'
  writeFileSync(join(output, name + '.log'), summary)
  return { ...meta, directory: join(root, name), publicLog: name + '.log', rawLogIsPrivate: !['unit', 'static', 'browser'].includes(meta.mode) }
})
writeFileSync(join(output, 'commands.json'), JSON.stringify(runs, null, 2) + '\n')
for (const name of readdirSync(join(root, 'browser-artifacts'))) copyFileSync(join(root, 'browser-artifacts', name), join(output, name))
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]) }
const digests = files(output).filter(path => !path.endsWith('artifact-digests.json')).map(path => ({ path: relative(output, path).replaceAll('\\', '/'), bytes: readFileSync(path).length,
  digest: 'sha256:' + createHash('sha256').update(readFileSync(path)).digest('hex') }))
writeFileSync(join(output, 'artifact-digests.json'), JSON.stringify(digests, null, 2) + '\n')
console.log(`Exported ${runs.length} actual command records and ${digests.length} artifacts`)
