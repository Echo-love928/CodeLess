// D21-A evidence recorder: runs one acceptance or gate command, keeps the full log privately and appends
// a public summary (native exit code, signal, log digest, HEAD, scoped dirty state) to
// evals/generation/evidence/commands.jsonl. Failures are recorded the same way as passes.
//   node scripts/eval/record-command.mjs unit|mutation|static|api|runner|e2e|gate
//   node scripts/eval/record-command.mjs report-check|verify <batchDir>
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { appendFileSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { canonical, root, sha256 } from './lib.mjs'
import { gitState, javaHome, sampleEnvironment } from './run-batch.mjs'

const windows = process.platform === 'win32'
const [mode, target] = process.argv.slice(2)
const pnpm = (script) => windows ? [process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'corepack', 'pnpm', script]] : ['corepack', ['pnpm', script]]
const tests = () => readdirSync(join(root, 'tests/eval/generation')).filter((name) => name.endsWith('.test.mjs')).map((name) => 'tests/eval/generation/' + name)
const commands = {
  unit: () => [process.execPath, ['--test', ...tests()]],
  mutation: () => [process.execPath, ['tests/eval/generation/mutation.mjs']],
  'report-check': () => [process.execPath, ['scripts/eval/report.mjs', target, '--check']],
  verify: () => [process.execPath, ['scripts/eval/verify-batch.mjs', target]],
  static: () => pnpm('verify:static'), api: () => pnpm('verify:api'), runner: () => pnpm('verify:runner'),
  e2e: () => pnpm('verify:e2e'), gate: () => pnpm('ci:gate')
}
if (!Object.hasOwn(commands, mode) || (['report-check', 'verify'].includes(mode) && !target)) {
  console.error('usage: node scripts/eval/record-command.mjs unit|mutation|static|api|runner|e2e|gate|report-check <dir>|verify <dir>')
  process.exit(2)
}
// Later cards that reuse this recorder label their own records (for example D24-A).
const task = /^D[0-9]{2}-[AB]$/.test(process.env.CODELESS_EVIDENCE_TASK ?? '') ? process.env.CODELESS_EVIDENCE_TASK : 'D21-A'
const started = new Date()
const output = join(root, '.local-data/d21-a/commands', started.toISOString().replaceAll(':', '-') + '-' + mode)
mkdirSync(output, { recursive: true })
// Gates and tests never see the provider credential; the platform uses the named deterministic mock.
const { env } = sampleEnvironment({ base: process.env, mode: 'MOCK', sample: {}, specPath: '', outputDir: '', java: javaHome() })
delete env.CODELESS_EVAL_SAMPLE_FILE
delete env.CODELESS_EVAL_OUTPUT_DIR
const before = gitState()
const [command, args] = commands[mode]()
const log = join(output, 'command.log')
const fd = openSync(log, 'wx')
const child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd] })
closeSync(fd)
let exitCode = null
let signal = null
let launchError = null
try { [exitCode, signal] = await once(child, 'close') } catch (error) { launchError = error.message }
const after = gitState()
const text = readFileSync(log, 'utf8')
const summary = {
  task, mode, target: target ? relative(root, resolve(target)).split('\\').join('/') : null,
  command: [relative(root, command) || command, ...args].join(' '), startedAt: started.toISOString(), completedAt: new Date().toISOString(),
  exitCode, signal, launchError, status: exitCode === 0 && signal === null ? 'PASSED' : 'FAILED',
  head: before.head, scopedClean: before.scopedClean && after.scopedClean && before.head === after.head,
  tests: /ℹ tests (\d+)/.exec(text)?.[1] ?? null, pass: /ℹ pass (\d+)/.exec(text)?.[1] ?? null, fail: /ℹ fail (\d+)/.exec(text)?.[1] ?? null,
  privateLog: relative(root, log).split('\\').join('/'), logSha256: sha256(readFileSync(log)), logBytes: Buffer.byteLength(text)
}
mkdirSync(join(root, 'evals/generation/evidence'), { recursive: true })
appendFileSync(join(root, 'evals/generation/evidence/commands.jsonl'), JSON.stringify(summary) + '\n')
console.log(canonical(summary).trim())
process.exitCode = summary.status === 'PASSED' ? 0 : exitCode || 1
