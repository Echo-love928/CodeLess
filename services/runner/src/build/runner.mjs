import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { StringDecoder } from 'node:string_decoder'
import { containerUser, validateSource } from '../template/build.mjs'
import { IMAGE, policy } from '../../../../infra/runner/policy.mjs'

// Always drain pipes, even after the in-memory log cap is reached.
export function capture(limit) {
  const chunks = []
  let retained = 0
  let observed = 0
  return {
    append(chunk) {
      const bytes = Buffer.from(chunk)
      observed += bytes.length
      const part = bytes.subarray(0, Math.max(0, limit - retained))
      if (part.length) { chunks.push(part); retained += part.length }
    },
    result() {
      // Drop an incomplete trailing UTF-8 sequence rather than expanding it past the cap.
      const decoded = new StringDecoder('utf8').write(Buffer.concat(chunks))
      const text = new StringDecoder('utf8').write(Buffer.from(decoded).subarray(0, limit))
      return { text, bytes: retained, observedBytes: observed, truncated: observed > retained }
    }
  }
}

function docker(args, timeoutMs = 15000, logBytes = 65536) {
  return new Promise((done) => {
    const output = capture(logBytes)
    const stdout = capture(logBytes)
    const stderr = capture(logBytes)
    let error = null
    let timedOut = false
    // No shell, no generated environment variables, no inherited stdio.
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout.append(chunk); output.append(chunk) })
    child.stderr.on('data', (chunk) => { stderr.append(chunk); output.append(chunk) })
    child.on('error', (value) => { error = value.message })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      done({ code, signal, timedOut, error, log: output.result(), stdout: stdout.result().text, stderr: stderr.result().text })
    })
  })
}

function checked(result, operation) {
  if (result.code !== 0 || result.error || result.timedOut) {
    throw new Error(`${operation}: ${result.error ?? result.stderr ?? 'Docker failure'} (exit ${result.code ?? 'unknown'})`)
  }
  return result.stdout.trim()
}

async function snapshot(source, target) {
  const root = await realpath(source)
  await mkdir(target)
  let count = 0
  let total = 0
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      const stat = await lstat(path)
      const name = relative(root, path).split(sep).join('/')
      if (stat.isDirectory()) {
        if (!/^(src|src\/(pages|components|data))$/.test(name)) throw new Error(`unapproved source directory: ${name}`)
        await visit(path)
      }
      else {
        if (!/^src\/(pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/.test(name)) {
          throw new Error(`unapproved source path: ${name}`)
        }
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('unsupported source type')
        if (++count > 40 || stat.size > 128 * 1024) throw new Error('source limit exceeded')
        const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
        let content
        try {
          const opened = await file.stat()
          if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== stat.ino || opened.dev !== stat.dev) {
            throw new Error('source changed during snapshot')
          }
          // A racing source write cannot cause an unbounded host read.
          const bytes = Buffer.alloc(128 * 1024 + 1)
          let length = 0
          while (length < bytes.length) {
            const read = await file.read(bytes, length, bytes.length - length, length)
            if (read.bytesRead === 0) break
            length += read.bytesRead
          }
          total += length
          if (length > 128 * 1024 || total > 512 * 1024) throw new Error('source limit exceeded')
          content = bytes.subarray(0, length)
        } finally { await file.close() }
        const destination = join(target, relative(root, path))
        await mkdir(dirname(destination), { recursive: true })
        await writeFile(destination, content)
      }
    }
  }
  await visit(root)
  await validateSource(target)
}

export async function summarizeArtifacts(root, limits) {
  const files = []
  let total = 0
  let directories = 0
  async function visit(current, depth = 0) {
    if (depth > 16 || ++directories > limits.artifactFiles) throw new Error('artifact directory limit exceeded')
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      const stat = await lstat(path)
      if (stat.isDirectory()) await visit(path, depth + 1)
      else {
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('unsupported artifact type')
        total += stat.size
        if (total > limits.artifactBytes || files.length >= limits.artifactFiles) throw new Error('artifact limit exceeded')
        const content = await readFile(path)
        if (content.length !== stat.size) throw new Error('artifact changed while hashing')
        files.push({ path: relative(root, path).split(sep).join('/'), bytes: content.length,
          digest: `sha256:${createHash('sha256').update(content).digest('hex')}` })
      }
    }
  }
  await visit(root)
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  if (!files.some((file) => file.path === 'index.html') || !files.some((file) => file.path.endsWith('.js'))) {
    throw new Error('production index.html and JavaScript artifacts required')
  }
  return { digest: `sha256:${createHash('sha256').update(JSON.stringify(files)).digest('hex')}`, bytes: total, files }
}

export function isolationArgs({ name, input, output, user, imageId, limits }) {
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new Error('worker image must be an immutable local sha256 ID')
  if (input.includes(',') || output.includes(',')) throw new Error('mount paths cannot contain commas')
  return ['create', '--name', name, '--pull', 'never', '--network', 'none', '--read-only', '--user', user,
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', String(limits.pids),
    '--memory', `${limits.memoryMiB}m`, '--memory-swap', `${limits.memoryMiB}m`, '--cpus', String(limits.cpus),
    '--ulimit', 'nofile=1024:1024', '--log-driver', 'none',
    '--tmpfs', `/tmp:rw,nosuid,nodev,size=${limits.tmpMiB}m,mode=1777`,
    '--mount', `type=bind,src=${input},dst=/input,readonly`,
    '--mount', `type=bind,src=${output},dst=/output`, imageId]
}

