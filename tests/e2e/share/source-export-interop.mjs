// Developer-only real HTTP check. Run while A's isolated test server/session is alive.
// No API/runtime shell capability; no credentials are written to the result.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(process.env.CODELESS_D16_B_ROOT ?? '.')
const origin = process.env.CODELESS_D16_A_INTEROP_URL, owner = process.env.CODELESS_D16_A_INTEROP_COOKIE
const other = process.env.CODELESS_D16_A_INTEROP_OTHER_COOKIE, id = process.env.CODELESS_D16_A_INTEROP_VERSION
const out = process.env.CODELESS_D16_A_INTEROP_OUT
if (!/^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/.test(origin ?? '') || !owner || !other || !/^[a-f0-9-]{36}$/.test(id ?? '') || !out)
  throw new Error('Isolated A test origin, owner/other session, version and private output directory are required')
await mkdir(out, { recursive: true })
const appRequire = createRequire(join(root, 'apps/web/package.json'))
const { build } = createRequire(appRequire.resolve('vite'))('esbuild')
const bundle = join(out, 'b-export-adapter.cjs')
await build({ stdin: { contents: `export { exportSource } from './apps/web/src/features/source/export-api.ts'; export { session } from './apps/web/src/features/auth/session.ts'`,
  resolveDir: root, loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' })
const { exportSource, session } = (await import(pathToFileURL(bundle).href)).default
const nativeFetch = globalThis.fetch
const direct = await nativeFetch(`${origin}/api/v0/versions/${id}/export`, { headers: { Cookie: owner }, redirect: 'error' })
assert.equal(direct.status, 200)
assert.equal(direct.headers.get('content-length'), null)
const expected = Buffer.from(await direct.arrayBuffer())
const versionResponse = await nativeFetch(`${origin}/api/v0/versions/${id}`, { headers: { Cookie: owner } })
assert.equal(versionResponse.status, 200)
const version = await versionResponse.json()
const requests = [], headers = Object.fromEntries([...direct.headers].filter(([key]) => key.startsWith('x-codeless-') || key === 'content-type'))
let cookie = owner
globalThis.fetch = async (path, init) => {
  assert.equal(path, `/api/v0/versions/${id}/export`)
  assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error')
  const response = await nativeFetch(origin + path, { ...init, headers: { ...init.headers, Cookie: cookie } })
  requests.push({ path, status: response.status })
  return response
}
session.status = 'authenticated'
try {
  const archive = await exportSource(version), downloaded = Buffer.from(await archive.blob.arrayBuffer())
  assert.deepEqual(downloaded, expected)
  assert.equal(archive.filename, `codeless-${id}.zip`)
  cookie = other
  await assert.rejects(exportSource(version), /版本不存在或你无权/)
  cookie = ''
  await assert.rejects(exportSource(version), /重新登录/)
  const count = requests.length
  await assert.rejects(exportSource({ ...version, status: 'DRAFT' }), /仅已验证版本/)
  await assert.rejects(exportSource({ ...version, status: 'FAILED' }), /仅已验证版本/)
  await assert.rejects(exportSource({ ...version, id: '../latest' }), /有效版本/)
  assert.equal(requests.length, count)
  await writeFile(join(out, 'download.zip'), downloaded)
  const report = { status: 'PASSED', transport: 'REAL_A_HTTP_STREAM', adapter: 'B production TypeScript bundled without mocks',
    versionId: id, applicationId: version.applicationId, sourceDigest: version.sourceDigest, bytes: downloaded.length,
    archiveDigest: 'sha256:' + createHash('sha256').update(downloaded).digest('hex'), filename: archive.filename,
    responseHeaders: headers, contentLengthAbsent: true, matchesDirectOwnerExport: true,
    requests, localDraftFailedInvalidRejectedWithoutRequest: true }
  await writeFile(join(out, 'interop.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} finally { globalThis.fetch = nativeFetch }
