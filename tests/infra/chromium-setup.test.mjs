import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { officialUbuntuSources, checkedCommand, ubuntuSourceFiles } from '../../.github/scripts/prepare-chromium.mjs'

test('CI provisioning changes only the observed slow Ubuntu mirror in legacy and deb822 sources', () => {
  const legacy = 'deb http://azure.archive.ubuntu.com/ubuntu/ noble main universe\n'
  const deb822 = 'Types: deb\nURIs: https://azure.archive.ubuntu.com/ubuntu\nSuites: noble noble-updates\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n'
  assert.equal(officialUbuntuSources(legacy), legacy.replace('azure.archive.ubuntu.com', 'archive.ubuntu.com'))
  assert.equal(officialUbuntuSources(deb822), deb822.replace('azure.archive.ubuntu.com', 'archive.ubuntu.com'))
  const other = 'deb https://security.ubuntu.com/ubuntu noble-security main\ndeb https://example.test/ubuntu noble main\n'
  assert.equal(officialUbuntuSources(other), other)
  assert.equal(officialUbuntuSources(officialUbuntuSources(deb822)), officialUbuntuSources(deb822))
})

test('GitHub mirror+file configuration is prepared while preserving mirror priorities', () => {
  assert(ubuntuSourceFiles.includes('/etc/apt/apt-mirrors.txt'))
  const mirrors = 'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttp://archive.ubuntu.com/ubuntu/\tpriority:2\n'
  assert.equal(officialUbuntuSources(mirrors), mirrors.replace('azure.archive.ubuntu.com', 'archive.ubuntu.com'))
})

test('failed or unknown browser prerequisites cannot be reported as ready', () => {
  for (const result of [{ status: 1 }, { status: null, signal: 'SIGTERM' }, { status: null, error: { code: 'ETIMEDOUT' } }]) {
    assert.throws(() => checkedCommand('corepack', ['pnpm', 'exec', 'playwright', 'install', 'chromium'], {}, () => result), /prerequisite failed/)
  }
})

test('API CI prepares locked Chromium before Maven initializes browser-backed suites', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  const api = workflow.split('\n  api:\n')[1]?.split(/\n  [\w-]+:\n/)[0]
  assert.ok(api, 'API CI job must exist')
  const commands = [...api.matchAll(/^\s+(?:-\s+)?run:\s*(.+)$/gm)].map(match => match[1].trim())
  const dependencies = commands.indexOf('pnpm install --frozen-lockfile')
  const chromium = commands.indexOf('node .github/scripts/prepare-chromium.mjs')
  const tests = commands.indexOf('pnpm verify:api')
  assert.ok(dependencies >= 0, 'API CI must install locked workspace dependencies')
  assert.ok(chromium > dependencies, 'API CI must provision and smoke-test Chromium after installing dependencies')
  assert.ok(tests > chromium, 'API tests must start only after Chromium provisioning succeeds')
})
