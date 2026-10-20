import { spawn } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url))
function environment() {
  const env = {}
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE',
    'LOCALAPPDATA', 'XDG_CACHE_HOME', 'PLAYWRIGHT_BROWSERS_PATH']) if (process.env[key] !== undefined) env[key] = process.env[key]
  return env
}
async function terminate(child, browserPid) {
  if (process.platform === 'win32') return new Promise(done => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let diagnostics = ''
    killer.stdout.on('data', bytes => { diagnostics = (diagnostics + bytes).slice(0, 2000) })
    killer.stderr.on('data', bytes => { diagnostics = (diagnostics + bytes).slice(0, 2000) })
    const timer = setTimeout(() => { killer.kill(); child.kill(); done({ confirmed: false, timeout: true }) }, 2000)
    killer.once('error', () => { clearTimeout(timer); child.kill(); done({ confirmed: false, launchError: true }) })
    killer.once('close', code => { clearTimeout(timer); done({ confirmed: code === 0, code, diagnostics }) })
  })
  try {
    const parents = new Map(), targets = new Set([child.pid])
    if (browserPid) targets.add(browserPid)
    for (const name of await readdir('/proc')) {
      if (!/^\d+$/.test(name)) continue
      try { const value = await readFile('/proc/' + name + '/stat', 'utf8'); parents.set(Number(name), Number(value.slice(value.lastIndexOf(')') + 2).split(' ')[1])) } catch {}
    }
    for (let size = -1; size !== targets.size;) {
      size = targets.size
      for (const [pid, ppid] of parents) if (targets.has(ppid)) targets.add(pid)
    }
    let confirmed = true
    for (const pid of [...targets].reverse()) {
      for (const group of [-pid, pid]) try { process.kill(group, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') confirmed = false }
    }
    return confirmed
  } catch { child.kill('SIGKILL'); return false }
}

export function captureDeployment(target, { signal, timeoutMs = 10000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw new Error('capture timeout rejected')
  return new Promise(done => {
    const child = spawn(process.execPath, [worker], { windowsHide: true, detached: process.platform !== 'win32',
      env: environment(), stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })
    let output = '', overflow = false, stopped = false, browserPid, browserStarting = false, launchError = false, cleanup = Promise.resolve(null)
    const stop = () => { if (!stopped) { stopped = true; cleanup = terminate(child, browserPid) } }
    const timer = setTimeout(stop, timeoutMs)
    signal?.addEventListener('abort', stop, { once: true })
    if (signal?.aborted) stop()
    child.on('message', value => {
      if (value?.phase === 'BROWSER_STARTING') browserStarting = true
      if (Number.isSafeInteger(value?.browserPid) && value.browserPid > 1) browserPid = value.browserPid
    })
    child.stdout.on('data', bytes => { if (output.length + bytes.length > 9 * 1024 * 1024) { overflow = true; stop() } else output += bytes })
    child.stderr.resume(); child.stdin.on('error', () => {})
    child.once('error', () => { launchError = true })
    child.stdin.end(JSON.stringify({ ...target, deadline: Date.now() + timeoutMs }))
    child.once('close', async (exitCode, exitSignal) => {
      clearTimeout(timer); signal?.removeEventListener('abort', stop)
      const terminated = await cleanup
      let result
      try { result = JSON.parse(output) } catch {}
      // Windows may report PID-not-found after the worker's own deadline has
      // already exited. Only confirm that race with explicit closed-browser
      // evidence or when the IPC launch barrier was never crossed.
      const alreadyClosed = terminated?.code === 128 && (result?.browserClosed === true || !browserStarting)
      if (stopped || overflow || launchError || exitCode !== 0 || exitSignal !== null || result?.status !== 'SUCCEEDED' || result.browserClosed !== true)
        return done({ status: 'FAILED', failure: stopped ? 'CAPTURE_TIMEOUT' : 'CAPTURE_FAILED', cleanupConfirmed: stopped ? terminated === true || terminated?.confirmed === true || alreadyClosed : result?.browserClosed === true, cleanupProof: terminated })
      const png = Buffer.from(result.screenshot ?? '', 'base64')
      done({ status: 'SUCCEEDED', failure: null, cleanupConfirmed: true, png })
    })
  })
}
