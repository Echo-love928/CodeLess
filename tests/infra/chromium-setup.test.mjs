import assert from 'node:assert/strict'
import { test } from 'node:test'
import { officialUbuntuSources, checkedCommand } from '../../.github/scripts/prepare-chromium.mjs'

test('CI provisioning changes only the observed slow Ubuntu mirror in legacy and deb822 sources', () => {
  const legacy = 'deb http://azure.archive.ubuntu.com/ubuntu/ noble main universe\n'
  const deb822 = 'Types: deb\nURIs: https://azure.archive.ubuntu.com/ubuntu\nSuites: noble noble-updates\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n'
  assert.equal(officialUbuntuSources(legacy), legacy.replace('azure.archive.ubuntu.com', 'archive.ubuntu.com'))
  assert.equal(officialUbuntuSources(deb822), deb822.replace('azure.archive.ubuntu.com', 'archive.ubuntu.com'))
  const other = 'deb https://security.ubuntu.com/ubuntu noble-security main\ndeb https://example.test/ubuntu noble main\n'
  assert.equal(officialUbuntuSources(other), other)
  assert.equal(officialUbuntuSources(officialUbuntuSources(deb822)), officialUbuntuSources(deb822))
})

test('failed or unknown browser prerequisites cannot be reported as ready', () => {
  for (const result of [{ status: 1 }, { status: null, signal: 'SIGTERM' }, { status: null, error: { code: 'ETIMEDOUT' } }]) {
    assert.throws(() => checkedCommand('corepack', ['pnpm', 'exec', 'playwright', 'install', 'chromium'], {}, () => result), /prerequisite failed/)
  }
})
