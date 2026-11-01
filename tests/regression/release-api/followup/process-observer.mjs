import cp from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.env.D26_PROCESS_OBSERVER
const log = value => {
  if (!directory) return
  try { mkdirSync(directory, { recursive: true }); appendFileSync(join(directory, `${process.pid}.jsonl`), JSON.stringify({ at: new Date().toISOString(), observerPid: process.pid, ...value }) + '\n') } catch {}
}
function category(command, args = []) {
  if (typeof command !== 'string') return null
  args = Array.isArray(args) ? args : []
  if (/(?:^|[/\\])docker(?:\.exe)?$/i.test(command) && ['build', 'create', 'image', 'rm'].includes(args[0])) return 'docker'
  if (/(?:^|[/\\])taskkill(?:\.exe)?$/i.test(command) || /^taskkill \/pid \d+ \/T \/F$/i.test(command)) return 'taskkill'
  if (args.some(a => /[/\\]screenshot[/\\]worker\.mjs$/.test(a))) return 'screenshot-worker'
  return null
}
const sync = cp.spawnSync, async = cp.spawn
cp.spawnSync = function (command, args, ...rest) {
  const startedAt = new Date().toISOString()
  const result = sync.call(this, command, args, ...rest)
  try { const kind = category(command, args); if (kind) log({ kind, command, args: Array.isArray(args) ? args : [], startedAt, exitCode: result.status, signal: result.signal, error: result.error?.code ?? null,
    stdout: String(result.stdout ?? '').slice(-2000), stderr: String(result.stderr ?? '').slice(-2000) }) } catch {}
  return result
}
cp.spawn = function (command, args, ...rest) {
  const child = async.call(this, command, args, ...rest), kind = category(command, args)
  if (!kind) return child
  log({ kind, event: 'spawn', command, args, childPid: child.pid })
  let stdout = '', stderr = ''
  child.stdout?.on('data', b => { stdout = (stdout + b).slice(-12000) })
  child.stderr?.on('data', b => { stderr = (stderr + b).slice(-2000) })
  child.on('message', m => { if (kind === 'screenshot-worker') log({ kind, event: 'ipc', childPid: child.pid, phase: m?.phase ?? null, browserPid: m?.browserPid ?? null }) })
  child.once('exit', (code, signal) => log({ kind, event: 'exit', childPid: child.pid, code, signal }))
  child.once('close', (code, signal) => {
    let result
    if (kind === 'screenshot-worker') try { const r = JSON.parse(stdout); result = { status: r.status, failure: r.failure, browserClosed: r.browserClosed } } catch {}
    log({ kind, event: 'close', childPid: child.pid, code, signal, stderr, ...(kind === 'screenshot-worker' ? { result: result ?? null, outputChars: stdout.length } : { stdout: stdout.slice(-2000) }) })
  })
  return child
}
syncBuiltinESMExports()
