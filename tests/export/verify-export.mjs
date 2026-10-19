// Independent D16-A verifier for one exported ZIP (T2 exclusion, T4 hash agreement). Read-only.
// Usage: node tests/export/verify-export.mjs <zip> [--version ID] [--source-digest D] [--artifact-digest D]
//        [--forbidden-file FILE (one literal per line)] [--out RESULT.json]
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readZip, rootFolder } from './zip-reader.mjs'

export const FIXED = ['index.html', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'src/App.vue', 'src/build-node.d.ts',
  'src/main.ts', 'src/router.ts', 'tsconfig.json', 'vite.config.ts']
export const DEFAULTS = ['src/pages/CatalogPage.vue', 'src/pages/HomePage.vue', 'src/pages/TasksPage.vue']
const SOURCE = /^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/
const FORBIDDEN = [/(^|\/)\./, /(^|\/)node_modules(\/|$)/i, /(^|\/)dist(\/|$)/i, /\.(log|pem|key|p12|pfx|env|zip)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)/i, /(^|\/)(fixtures|preview-bridge)(\/|$)/, /(^|\/)allowed-dependencies\.json$/]
const MANIFEST_KEYS = ['protocol', 'applicationId', 'versionId', 'versionNumber', 'status', 'buildId', 'sourceDigest', 'artifactDigest',
  'reportDigest', 'templateDigest', 'contentDigest', 'toolchain', 'files']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
/** D11 canonical identity: SHA-256 of compact UTF-8 JSON [{path,bytes,digest}] sorted by path. */
export const canonical = files => sha(Buffer.from(JSON.stringify([...files]
  .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(({ path, bytes, digest }) => ({ path, bytes, digest }))), 'utf8'))

