// D25 command recorder. Full logs/JUnit remain private; native results and hashes are public.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { root, canonical, sha256 } from './lib.mjs'
import { javaHome, sampleEnvironment } from './run-batch.mjs'
const [mode, target] = process.argv.slice(2)
const win = process.platform === 'win32'
const env = { ...process.env }
const index = Number(env.GIT_CONFIG_COUNT ?? 0)
env.GIT_CONFIG_COUNT = String(index + 1)
env['GIT_CONFIG_KEY_' + index] = 'safe.directory'
env['GIT_CONFIG_VALUE_' + index] = root.replaceAll('\\', '/').replace(/\/$/, '')
env.JAVA_HOME = javaHome(env)
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
env[pathKey] = join(env.JAVA_HOME, 'bin') + (win ? ';' : ':') + env[pathKey]
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw Error(result.stderr)
  return result.stdout.trim()
}
const pnpm = script => win ? [env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'corepack', 'pnpm', script]] : ['corepack', ['pnpm', script]]
const tests = readdirSync(join(root, 'tests/eval/generation')).filter(name => name.endsWith('.test.mjs')).map(name => 'tests/eval/generation/' + name)
const commands = {
  unit: [process.execPath, ['--test', ...tests]],
  mutation: [process.execPath, ['tests/eval/generation/mutation.mjs']],
  preflight: [process.execPath, ['scripts/eval/network-preflight.mjs', target]],
  real: [process.execPath, ['scripts/eval/run-batch.mjs', '--mode', 'real', '--in-place', '--out', 'evals/results/generation/runs']],
  verify: [process.execPath, ['scripts/eval/verify-batch.mjs', target]],
  'report-check': [process.execPath, ['scripts/eval/report.mjs', target, '--check']],
  gate: [process.execPath, ['--import', new URL('./final-stage-observer.mjs', import.meta.url).href, 'scripts/ci-gate.mjs']],
  static: pnpm('verify:static'), api: pnpm('verify:api'), runner: pnpm('verify:runner'), e2e: pnpm('verify:e2e'),
}
if (!Object.hasOwn(commands, mode) || (['preflight', 'verify', 'report-check'].includes(mode) && !target)) throw Error('mode/target required')
const real = mode === 'real'
const childEnv = real || mode === 'preflight' ? env : sampleEnvironment({ base: env, mode: 'MOCK', sample: {}, specPath: '', outputDir: '', java: env.JAVA_HOME }).env
delete childEnv.CODELESS_EVAL_SAMPLE_FILE
delete childEnv.CODELESS_EVAL_OUTPUT_DIR
if (real) childEnv.CODELESS_EVAL_REAL_APPROVED = '1'
// Existing D24 validated setup: local service calls bypass ambient internet proxy.
childEnv.NO_PROXY = childEnv.no_proxy = '127.0.0.1,localhost,::1'
const startedAt = new Date().toISOString()
const id = startedAt.replaceAll(':', '-') + '-' + mode
const publicDir = join(root, 'evals/results/D25-A/commands', id)
const privateDir = join(root, '.local-data/d25-a/commands', id)
mkdirSync(publicDir, { recursive: true }); mkdirSync(privateDir, { recursive: true })
childEnv.CODELESS_FINAL_STAGE_LOG = join(privateDir, 'stages.jsonl')
const sourcePaths = git('ls-files', '--', 'services/api/src', 'services/api/pom.xml', 'services/runner/src', 'prompts', 'templates', 'scripts/eval', 'package.json', 'pnpm-lock.yaml').split(/\r?\n/).filter(Boolean)
const sourceDigests = Object.fromEntries(sourcePaths.map(path => [path, sha256(readFileSync(join(root, path)))]))
const head = git('rev-parse', 'HEAD')
const screenshots = new Map(mode === 'gate' || mode === 'e2e' || mode === 'runner' ? git('ls-files', '*.png').split(/\r?\n/).filter(Boolean).map(path => [path, readFileSync(join(root, path))]) : [])
const [command, args] = commands[mode]
writeFileSync(join(publicDir, 'started.json'), canonical({ task: 'D25-A', mode, head, startedAt, command: [command, ...args], sourceDigests }), { flag: 'wx' })
console.log(JSON.stringify({ mode, evidence: relative(root, publicDir), privateLog: relative(root, join(privateDir, 'command.log')) }))
const fd = openSync(join(privateDir, 'command.log'), 'wx')
const child = spawn(command, args, { cwd: root, env: childEnv, windowsHide: true, stdio: ['ignore', fd, fd] })
closeSync(fd)
const result = await new Promise(done => {
  child.once('error', error => done({ exitCode: null, signal: null, launchError: error.code }))
  child.once('close', (exitCode, signal) => done({ exitCode, signal, launchError: null }))
})
const bytes = readFileSync(join(privateDir, 'command.log'))
const log = bytes.toString('utf8')
const restoredScreenshots = []
for (const [path, original] of screenshots) if (!existsSync(join(root, path)) || sha256(readFileSync(join(root, path))) !== sha256(original)) {
  writeFileSync(join(root, path), original)
  restoredScreenshots.push({ path, sha256: sha256(original) })
}
const junit = []
const reports = join(root, 'services/api/target/surefire-reports')
if (['gate', 'api'].includes(mode) && existsSync(reports)) for (const name of readdirSync(reports).filter(name => /^TEST-.*\.xml$/.test(name))) {
  const path = join(reports, name)
  if (statSync(path).mtimeMs < Date.parse(startedAt)) continue
  const xml = readFileSync(path, 'utf8'), attributes = xml.match(/<testsuite\b[^>]*>/)?.[0] ?? ''
  const counts = Object.fromEntries(['name', 'tests', 'failures', 'errors', 'skipped'].map(key => [key, attributes.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1] ?? null]))
  junit.push({ ...counts, sha256: sha256(readFileSync(path)), failedCases: [...xml.matchAll(/<testcase\b([^>]+)>\s*<(failure|error)\b/g)].map(match => match[1].match(/\bname="([^"]*)"/)?.[1] ?? null) })
  copyFileSync(path, join(privateDir, name))
}
const credentialOccurrences = process.env.CODELESS_MODEL_API_KEY ? bytes.toString('latin1').split(process.env.CODELESS_MODEL_API_KEY).length - 1 : null
const summary = { task: 'D25-A', mode, command: [command, ...args], head, branch: git('branch', '--show-current'), startedAt, completedAt: new Date().toISOString(), ...result,
  status: result.exitCode === 0 && !result.signal && !result.launchError ? 'PASSED' : 'FAILED',
  modelProvider: real ? 'deepseek' : mode === 'preflight' ? 'NONE' : 'deterministic-mock', paidModelCalls: real ? null : 0,
  modelCredentialPassed: real, credentialOccurrences, logSha256: sha256(bytes), logBytes: bytes.length, privateLog: relative(root, join(privateDir, 'command.log')).replaceAll('\\', '/'),
  sourceDigests, sourceBytesUnchanged: sourcePaths.every(path => sha256(readFileSync(join(root, path))) === sourceDigests[path]), headUnchanged: head === git('rev-parse', 'HEAD'), restoredScreenshots, junit,
  stages: existsSync(childEnv.CODELESS_FINAL_STAGE_LOG) ? readFileSync(childEnv.CODELESS_FINAL_STAGE_LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : null,
  nodeSummaries: log.split(/\r?\n/).filter(line => /^(?:ℹ |# )(?:tests|pass|fail|skipped) \d+/.test(line)),
}
writeFileSync(join(publicDir, 'command.json'), canonical(summary), { flag: 'wx' })
if (credentialOccurrences !== 0 && credentialOccurrences !== null) throw Error('credential present in PRIVATE log; do not publish log')
console.log(JSON.stringify({ evidence: relative(root, publicDir), ...result, status: summary.status, sourceBytesUnchanged: summary.sourceBytesUnchanged, stages: summary.stages }))
process.exitCode = summary.status === 'PASSED' ? 0 : result.exitCode || 1
