import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserTarget } from '../artifacts/service.mjs'
import { digest } from '../artifacts/snapshot.mjs'
import { validateActions, limits as browserLimits } from './actions.mjs'

const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url))
function environment() {
  // Neither worker nor browser inherits API/database/model credentials, proxy settings or login profile.
  const env = {}
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE',
    'LOCALAPPDATA', 'XDG_CACHE_HOME', 'PLAYWRIGHT_BROWSERS_PATH']) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  return env
}
async function terminateTree(child, browserPid) {
  if (process.platform === 'win32') {
    return new Promise((done) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true, stdio: 'ignore' })
      killer.once('error', () => { child.kill(); done(false) })
      killer.once('close', (code) => done(code === 0))
    })
  }
  // Playwright creates its own browser process group. Include descendants even during launch.
  const parents = new Map()
  try {
    for (const name of await readdir('/proc')) {
      if (!/^\d+$/.test(name)) continue
      try {
        const stat = await readFile('/proc/' + name + '/stat', 'utf8')
        const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
        parents.set(Number(name), ppid)
      } catch { /* Process already exited. */ }
    }
    const targets = new Set([child.pid])
    if (browserPid) targets.add(browserPid)
    for (let previous = -1; previous !== targets.size;) {
      previous = targets.size
      for (const [pid, ppid] of parents) if (targets.has(ppid)) targets.add(pid)
    }
    let confirmed = true
    // Kill browser groups first, then the worker group. ESRCH means it is already gone.
    for (const pid of [...targets].reverse()) {
      try { process.kill(-pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') confirmed = false }
      try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') confirmed = false }
    }
    return confirmed
  } catch { child.kill('SIGKILL'); return false }
}
async function execute(job, timeoutMs) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [worker], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      windowsHide: true, detached: process.platform !== 'win32', env: environment() })
    let stdout = [], stdoutBytes = 0, stderr = '', phase = 'LAUNCH', browserPid = null, timedOut = false, overflow = false, error = null
    let killed = Promise.resolve(null)
    const stop = () => { killed = terminateTree(child, browserPid) }
    const timer = setTimeout(() => { timedOut = true; stop() }, timeoutMs)
    child.on('message', (message) => {
      if (Number.isSafeInteger(message?.browserPid) && message.browserPid > 1) browserPid = message.browserPid
      if (['LAUNCH', 'PAGE_OPEN', 'CONTENT', 'ACTION', 'OBSERVE', 'SCREENSHOT', 'CLEANUP'].includes(message?.phase)) phase = message.phase
    })
    child.stdout.on('data', (chunk) => {
      if (stdoutBytes + chunk.length > 8 * 1024 * 1024) { overflow = true; stop() }
      else { stdout.push(chunk); stdoutBytes += chunk.length }
    })
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(0, 2048) })
    child.on('error', (value) => { error = value.message })
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify(job))
    child.on('close', async (exitCode, signal) => {
      clearTimeout(timer)
      const terminated = await killed
      let observed = null
      try { observed = JSON.parse(Buffer.concat(stdout).toString('utf8')) } catch {}
      done({ exitCode, signal, timedOut, terminated, overflow, phase, error, stderr, observed })
    })
  })
}

// Configuration is trusted worker configuration; model data is limited to validateActions.
export async function createBrowserVerifier({ evidenceRoot, limits: overrides } = {}) {
  if (!evidenceRoot) throw new Error('evidenceRoot required')
  const limits = browserLimits(overrides)
  const root = resolve(evidenceRoot)
  await mkdir(root, { recursive: true })
  return async function verify(handle, requestedActions = []) {
    const actions = validateActions(requestedActions)
    const target = browserTarget(handle)
    const id = randomUUID()
    const directory = join(root, id)
    await mkdir(directory)
    const startedAt = new Date().toISOString()
    const observed = await execute({ ...target, actions, limits }, limits.runTimeoutMs)
    const result = { id, buildId: handle.buildId, sourceDigest: handle.sourceDigest, artifactDigest: handle.artifactDigest,
      status: 'FAILED', failure: null, startedAt, completedAt: new Date().toISOString(),
      workerExitCode: observed.exitCode, timedOut: observed.timedOut, phase: observed.phase,
      diagnostics: observed.observed?.diagnostics ?? null,
      cleanup: { browserClosed: observed.observed?.browserClosed === true, processTreeTerminated: observed.terminated },
      screenshot: null, reportPath: join(directory, 'result.json') }
    if (observed.timedOut) result.failure = observed.phase + '_TIMEOUT'
    else if (observed.overflow) result.failure = 'EVIDENCE_LIMIT'
    else if (observed.error || !observed.observed || ![0, 1].includes(observed.exitCode)) result.failure = 'WORKER_FAILED'
    else if (!observed.observed.browserClosed) result.failure = 'CLEANUP_FAILED'
    else {
      result.failure = observed.observed.failure
      result.phase = observed.observed.phase
      if (observed.exitCode === 0 && observed.observed.status === 'PASSED' && result.failure === null) result.status = 'PASSED'
      else if (!result.failure) result.failure = 'WORKER_FAILED'
    }
    if (observed.observed?.error || observed.error || observed.stderr) {
      result.error = (observed.observed?.error ?? observed.error ?? observed.stderr).slice(0, 2048)
    }
    if (observed.observed?.screenshot) {
      const png = Buffer.from(observed.observed.screenshot, 'base64')
      if (png.length > 6 * 1024 * 1024 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        result.status = 'FAILED'; result.failure = 'EVIDENCE_INVALID'
      } else {
        const path = join(directory, 'page.png')
        await writeFile(path, png, { flag: 'wx' })
        result.screenshot = { path, digest: digest(png), bytes: png.length, width: 1280, height: 720 }
      }
    }
    if (result.status === 'PASSED' && !result.screenshot) { result.status = 'FAILED'; result.failure = 'EVIDENCE_MISSING' }
    await writeFile(result.reportPath, JSON.stringify(result, null, 2), { flag: 'wx' })
    return result
  }
}
