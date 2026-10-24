import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openInitialLogin } from '../e2e/full/initial-navigation.mjs'

const changed = () => new Error('page.goto: net::ERR_NETWORK_CHANGED at https://platform.codeless.test:34557/login')

test('initial login survives one Chromium network change and retains both attempts', async () => {
  const attempts = [], calls = [], response = { status: () => 200 }
  const page = { async goto(path, options) {
    calls.push({ path, options })
    if (calls.length === 1) throw changed()
    return response
  } }
  assert.equal(await openInitialLogin(page, attempts), response)
  assert.deepEqual(calls.map(call => call.path), ['/login', '/login'])
  assert.deepEqual(attempts.map(attempt => attempt.status), ['FAILED', 'SUCCEEDED'])
  assert.match(attempts[0].error, /ERR_NETWORK_CHANGED/)
  assert.ok(calls.every(call => call.options.timeout > 0 && call.options.timeout <= 15_000))
})

test('persistent network changes stop after three GET attempts and preserve the error', async () => {
  let calls = 0
  const error = changed(), attempts = []
  await assert.rejects(openInitialLogin({ async goto(path) {
    assert.equal(path, '/login'); calls++; throw error
  } }, attempts), failure => failure === error)
  assert.equal(calls, 3)
  assert.equal(attempts.length, 3)
  assert.ok(attempts.every(attempt => attempt.status === 'FAILED'))
})

for (const message of ['net::ERR_CONNECTION_REFUSED', 'net::ERR_CERT_AUTHORITY_INVALID',
  'net::ERR_NAME_NOT_RESOLVED', 'page.goto: Timeout 15000ms exceeded', 'unexpected navigation failure']) {
  test('initial login does not retry ' + message, async () => {
    let calls = 0
    const error = new Error(message), attempts = []
    await assert.rejects(openInitialLogin({ async goto() { calls++; throw error } }, attempts), failure => failure === error)
    assert.equal(calls, 1)
    assert.deepEqual(attempts.map(attempt => attempt.status), ['FAILED'])
  })
}

test('network changes share one deadline instead of resetting the navigation timeout', async () => {
  let clock = 0
  const calls = [], attempts = [], error = changed()
  await assert.rejects(openInitialLogin({ async goto(path, options) {
    calls.push(options.timeout)
    clock += 8_000
    throw error
  } }, attempts, { now: () => clock }), failure => failure === error)
  assert.deepEqual(calls, [15_000, 7_000])
  assert.equal(attempts.length, 2)
})

test('an HTTP failure response is returned to existing page assertions without retry', async () => {
  let calls = 0
  const attempts = [], response = { status: () => 503 }
  assert.equal(await openInitialLogin({ async goto() { calls++; return response } }, attempts), response)
  assert.equal(calls, 1)
  assert.deepEqual(attempts.map(attempt => attempt.status), ['SUCCEEDED'])
  assert.equal(attempts[0].httpStatus, 503)
})
