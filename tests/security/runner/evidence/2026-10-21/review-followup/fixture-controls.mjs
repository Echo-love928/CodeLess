import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
const root = resolve('.local-data/d19-b/review-followup'), directory = join(root, new Date().toISOString().replaceAll(':', '-'))
await mkdir(directory, { recursive: true })
const path = 'tests/security/runner/site.test.mjs', originalUrl = pathToFileURL(resolve(path))
const baseline = spawnSync('git', ['show', '587f830:' + path], { encoding: 'utf8' })
assert.equal(baseline.status, 0, baseline.stderr)
const fixed = await readFile(path, 'utf8'), results = []
const cases = [
  ['baseline-proxy', baseline.stdout, 'proxy', 1], ['fixed-proxy', fixed, 'proxy', 0],
  ['baseline-delayed-close-mutant', baseline.stdout, 'replay', 0], ['fixed-delayed-close-mutant', fixed, 'replay', 1],
]
for (const [name, source, fault, expectedExit] of cases) {
  let variant = source.replace(/from '(\.[^']+)'/g, (_, specifier) => 'from ' + JSON.stringify(new URL(specifier, originalUrl).href))
  // Confine a poisoned inherited proxy to this disposable browser. No OS setting is changed.
  variant = variant.replace('chromium.launch({ args:', "chromium.launch({ proxy: { server: 'http://127.0.0.1:9' }, args:")
    .replace(", '--no-proxy-server'", '')
  if (fault === 'replay') {
    // Both variants get working fixture transport, then only the private close call is faulted.
    variant = variant.replace('newContext({ ignoreHTTPSErrors: true })', "newContext({ ignoreHTTPSErrors: true, proxy: { server: 'http://127.0.0.1:9', bypass: '*.test,127.0.0.1' } })")
    const close = 'await page.evaluate(() => window.session.close())'
    const post = "await frame.locator('body').evaluate((_node, selection) => parent.postMessage(selection, '*'), selection)"
    const boundary = variant.indexOf(close)
    assert.ok(boundary >= 0)
    const afterClose = variant.slice(boundary).replace(close, 'await page.evaluate(() => { window.session.close = () => {}; window.session.close() })')
      .replace(post, "await frame.locator('body').evaluate((_node, selection) => { setTimeout(() => parent.postMessage(selection, '*'), 1000) }, selection)")
    assert.notEqual(afterClose, variant.slice(boundary))
    variant = variant.slice(0, boundary) + afterClose
  }
  const file = join(directory, name + '.test.mjs'); await writeFile(file, variant)
  const startedAt = new Date().toISOString()
  const run = spawnSync(process.execPath, ['--test', file], { encoding: 'utf8', timeout: 90000, windowsHide: true,
    env: { ...process.env, CODELESS_SECURITY_EVIDENCE_DIR: join(directory, name + '-results') } })
  const log = (run.stdout ?? '') + (run.stderr ?? ''); await writeFile(join(directory, name + '.log'), log)
  const result = { name, fault, expectedExit, actualExit: run.status, signal: run.signal, startedAt, completedAt: new Date().toISOString(),
    variantSha256: createHash('sha256').update(variant).digest('hex'), logSha256: createHash('sha256').update(log).digest('hex'),
    testsExpectedToFail: name === 'fixed-delayed-close-mutant', baselineFalsePass: name === 'baseline-delayed-close-mutant',
    diagnostic: log.slice(-3000) }
  results.push(result); console.log(JSON.stringify({ name, expectedExit, actualExit: run.status }))
}
await writeFile(join(directory, 'controls.json'), JSON.stringify(results, null, 2))
console.log(directory)
for (const result of results) assert.equal(result.actualExit, result.expectedExit, JSON.stringify(result))
assert.match(results[0].diagnostic, /ERR_(?:PROXY_CONNECTION_FAILED|CONNECTION_CLOSED|TUNNEL_CONNECTION_FAILED)/)
assert.match(results[3].diagnostic, /delivered replay after close/)
