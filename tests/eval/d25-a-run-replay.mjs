// Execute the existing B consumer against finished original requirement sources, with no model credential.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, openSync, closeSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs'
import { join, resolve, relative, basename } from 'node:path'
import { root, sha256, canonical } from '../../scripts/eval/lib.mjs'
const [batch, outputDirectory = 'evals/results/D25-A/behavior'] = process.argv.slice(2)
const output = resolve(root, outputDirectory)
const privateDir = join(root, '.local-data/d25-a/behavior', basename(outputDirectory))
mkdirSync(output, { recursive: true }); mkdirSync(privateDir, { recursive: true })
const env = { ...process.env }
for (const key of Object.keys(env)) if (/CODELESS_|API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/.test(key)) delete env[key]
const index = Number(env.GIT_CONFIG_COUNT ?? 0)
Object.assign(env, { GIT_CONFIG_COUNT: String(index + 1), ['GIT_CONFIG_KEY_' + index]: 'safe.directory',
  ['GIT_CONFIG_VALUE_' + index]: root.replaceAll('\\', '/').replace(/\/$/, '') })
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, env, encoding: 'utf8' })
if (git.status !== 0) throw Error('Git identity unavailable')
const startedAt = new Date().toISOString(), fd = openSync(join(privateDir, 'command.log'), 'wx')
const command = [process.execPath, 'evals/browser/run.mjs', '--batch', batch]
const child = spawn(command[0], command.slice(1), { cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd] })
closeSync(fd)
const result = await new Promise(done => {
  child.once('error', error => done({ exitCode: null, signal: null, error: error.code }))
  child.once('close', (exitCode, signal) => done({ exitCode, signal, error: null }))
})
const bytes = readFileSync(join(privateDir, 'command.log')), lines = bytes.toString('utf8').split(/\r?\n/)
const first = lines.map(line => { try { return JSON.parse(line) } catch { return null } }).find(value => value?.output)
const runDir = first?.output ? resolve(first.output) : null
const reportBytes = runDir && existsSync(join(runDir, 'report.json')) ? readFileSync(join(runDir, 'report.json')) : null
const report = reportBytes ? JSON.parse(reportBytes) : null
const files = []
if (runDir) {
  const visit = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + entry.name, source = join(directory, entry.name)
      if (entry.isDirectory() && !['work', 'artifacts', 'source'].includes(entry.name)) visit(source, name + '/')
      else if (entry.isFile() && (entry.name === 'page.png' || entry.name === 'trace.zip')) {
        mkdirSync(join(output, name, '..'), { recursive: true }); copyFileSync(source, join(output, name))
        files.push({ path: name, sha256: sha256(readFileSync(source)) })
      }
    }
  }
  visit(runDir)
}
if (reportBytes) writeFileSync(join(output, 'report.json'), reportBytes, { flag: 'wx' })
const summary = { task: 'D25-A', command, head: git.stdout.trim(), startedAt, completedAt: new Date().toISOString(), ...result,
  privateLog: relative(root, join(privateDir, 'command.log')).replaceAll('\\', '/'), logSha256: sha256(bytes),
  reportSha256: reportBytes ? sha256(reportBytes) : null, reportStatus: report?.status ?? null,
  requirements: report?.requirements?.real ?? null, targets: report?.targets ?? null,
  originalBatch: batch, batchId: report?.batchId ?? null, additionalModelRequests: 0,
  modelCredentialPassed: false, files, note: 'Original B command also evaluates edits. Native exit is retained even when generation alone reaches its target.' }
writeFileSync(join(output, 'command.json'), canonical(summary), { flag: 'wx' })
console.log(canonical(summary))
process.exitCode = result.exitCode ?? 1
