import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkConfig } from '../../infra/check-config.mjs'
import { verify, sha } from '../export/verify-export.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8').replace(/^\uFEFF/, '')
const source = read('.env.example')
const values = checkConfig(source)

test('T3: example keeps all credentials blank except explicitly local database values', () => {
  assert.equal(values.get('POSTGRES_PASSWORD'), 'local-dev-only-change-me')
  assert.equal(values.get('CODELESS_DATABASE_PASSWORD'), 'local-dev-only-change-me')
  for (const [key, value] of values) {
    if (/(?:KEY|TOKEN|SECRET|PASSWORD)$/.test(key) && !['POSTGRES_PASSWORD', 'CODELESS_DATABASE_PASSWORD'].includes(key)) assert.equal(value, '', key)
  }
  assert.equal(values.get('CODELESS_MODEL_PROVIDER'), 'deterministic-mock')
  assert.equal(values.get('CODELESS_PUBLICATION_ENABLED'), 'false')
  assert.equal(values.get('CODELESS_COOKIE_SECURE'), 'false')
  assert.doesNotMatch(source, /-----BEGIN|sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}/)
})

test('configuration rejects missing, inconsistent and colliding local database settings', () => {
  assert.throws(() => checkConfig(source.replace('POSTGRES_PASSWORD=local-dev-only-change-me', 'POSTGRES_PASSWORD=')), /missing/)
  assert.throws(() => checkConfig(source.replace('CODELESS_DATABASE_PASSWORD=local-dev-only-change-me', 'CODELESS_DATABASE_PASSWORD=different')), /credentials/)
  assert.throws(() => checkConfig(source.replace('CODELESS_PREVIEW_PORT=18081', 'CODELESS_PREVIEW_PORT=18080')), /distinct/)
})

test('root and standalone Vue dependencies retain frozen toolchain and own lockfiles', () => {
  const platform = JSON.parse(read('package.json')), template = JSON.parse(read('templates/vue/package.json'))
  assert.equal(platform.engines.node, template.engines.node)
  assert.equal(platform.engines.pnpm, template.engines.pnpm)
  assert.equal(platform.packageManager, `pnpm@${platform.engines.pnpm}`)
  for (const file of ['pnpm-lock.yaml', 'templates/vue/pnpm-lock.yaml']) assert.match(read(file), /lockfileVersion:/)
  for (const group of ['dependencies', 'devDependencies']) {
    for (const pkg of [platform, template]) for (const version of Object.values(pkg[group] ?? {})) assert.match(version, /^\d+\.\d+\.\d+$/)
  }
  assert.match(read('infra/build-image/Dockerfile'), new RegExp(`^FROM node:${platform.engines.node.replaceAll('.', '\\.')}.*@sha256:[a-f0-9]{64}`, 'm'))
})

test('installation links resolve and guide distinguishes mock, real model and independent export', () => {
  for (const path of ['README.md', 'docs/install.md', 'docs/troubleshooting.md']) {
    for (const match of read(path).matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1].split('#')[0]
      if (!link || /^https?:/.test(link)) continue
      assert.ok(existsSync(resolve(root, dirname(path), link)), `${path}: ${link}`)
    }
  }
  const guide = read('docs/install.md')
  for (const command of ['tests/e2e/full/record-command.mjs full', 'tests/model/run-real-plan.ps1', 'tests/export/verify-export.mjs', 'tests/export/clean-build.mjs', 'infra/check-config.mjs', 'spring-boot:run']) assert.ok(guide.includes(command), command)
  assert.match(guide, /BLOCKED/)
  assert.match(guide, /CODELESS_COOKIE_SECURE=false/)
  assert.match(read('docs/generated-project-readme.md'), /install --frozen-lockfile/)
})

test('T4: committed independent build evidence matches the exact verified export ZIP and original build log', () => {
  const base = 'tests/install/evidence/2026-10-28/'
  const archive = readFileSync(resolve(root, base, 'export-sample.zip'))
  const independent = verify(archive)
  assert.equal(independent.status, 'PASSED', JSON.stringify(independent.failures))
  const built = JSON.parse(read(base + 'clean-build.json'))
  assert.equal(built.archiveDigest, sha(archive))
  assert.equal(built.logDigest, sha(readFileSync(resolve(root, base, 'clean-build.log'))))
  assert.equal(built.status, 'PASSED')
  assert.equal(built.exitCode, 0)
  assert.equal(built.hostProjectUnchanged, true)
  assert.equal(built.hostNodeModulesCreated, false)
  assert.equal(built.lockfileErrors, false)
  assert.equal(built.templateLineEndings, 'EXPORTED_BYTES')
  assert.equal(built.reproduction, 'NOT_REQUESTED')
})