export function verify(buffer, expected = {}) {
  const failures = [], check = (ok, message) => { if (!ok) failures.push(message) }
  const entries = readZip(buffer), root = rootFolder(entries), files = new Map(), lower = new Set()
  for (const e of entries) {
    const path = e.name.slice(root.length + 1)
    check(e.name.startsWith(root + '/') && path.length > 0, `member outside root: ${e.name}`)
    check((e.madeBy >> 8) === 3 && e.mode === 0o100644 && e.dosAttributes === 0, `not a regular 0644 Unix file: ${path}`)
    check(e.flags === 0x0800 && e.extra === 0 && e.comment === 0, `unexpected flags/extra/comment: ${path}`)
    check(/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(path), `non-portable path: ${path}`)
    for (const pattern of FORBIDDEN) check(!pattern.test(path), `forbidden path ${pattern}: ${path}`)
    check(FIXED.includes(path) || SOURCE.test(path) || ['README.md', 'codeless-export.json'].includes(path), `path outside allowlist: ${path}`)
    check(!lower.has(path.toLowerCase()), `duplicate or case-alias path: ${path}`)
    lower.add(path.toLowerCase()); files.set(path, e.data)
  }
  const manifestBytes = files.get('codeless-export.json')
  check(manifestBytes !== undefined, 'codeless-export.json missing')
  const manifest = manifestBytes ? JSON.parse(manifestBytes.toString('utf8')) : {}
  check(JSON.stringify(Object.keys(manifest)) === JSON.stringify(MANIFEST_KEYS), 'manifest keys are not the exact v1 set')
  check(manifest.protocol === 'codeless-source-export/v1' && manifest.status === 'VERIFIED', 'manifest protocol/status')
  check(UUID.test(manifest.versionId ?? '') && UUID.test(manifest.applicationId ?? '') && UUID.test(manifest.buildId ?? ''), 'manifest IDs')
  check(root === `codeless-${manifest.versionId}`, 'root folder does not name the manifest version')
  const listed = Array.isArray(manifest.files) ? manifest.files : []
  const listedPaths = listed.map(f => f.path), actualPaths = [...files.keys()].filter(p => p !== 'codeless-export.json')
  check(JSON.stringify([...listedPaths].sort()) === JSON.stringify([...actualPaths].sort()), 'manifest file list differs from archive members')
  for (const f of listed) {
    const data = files.get(f.path)
    check(JSON.stringify(Object.keys(f)) === JSON.stringify(['path', 'bytes', 'digest', 'origin']), `manifest entry keys: ${f.path}`)
    check(data !== undefined && data.length === f.bytes && sha(data) === f.digest, `bytes/digest mismatch: ${f.path}`)
    check(['TEMPLATE', 'TEMPLATE_DEFAULT', 'VERSION_SOURCE', 'README'].includes(f.origin), `unknown origin: ${f.path}`)
    if (f.origin === 'TEMPLATE') check(FIXED.includes(f.path), `TEMPLATE origin outside fixed set: ${f.path}`)
    if (f.origin === 'TEMPLATE_DEFAULT') check(DEFAULTS.includes(f.path), `TEMPLATE_DEFAULT outside default slots: ${f.path}`)
    if (f.origin === 'VERSION_SOURCE') check(SOURCE.test(f.path), `VERSION_SOURCE outside source allowlist: ${f.path}`)
    if (f.origin === 'README') check(f.path === 'README.md', 'README origin path')
  }
  for (const path of FIXED) check(listed.some(f => f.path === path && f.origin === 'TEMPLATE'), `fixed template file missing: ${path}`)
  const of = origin => listed.filter(f => f.origin === origin)
  const digests = { contentDigest: canonical(listed), sourceDigest: canonical(of('VERSION_SOURCE')), templateDigest: canonical(of('TEMPLATE')) }
  for (const [key, value] of Object.entries(digests)) check(manifest[key] === value, `${key} does not match the recomputed value`)
  if (expected.versionId) check(manifest.versionId === expected.versionId, 'versionId differs from the requested version')
  if (expected.sourceDigest) check(manifest.sourceDigest === expected.sourceDigest, 'sourceDigest differs from the platform version')
  if (expected.artifactDigest) check(manifest.artifactDigest === expected.artifactDigest, 'artifactDigest differs from the platform build')
  const engines = files.get('package.json') ? JSON.parse(files.get('package.json').toString('utf8')).engines ?? {} : {}
  check(manifest.toolchain?.node === engines.node && manifest.toolchain?.pnpm === engines.pnpm, 'toolchain differs from package.json engines')
  const readme = files.get('README.md')?.toString('utf8') ?? ''
  for (const key of ['versionId', 'sourceDigest', 'artifactDigest', 'templateDigest']) check(readme.includes(manifest[key]), `README lacks ${key}`)
  check(!/\{\{[A-Z][A-Z_]*\}\}/.test(readme), 'README has an unexpanded placeholder')
  for (const text of expected.forbiddenStrings ?? [])
    for (const [path, data] of files) check(data.indexOf(Buffer.from(text, 'utf8')) < 0, `forbidden content found in ${path}`)
  return { status: failures.length ? 'FAILED' : 'PASSED', failures, root, archiveBytes: buffer.length, archiveDigest: sha(buffer),
    entryCount: entries.length, manifest: { ...manifest, files: undefined }, recomputed: digests,
    files: listed.map(({ path, bytes, digest, origin }) => ({ path, bytes, digest, origin })),
    forbiddenStringsChecked: (expected.forbiddenStrings ?? []).length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [zip, ...rest] = process.argv.slice(2), options = {}
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--version', '--source-digest', '--artifact-digest', '--forbidden-file', '--out'].includes(rest[i]) || rest[i + 1] === undefined)
      throw new Error('Usage: verify-export.mjs <zip> [--version ID] [--source-digest D] [--artifact-digest D] [--forbidden-file F] [--out F]')
    options[rest[i]] = rest[i + 1]
  }
  const forbiddenStrings = options['--forbidden-file']
    ? readFileSync(options['--forbidden-file'], 'utf8').split(/\r?\n/).filter(Boolean) : []
  let result
  try {
    result = verify(readFileSync(zip), { versionId: options['--version'], sourceDigest: options['--source-digest'],
      artifactDigest: options['--artifact-digest'], forbiddenStrings })
  } catch (error) { result = { status: 'FAILED', failures: [`unreadable archive: ${error.message}`] } }
  const text = JSON.stringify(result, null, 2) + '\n'
  if (options['--out']) writeFileSync(options['--out'], text)
  console.log(JSON.stringify({ status: result.status, failures: result.failures, entryCount: result.entryCount, archiveDigest: result.archiveDigest }))
  process.exitCode = result.status === 'PASSED' ? 0 : 1
}
