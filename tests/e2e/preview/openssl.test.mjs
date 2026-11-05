import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveOpenSSL } from './fixtures.mjs'

test('TLS prefers a working openssl from PATH', () => {
  assert.equal(resolveOpenSSL({ platform: 'win32', run: name => {
    assert.equal(name, 'openssl'); return 'OpenSSL 3'
  } }), 'openssl')
})

for (const git of ['C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\git.exe']) {
  test('TLS locates bundled openssl from ' + git, () => {
    const expected = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'
    assert.equal(resolveOpenSSL({ platform: 'win32', exists: path => path === expected,
      run: name => {
        if (name === 'where.exe') return git
        if (name === expected) return 'OpenSSL 3'
        throw new Error('not found')
      } }), expected)
  })
}

test('TLS checks other Git installations and reports a useful error when none works', () => {
  const expected = 'D:\\Git\\usr\\bin\\openssl.exe'
  const run = name => {
    if (name === 'where.exe') return 'C:\\broken\\cmd\\git.exe\r\nD:\\Git\\cmd\\git.exe'
    if (name === expected) return 'OpenSSL 3'
    throw new Error('unavailable')
  }
  assert.equal(resolveOpenSSL({ platform: 'win32', run, exists: path => path === expected }), expected)
  assert.throws(() => resolveOpenSSL({ platform: 'win32', run, exists: () => false }), /openssl on PATH/)
})
