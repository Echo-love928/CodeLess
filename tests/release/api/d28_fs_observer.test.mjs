import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { observeFileOperations } from './d28_fs_observer.mjs'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

test('observer preserves exact rejection and arguments without retry, even if telemetry fails', async () => {
  const error = Object.assign(new Error('named rejection fixture'), { code: 'EPERM', syscall: 'rename' })
  let calls = 0, received
  const api = Object.fromEntries(['rename', 'rm', 'rmdir', 'mkdir', 'unlink', 'writeFile', 'open'].map(name => [name, async function (...args) { calls++; received = { receiver: this, args }; throw error }]))
  observeFileOperations(api, { roots: [resolve('.')], emit() { throw new Error('observer sink unavailable') } })
  const args = [resolve('old'), resolve('new')]
  await assert.rejects(api.rename(...args), actual => actual === error)
  assert.equal(calls, 1); assert.deepEqual(received.args, args); assert.equal(received.receiver, api)
})

test('real handles and original rename errors retain separate call/rejection stacks without file content', async () => {
  const base = resolve('tests/release/api/.private/observer-controls')
  await fs.mkdir(base, { recursive: true })
  const directory = await fs.mkdtemp(join(base, 'case-'))
  const api = { ...fs }, events = []
  const observer = observeFileOperations(api, { roots: [directory], emit: event => events.push(event) })
  try {
    const handle = await api.open(join(directory, 'first'), 'wx')
    await handle.writeFile('NAMED_PRIVATE_CONTENT_FIXTURE')
    assert.equal(observer.observedHandles().length, 1)
    await assert.rejects(api.rename(join(directory, 'missing'), join(directory, 'second')), { code: 'ENOENT' })
    await handle.close()
    assert.deepEqual(observer.observedHandles(), [])
    await api.rename(join(directory, 'first'), join(directory, 'second'))
    const error = events.find(e => e.phase === 'error')
    assert.equal(error.code, 'ENOENT'); assert.equal(error.observedOpenHandles.length, 1)
    assert.match(error.rejectionStack, /ENOENT/)
    assert.match(events.find(e => e.phase === 'begin' && e.id === error.id).callStack, /Observed call site/)
    assert.equal(events.filter(e => e.phase === 'begin' && e.operation === 'rename').length, 2)
    assert.ok(!JSON.stringify(events).includes('NAMED_PRIVATE_CONTENT_FIXTURE'))
    assert.ok(events.every(e => e.pid === process.pid && /^\d+$/.test(e.monotonicNs)))
  } finally {
    assert.ok(directory.startsWith(base + (process.platform === 'win32' ? '\\' : '/')))
    await fs.rm(directory, { recursive: true })
  }
})

test('actual preload observes named builtin exports and preserves native process failure', async () => {
  const base = resolve('tests/release/api/.private/observer-controls')
  await fs.mkdir(base, { recursive: true })
  const directory = await fs.mkdtemp(join(base, 'preload-'))
  try {
    const output = join(directory, 'logs'); await fs.mkdir(output)
    const config = join(directory, 'config.json')
    await fs.writeFile(config, JSON.stringify({ roots: [directory], output }))
    const code = `import {rename} from 'node:fs/promises'; await rename(${JSON.stringify(join(directory, 'missing'))},${JSON.stringify(join(directory, 'new'))})`
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(resolve(import.meta.dirname, 'd28_fs_observer.mjs')).href, '--input-type=module', '-e', code],
      { env: { ...process.env, CODELESS_D28_FS_OBSERVER: config }, encoding: 'utf8', timeout: 10000, windowsHide: true })
    assert.equal(result.status, 1); assert.equal(result.signal, null); assert.equal(result.error, undefined)
    const names = await fs.readdir(output); assert.equal(names.length, 1)
    const events = (await fs.readFile(join(output, names[0]), 'utf8')).trim().split('\n').map(JSON.parse)
    assert.equal(events.find(e => e.phase === 'error').code, 'ENOENT')
    assert.equal(events.find(e => e.phase === 'observer-exit').exitCode, 1)
    assert.equal(events.find(e => e.phase === 'observer-exit').writeErrors, 0)
    assert.equal(events.filter(e => e.phase === 'begin' && e.operation === 'rename').length, 1)
  } finally {
    assert.ok(directory.startsWith(base + (process.platform === 'win32' ? '\\' : '/')))
    await fs.rm(directory, { recursive: true })
  }
})
