// D16-A-T1 harness: extract one exported ZIP with the independent reader, then install from its lockfile and build
// in a fresh container of the same pinned Node image as the trusted build image. No host node_modules, pnpm store,
// npm cache or repository files are visible; the extracted project is mounted read-only and copied inside.
// This is a developer/test tool that emulates a user's clean machine. It is not a platform runtime capability.
// Usage: node tests/export/clean-build.mjs <zip> <new-work-dir> [--expect-artifact-digest D] [--crlf-template-diagnostic]
// Exit: 0 built (and, with --expect-artifact-digest, reproduced); 3 built but not reproduced; 1 build failed.
// --crlf-template-diagnostic is not an acceptance mode: inside the container copy it rewrites TEMPLATE/TEMPLATE_DEFAULT
// files the way a Windows core.autocrlf checkout presents them, to explain an artifact built by a Windows-built image.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync, existsSync, openSync, closeSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readZip, extract, rootFolder } from './zip-reader.mjs'
import { canonical, sha } from './verify-export.mjs'
import { containerUser } from '../../services/runner/src/template/build.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const [zip, work, ...flags] = process.argv.slice(2)
let expectedArtifact = null, crlf = false
for (let i = 0; i < flags.length; i++) {
  if (flags[i] === '--expect-artifact-digest' && /^sha256:[a-f0-9]{64}$/.test(flags[i + 1] ?? '')) expectedArtifact = flags[++i]
  else if (flags[i] === '--crlf-template-diagnostic') crlf = true
  else throw new Error('Usage: clean-build.mjs <zip> <new-work-dir> [--expect-artifact-digest sha256:...] [--crlf-template-diagnostic]')
}
if (!zip || !work) throw new Error('Usage: clean-build.mjs <zip> <new-work-dir> [--expect-artifact-digest sha256:...] [--crlf-template-diagnostic]')
const target = resolve(work)
if (existsSync(target) && readdirSync(target).length) throw new Error('work directory must be new or empty')
mkdirSync(target, { recursive: true })
// Same digest-pinned base as infra/build-image/Dockerfile; never a floating tag.
const image = readFileSync(join(repo, 'infra/build-image/Dockerfile'), 'utf8').match(/^FROM (node:[0-9.]+-bookworm-slim@sha256:[a-f0-9]{64})$/m)?.[1]
if (!image) throw new Error('pinned Node base image not found in infra/build-image/Dockerfile')

const archive = readFileSync(zip), entries = readZip(archive), root = rootFolder(entries)
const project = extract(entries, join(target, 'project'))
const manifest = JSON.parse(readFileSync(join(project, root, 'codeless-export.json'), 'utf8'))
const node = image.match(/^node:([0-9.]+)-/)[1]
if (manifest.toolchain.node !== node) throw new Error(`export requires Node ${manifest.toolchain.node}, pinned image is ${node}`)
const pnpm = manifest.toolchain.pnpm
if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(pnpm)) throw new Error('invalid pnpm version in manifest')
const out = join(target, 'out'); mkdirSync(out)
const before = digestTree(join(project, root))