// This factory belongs to the trusted host worker. Request data contains only a source directory.
// Tests use a separately built trusted fault image; production defaults to the D05 image.
export async function createBuildRunner({ workRoot, artifactRoot, imageId, limits: overrides } = {}) {
  const limits = policy(overrides)
  const user = containerUser()
  if (!workRoot || !artifactRoot) throw new Error('worker workRoot and artifactRoot are required')
  for (const path of [workRoot, artifactRoot]) await mkdir(resolve(path), { recursive: true })
  const work = await realpath(workRoot)
  const artifacts = await realpath(artifactRoot)
  if (work === artifacts || artifacts.startsWith(work + sep) || work.startsWith(artifacts + sep)) {
    throw new Error('work and artifact roots must be separate')
  }
  const pinned = imageId ?? checked(await docker(['image', 'inspect', IMAGE, '--format', '{{.Id}}']), 'inspect trusted image')
  if (!/^sha256:[a-f0-9]{64}$/.test(pinned)) throw new Error('worker image must be an immutable local sha256 ID')

  return async function runBuild(source) {
    const id = randomUUID()
    const name = `codeless-build-${id}`
    const scratch = await mkdtemp(join(work, 'build-'))
    const input = join(scratch, 'input')
    const output = join(scratch, 'output')
    const result = { id, imageId: pinned, containerName: name, status: 'FAILED', failure: null,
      exitCode: null, oomKilled: null, timedOut: false, log: capture(limits.logBytes).result(),
      artifact: null, cleanup: { containerRemoved: false, workspaceRemoved: false, errors: [] },
      createdAt: new Date().toISOString(), completedAt: null }
    let created = false
    let mayExist = false
    try {
      await snapshot(source, input)
      await mkdir(output)
      await chmod(output, 0o777)
      const args = isolationArgs({ name, input, output, user, imageId: pinned, limits })
      mayExist = true
      checked(await docker(args), 'create build container')
      created = true
      const execution = await docker(['start', '--attach', name], limits.timeoutMs, limits.logBytes)
      result.log = execution.log
      result.timedOut = execution.timedOut
      if (execution.timedOut || execution.error || execution.code === null) {
        checked(await docker(['kill', name]), 'kill build container')
      }
      const state = JSON.parse(checked(await docker(['inspect', name, '--format', '{{json .State}}']), 'inspect build state'))
      if (state.Running || !Number.isInteger(state.ExitCode) || state.ExitCode < 0 || !state.FinishedAt || state.FinishedAt.startsWith('0001-')) {
        throw new Error('container has no confirmed final exit state')
      }
      result.exitCode = state.ExitCode
      result.oomKilled = state.OOMKilled
      result.failure = result.timedOut ? 'TIMEOUT' : state.OOMKilled ? 'OOM' : state.ExitCode !== 0 ? 'BUILD_EXIT' :
        execution.error || execution.code !== 0 ? 'RUNNER_ERROR' : null
    } catch (error) {
      result.failure = created ? 'RUNNER_ERROR' : 'INPUT_OR_RUNNER_ERROR'
      result.diagnostic = error.message.slice(0, 2048)
    } finally {
      if (mayExist) {
        const removal = await docker(['rm', '--force', name])
        const remaining = await docker(['ps', '--all', '--filter', `name=^/${name}$`, '--format', '{{.ID}}'])
        result.cleanup.containerRemoved = remaining.code === 0 && !remaining.error && !remaining.timedOut && remaining.stdout.trim() === ''
        if (!result.cleanup.containerRemoved) result.cleanup.errors.push('container removal could not be confirmed')
        if (created && removal.code !== 0) result.cleanup.errors.push('docker rm failed')
      } else result.cleanup.containerRemoved = true
      try {
        if (!result.failure && result.exitCode === 0 && result.cleanup.containerRemoved && result.cleanup.errors.length === 0) {
          const summary = await summarizeArtifacts(output, limits)
          const destination = join(artifacts, id)
          await rename(output, destination)
          result.artifact = { ...summary, directory: destination }
        }
      } catch (error) {
        result.failure = 'ARTIFACT_INVALID'
        result.diagnostic = error.message.slice(0, 2048)
      }
      try {
        if (dirname(scratch) !== work) throw new Error('workspace cleanup escaped configured root')
        await rm(scratch, { recursive: true, force: true })
        result.cleanup.workspaceRemoved = true
      } catch (error) { result.cleanup.errors.push(error.message.slice(0, 2048)) }
      if (result.cleanup.errors.length || !result.cleanup.containerRemoved || !result.cleanup.workspaceRemoved) {
        result.failure = 'CLEANUP_FAILED'
        if (result.artifact) {
          try { await rm(result.artifact.directory, { recursive: true, force: true }) }
          catch (error) { result.cleanup.errors.push(error.message.slice(0, 2048)) }
          result.artifact = null
        }
      }
      if (!result.failure && result.exitCode === 0 && result.artifact) result.status = 'SUCCEEDED'
      result.completedAt = new Date().toISOString()
    }
    return result
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 5) {
    console.error('Usage: node runner.mjs <source> <worker-scratch-root> <artifact-root>')
    process.exitCode = 2
  } else {
    createBuildRunner({ workRoot: process.argv[3], artifactRoot: process.argv[4] })
      .then((run) => run(process.argv[2]))
      .then((result) => { console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'SUCCEEDED' ? 0 : 1 })
      .catch((error) => { console.error(error.message); process.exitCode = 1 })
  }
}
