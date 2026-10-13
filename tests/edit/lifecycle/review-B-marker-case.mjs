// Read-only peer review against an exact checkout; all fixture changes stay private.
import assert from 'node:assert/strict'
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { chromium } from '@playwright/test'

const base = resolve('.local-data/d12-a/review-b-72be44c')
const variant = process.argv[2] ?? 'uppercase'
assert.ok(['uppercase', 'spread-dynamic'].includes(variant))
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: base, encoding: 'utf8' }).trim()
assert.equal(head, '72be44ca2805f05375430f54b30a7285f7c965de')
execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', 'templates/vue', 'services/runner'], { cwd: base, stdio: 'pipe' })
const imageId = execFileSync('docker', ['image', 'inspect', 'codeless-d12-review:72be44c', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim()
const { createBuildRunner } = await import(pathToFileURL(join(base, 'services/runner/src/build/runner.mjs')))
const { readSnapshot } = await import(pathToFileURL(join(base, 'services/runner/src/artifacts/snapshot.mjs')))
const { buildVersionMapping, resolveSelection } = await import(pathToFileURL(join(base, 'services/runner/src/mapping/manifest.mjs')))
const root = resolve('.local-data/d12-a/probes', randomUUID()); await mkdir(root, { recursive: true })
const source = join(root, 'source'); await cp(join(base, 'templates/vue/fixtures/mapping'), source, { recursive: true })
const page = join(source, 'src/pages/HomePage.vue'), bytes = await readFile(page, 'utf8')
const change = variant === 'uppercase' ? '<SharedCard label="丙" DATA-AI-COMPONENT="home-page" />'
  : '<SharedCard label="丙" v-bind="{ \'data-ai-component\': \'home-page\' }" /><SharedCard label="dynamic" :[marker]="\'shared-card\'" />'
assert.ok(bytes.includes('<SharedCard label="丙" />'))
await writeFile(page, bytes.replace('<SharedCard label="丙" />', change).replace('</script>', "const marker = 'data-ai-component'\n</script>"))
const snapshot = await readSnapshot(source, { source: true })
const runBuild = await createBuildRunner({ workRoot: join(root, 'work'), artifactRoot: join(root, 'artifacts'), imageId })
const versionId = '55555555-5555-4555-8555-555555555555'
const mapped = await buildVersionMapping({ sourceDirectory: source, versionId, sourceDigest: snapshot.manifest.digest, runBuild })
assert.equal(mapped.status, 'MAPPED', JSON.stringify(mapped)); assert.equal(mapped.build.exitCode, 0)
const artifacts = await readSnapshot(mapped.build.artifact.directory)
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html', value = artifacts.buffers.get(path)
  if (!value) { res.writeHead(404).end(); return }
  res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(value)
})
let browser
try {
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  browser = await chromium.launch({ headless: true }); const tab = await browser.newPage()
  await tab.goto(`http://127.0.0.1:${server.address().port}/`); await tab.locator('h2').first().waitFor()
  const markers = await tab.locator('h2').evaluateAll(nodes => nodes.map(n => n.closest('[data-ai-component]')?.getAttribute('data-ai-component')))
  const selection = resolveSelection(mapped.manifest, { versionId, sourceDigest: snapshot.manifest.digest, componentId: markers[2] })
  const wrongSource = markers[2] === 'home-page' && selection.selectable && selection.sourceFile === 'src/pages/HomePage.vue'
  const selections = markers.map(componentId => resolveSelection(mapped.manifest, { versionId, sourceDigest: snapshot.manifest.digest, componentId }))
  const safe = variant === 'uppercase' ? !wrongSource : selections.every(value => !value.selectable && value.reason === 'UNSAFE_MARKER')
  const report = { status: safe ? 'PASSED' : 'BUG_CONFIRMED', variant, head, imageId, fixtureChange: change,
    expected: 'A marker override on SharedCard must never resolve to HomePage source', actual: { markers, selection, selections, manifest: mapped.manifest },
    realDockerBuild: true, realChromium: true, browserVersion: browser.version(), modelRequests: 0, buildExitCode: mapped.build.exitCode }
  await writeFile(`.local-data/d12-a/marker-${variant}.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report)); assert.equal(safe, true, 'Call-site marker override bypasses safe mapping')
} finally { try { await browser?.close() } finally { await new Promise(done => server.close(done)) } }