const templated = manifest.files.filter(f => ['TEMPLATE', 'TEMPLATE_DEFAULT'].includes(f.origin)).map(f => f.path)
for (const path of templated) if (!/^[A-Za-z0-9._/-]+$/.test(path)) throw new Error(`unexpected template path ${path}`)
const steps = [
  'cp -R /export /tmp/app', 'cd /tmp/app', 'test ! -e node_modules', 'test ! -e dist', 'node --version',
  ...(crlf ? [`node -e 'const fs=require("node:fs");for(const f of process.argv.slice(1))fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/\\n/g,"\\r\\n"))' ${templated.join(' ')}`] : []),
  `corepack pnpm@${pnpm} --version`,
  `corepack pnpm@${pnpm} install --frozen-lockfile --store-dir /tmp/pnpm-store`,
  `corepack pnpm@${pnpm} run build`,
  'cp -R dist /out/dist'
]
const script = 'set -eux; ' + steps.join(' && ')
const args = ['run', '--rm', '--pull', 'missing', '--network', 'bridge', '--read-only', '--user', containerUser(),
  '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '512', '--memory', '2g', '--cpus', '2',
  '--tmpfs', '/tmp:rw,exec,nosuid,size=1536m',
  '-e', 'HOME=/tmp', '-e', 'COREPACK_HOME=/tmp/corepack', '-e', 'COREPACK_ENABLE_DOWNLOAD_PROMPT=0',
  '-e', 'npm_config_cache=/tmp/npm-cache', '-e', 'CI=1',
  '--mount', `type=bind,src=${join(project, root)},dst=/export,readonly`,
  '--mount', `type=bind,src=${out},dst=/out`,
  image, 'sh', '-c', script]
const logFile = join(target, 'clean-build.log'), log = openSync(logFile, 'wx')
const started = Date.now()
const result = spawnSync('docker', args, { stdio: ['ignore', log, log], timeout: 900000, windowsHide: true })
closeSync(log)
const logBytes = readFileSync(logFile), text = logBytes.toString('utf8')
const dist = join(out, 'dist'), built = existsSync(join(dist, 'index.html'))
const distManifest = built ? manifestOf(dist) : null
const report = {
  status: result.status === 0 && !result.error && built ? 'PASSED' : 'FAILED',
  exitCode: result.status, signal: result.signal, launchError: result.error?.code ?? null, durationMs: Date.now() - started,
  image, user: containerUser(), network: 'bridge (npm registry only needed for the lockfile install)',
  node, pnpm, steps, templateLineEndings: crlf ? 'CRLF_DIAGNOSTIC_NOT_EXPORT_BYTES' : 'EXPORTED_BYTES',
  archiveDigest: sha(archive), root, versionId: manifest.versionId,
  hostProjectUnchanged: digestTree(join(project, root)) === before,
  hostNodeModulesCreated: existsSync(join(project, root, 'node_modules')),
  lockfileErrors: /ERR_PNPM_OUTDATED_LOCKFILE|ERR_PNPM_LOCKFILE|ERR_PNPM_FROZEN/.test(text),
  distIndexHtml: built, distFiles: distManifest?.files.length ?? 0, distDigest: distManifest?.digest ?? null,
  expectedArtifactDigest: expectedArtifact ?? null,
  artifactReproduced: expectedArtifact ? distManifest?.digest === expectedArtifact : null,
  // Build success and artifact reproduction are separate results; see the exit code below.
  reproduction: !expectedArtifact ? 'NOT_REQUESTED' : distManifest?.digest === expectedArtifact ? 'REPRODUCED' : 'NOT_REPRODUCED',
  logDigest: sha(logBytes), log: relative(target, logFile)
}
writeFileSync(join(target, 'clean-build.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ status: report.status, exitCode: report.exitCode, distDigest: report.distDigest, reproduction: report.reproduction }))
// 0: built (and reproduced when an expected digest was given); 3: built but the requested reproduction failed; 1: build failed.
process.exitCode = report.status !== 'PASSED' ? 1 : report.reproduction === 'NOT_REPRODUCED' ? 3 : 0

function walk(base, current = base, files = []) {
  for (const name of readdirSync(current).sort()) {
    const file = join(current, name), stat = lstatSync(file)
    if (stat.isSymbolicLink()) throw new Error(`link in build output: ${relative(base, file)}`)
    if (stat.isDirectory()) walk(base, file, files)
    else files.push(relative(base, file).split(sep).join('/'))
  }
  return files
}
function manifestOf(base) {
  const files = walk(base).map(path => { const bytes = readFileSync(join(base, path)); return { path, bytes: bytes.length, digest: sha(bytes) } })
  return { files, digest: canonical(files) }
}
function digestTree(base) { return manifestOf(base).digest }
