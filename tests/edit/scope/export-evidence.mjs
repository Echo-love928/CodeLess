import { readdirSync, readFileSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const root = '.local-data/d13-a/runs'
const out = 'tests/edit/scope/evidence/2026-10-13'
mkdirSync(out, { recursive: true })
const runs = readdirSync(root).sort().map(name => {
  const dir = join(root, name)
  const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))
  if (run.status === 'RUNNING') throw new Error(`Run still in progress: ${name}`)
  const log = readFileSync(join(dir, 'command.log'))
  if (run.logDigest !== 'sha256:' + createHash('sha256').update(log).digest('hex')) throw new Error('Raw log hash mismatch')
  const evidence = join(dir, 'scope')
  if (existsSync(evidence)) for (const file of readdirSync(evidence).filter(f => f.endsWith('.json'))) copyFileSync(join(evidence, file), join(out, file))
  const lines = log.toString('utf8').split(/\r?\n/)
  const excerpts = lines.filter(line => /\[ci-gate\]|Tests run:|Test Files |Tests  |tests [0-9]+|pass [0-9]+|fail [0-9]+|passed \(|BUILD SUCCESS|BUILD FAILURE|Failed to execute goal/.test(line))
  writeFileSync(join(out, name + '.summary.log'), excerpts.join('\n') + '\n')
  return { ...run, rawLog: join(dir, 'command.log'), summary: name + '.summary.log' }
})
writeFileSync(join(out, 'commands.json'), JSON.stringify(runs, null, 2) + '\n')
console.log(JSON.stringify({ runs: runs.length, nativeExits: runs.map(r => ({ mode: r.mode, exit: r.exitCode })), out }))
