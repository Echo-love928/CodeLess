import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createAssetReader } from '../../../services/runner/src/screenshot/network.mjs'
import { publicAddress } from '../../../services/runner/src/publish/probe-policy.mjs'
import { digest } from '../../../services/runner/src/artifacts/snapshot.mjs'
import { evidence } from './evidence.mjs'
export const url = 'https://d' + 'a'.repeat(32) + '.sites.codeless-public.test/'
export function target(js = 'document.body.dataset.executed="yes"') {
  const buffers = new Map([['index.html', Buffer.from('<!doctype html><body><h1>D19 screenshot fixture</h1><script src="/assets/app.js"></script></body>')], ['assets/app.js', Buffer.from(js)]])
  return { buffers, job: { url, address: '8.8.8.8', deadline: Date.now() + 10000,
    files: [...buffers].map(([path, bytes]) => ({ path, bytes: bytes.length, digest: digest(bytes) })) } }
}
// Explicit HTTPS transport double. Browser, digest validation, deadlines and routing remain real.
export function transport(buffers, { status = 200, location, body, stall = false, visited = [] } = {}) {
  return (options, callback) => {
    visited.push({ host: options.hostname, path: options.path })
    assert.equal(options.hostname, new URL(url).hostname); assert.equal(options.servername, options.hostname)
    assert.equal(options.agent, false); assert.notEqual(options.rejectUnauthorized, false)
    assert.equal(options.headers.Cookie, undefined); assert.equal(options.headers.Authorization, undefined)
    options.lookup(options.hostname, { all: true }, (error, records) => {
      assert.equal(error, null); assert.deepEqual(records, [{ address: '8.8.8.8', family: 4 }])
    })
    const req = new EventEmitter()
    req.destroy = error => { req.emit('error', error); req.emit('close') }
    req.end = () => { if (stall) return; queueMicrotask(() => {
      const response = new PassThrough(); response.statusCode = status; response.headers = location ? { location } : {}
      callback(response); response.once('end', () => req.emit('close')); response.end(body ?? buffers.get(options.path.slice(1)))
    }) }
    return req
  }
}
test('D19 T1: private, metadata, numeric and IPv6 addresses are refused before transport', async () => {
  const { job } = target(), rejected = ['0.0.0.0', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255',
    '192.168.0.1', '169.254.169.254', '100.100.100.200', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', '2130706433', '0177.0.0.1', '0x7f000001']
  for (const address of rejected) {
    assert.equal(publicAddress(address), false, address)
    assert.throws(() => createAssetReader({ ...job, address }, () => assert.fail('transport must not be reached')), /TARGET_REJECTED/)
  }
  assert.equal(publicAddress('8.8.8.8'), true)
  await evidence('T1-addresses', { rejected, transportCalls: 0 })
})
test('D19 T1: all redirect statuses and locations are rejected without a second request', async () => {
  const { buffers, job } = target(), results = []
  for (const status of [301, 302, 303, 307, 308]) for (const location of [
    'http://127.0.0.1/admin', 'http://169.254.169.254/latest/meta-data/', '//10.0.0.1/', '/assets/app.js', 'https://public.example/']) {
    const visited = []
    await assert.rejects(createAssetReader(job, transport(buffers, { status, location, visited }))('/index.html'), /PUBLIC_CONTENT_MISMATCH/)
    assert.equal(visited.length, 1); results.push({ status, location, requests: visited.length })
  }
  await evidence('T1-redirects', results)
})
test('D19 T4: pinned transport rejects unknown paths, overflow, hash mismatch and stalls deterministically', async () => {
  const { buffers, job } = target()
  await assert.rejects(createAssetReader(job, transport(buffers))('/.env'), /TARGET_REJECTED/)
  await assert.rejects(createAssetReader(job, transport(buffers, { body: Buffer.alloc(4096) }))('/index.html'), /PUBLIC_CONTENT_MISMATCH/)
  await assert.rejects(createAssetReader(job, transport(buffers, { body: Buffer.alloc(buffers.get('index.html').length) }))('/index.html'), /PUBLIC_CONTENT_MISMATCH/)
  await assert.rejects(createAssetReader({ ...job, deadline: Date.now() + 80 }, transport(buffers, { stall: true }))('/index.html'), /CAPTURE_TIMEOUT/)
  const visited = [], reader = createAssetReader(job, transport(buffers, { visited }))
  const reads = await Promise.all([reader('/index.html'), reader('/index.html')])
  assert.deepEqual(reads[0], buffers.get('index.html')); assert.equal(visited.length, 1)
})
