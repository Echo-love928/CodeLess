// Supplementary offline build image, always from the same frozen release source.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { resolve, relative, join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { root, hash, command, inventory, gitArchive } from '../../../infra/release/client/package.mjs'
const [commit, destination] = process.argv.slice(2)
assert.match(commit, /^[a-f0-9]{40}$/)
assert.equal(command('git', ['rev-parse', `${commit}^{commit}`]), commit)
const output = resolve(destination), rel = relative(resolve(root, '.local-data/d27-b'), output)
assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..'))
await mkdir(output)
const report = { task: 'D27-B', commit, status: 'BUILDING', imageReference: `codeless-d27-b:${commit}`,
  buildToolSha256: hash(await readFile(fileURLToPath(import.meta.url))), steps: [], exported: false,
  publishedToRegistry: false, policyTagPromoted: false, reproducibility: 'frozen source and exported bytes; no cold-cache image byte equality claim' }
const save = () => writeFile(join(output, 'image.json'), JSON.stringify(report, null, 2) + '\n')
await save()
try {
  const context = join(output, 'context'); await mkdir(context)
  const sourceArchive = join(output, 'context.tar')
  gitArchive(commit, ['infra/build-image', 'templates/vue'], sourceArchive)
  command('tar', ['-xf', sourceArchive, '-C', context])
  report.sourceArchiveSha256 = hash(await readFile(sourceArchive))
  report.sources = await inventory(context)
  report.baseImage = (await readFile(join(context, 'infra/build-image/Dockerfile'), 'utf8')).split(/\r?\n/)[0].slice(5)
  assert.match(report.baseImage, /@sha256:[a-f0-9]{64}$/)
  const args = ['build', '--label', 'org.opencontainers.image.revision=' + commit,
    '--tag', report.imageReference, '--file', join(context, 'infra/build-image/Dockerfile'), context]
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 16 * 1024 * 1024 })
  await writeFile(join(output, 'build.log'), (result.stdout ?? '') + (result.stderr ?? ''))
  report.steps.push({ command: ['docker', ...args.map(p => p.startsWith(root) ? relative(root, p) : p)], exitCode: result.status, signal: result.signal })
  if (result.error || result.status !== 0 || result.signal) throw new Error('Docker build failed')
  const info = JSON.parse(command('docker', ['image', 'inspect', report.imageReference]))[0]
  assert.match(info.Id, /^sha256:[a-f0-9]{64}$/)
  assert.equal(info.Config.Labels['org.opencontainers.image.revision'], commit)
  report.imageId = info.Id; report.os = info.Os; report.architecture = info.Architecture
  report.descriptor = info.Descriptor ?? null
  report.localImageBytes = info.Size; report.registryDigests = info.RepoDigests
  const probe = `const {createRequire}=await import('node:module');const require=createRequire(process.cwd()+'/probe.cjs');console.log(JSON.stringify({node:process.version,vue:require('vue/package.json').version,vite:require('vite/package.json').version,typescript:require('typescript/package.json').version}))`
  report.runtime = JSON.parse(command('docker', ['run', '--rm', '--network=none', '--read-only', '--user=1000:1000',
    '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=512m', '--cpus=1',
    '--entrypoint=node', report.imageReference, '--input-type=module', '-e', probe]))
  const template = JSON.parse(await readFile(join(context, 'templates/vue/package.json'), 'utf8'))
  assert.equal(report.runtime.node, 'v' + template.engines.node)
  for (const name of ['vue', 'vite', 'typescript']) assert.equal(report.runtime[name], template.dependencies?.[name] ?? template.devDependencies[name])
  report.steps.push({ command: ['docker', 'run', '--rm', '--network=none', '--read-only', '<fixed isolated version probe>'], exitCode: 0, signal: null })
  const archive = join(output, 'runner-build-image.tar')
  command('docker', ['image', 'save', '--output', archive, report.imageReference])
  report.steps.push({ command: ['docker', 'image', 'save', '--output', relative(root, archive), report.imageReference], exitCode: 0, signal: null })
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(archive)) digest.update(chunk)
  report.artifact = { path: relative(root, archive).replaceAll('\\', '/'), sha256: digest.digest('hex'), bytes: (await stat(archive)).size }
  const extract = path => {
    const result = spawnSync('tar', ['-xOf', archive, path], { windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
    assert.equal(result.status, 0); return result.stdout
  }
  const exported = JSON.parse(extract('manifest.json'))[0]
  assert.ok(exported.RepoTags.includes(report.imageReference))
  assert.match(exported.Config, /^(?:blobs\/sha256\/[a-f0-9]{64}|[a-f0-9]{64}\.json)$/)
  const configBytes = extract(exported.Config), config = JSON.parse(configBytes)
  assert.equal(config.config.Labels['org.opencontainers.image.revision'], commit)
  const configDigest = 'sha256:' + hash(configBytes)
  assert.ok(exported.Config.includes(configDigest.slice(7)))
  if (report.descriptor?.mediaType === 'application/vnd.oci.image.index.v1+json') {
    const index = JSON.parse(extract('index.json'))
    assert.ok(index.manifests.some(value => value.digest === report.imageId))
    assert.equal('sha256:' + hash(extract('blobs/sha256/' + report.imageId.slice(7))), report.imageId)
  } else assert.equal(configDigest, report.imageId)
  report.archiveIdentity = { verified: true, sourceRevisionLabel: commit, configDigest, imageId: report.imageId }
  report.exported = true; report.status = 'BUILT'
} catch (error) { report.status = 'FAILED'; report.error = error.code ?? error.name; process.exitCode = 1 }
await save(); console.log(JSON.stringify(report))
