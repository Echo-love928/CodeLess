// Operator-only packaging. No generated task input or live deployment actions.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir, lstat, cp } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

export const root = fileURLToPath(new URL('../../../', import.meta.url))
export const inputs = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'apps/web',
  'services/runner', 'services/api/src/main/resources/network/site-policy.json', 'templates/vue',
  'infra/runner', 'infra/build-image', 'infra/preview', 'infra/hosting', 'infra/public', 'infra/release/client']
export const runnerInputs = inputs.filter(p => !['apps/web', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'infra/release/client'].includes(p))
export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export function command(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 600000, ...options })
  if (result.error || result.signal || result.status !== 0) throw new Error(`Command failed: ${cmd}; exit=${result.status}; signal=${result.signal}`, { cause: result.error })
  return result.stdout?.trim()
}
export function pnpm(args, options = {}) {
  return process.platform === 'win32'
    ? command(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'corepack', 'pnpm', ...args], options)
    : command('corepack', ['pnpm', ...args], options)
}
export async function inventory(directory) {
  const files = {}
  async function visit(path) {
    for (const name of (await readdir(path)).sort()) {
      const entry = join(path, name), info = await lstat(entry)
      assert.ok(!info.isSymbolicLink(), 'Symlink forbidden')
      if (info.isDirectory()) await visit(entry)
      else {
        assert.ok(info.isFile(), 'Regular files required')
        const bytes = await readFile(entry)
        files[relative(directory, entry).replaceAll('\\', '/')] = { bytes: bytes.length, sha256: hash(bytes) }
      }
    }
  }
  await visit(directory)
  return files
}
export async function verify(directory, expectedCommit) {
  assert.match(expectedCommit, /^[a-f0-9]{40}$/)
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  assert.equal(manifest.schema, 1)
  assert.equal(manifest.commit, expectedCommit, 'Unexpected candidate commit')
  const actual = await inventory(directory)
  delete actual['manifest.json']
  assert.deepEqual(actual, manifest.files, 'Missing, extra or changed release bytes')
  assert.ok(manifest.files['web/index.html'] && manifest.files['runner.tar'])
  return manifest
}
export async function build(commit, destination) {
  assert.match(commit, /^[a-f0-9]{40}$/, 'Full immutable commit required')
  assert.equal(command('git', ['rev-parse', `${commit}^{commit}`]), commit)
  const output = resolve(destination)
  // All writes remain in an ignored, task-local output directory. Never overwrite.
  const privateRoot = resolve(root, '.local-data/d27-b')
  const rel = relative(privateRoot, output)
  assert.ok(rel && !rel.startsWith('..') && !resolve(output).endsWith('.git'), 'Use a new directory below .local-data/d27-b')
  await mkdir(privateRoot, { recursive: true })
  await mkdir(output)
  const report = { schema: 1, commit, status: 'BUILDING', files: {}, deployed: false }
  const save = () => writeFile(join(output, 'build-status.json'), JSON.stringify(report, null, 2) + '\n')
  await save()
  try {
    const source = join(output, 'source'), bundle = join(output, 'bundle')
    await mkdir(source); await mkdir(bundle)
    const archive = join(output, 'source.tar')
    command('git', ['archive', '--format=tar', `--output=${archive}`, commit, ...inputs])
    command('tar', ['-xf', archive, '-C', source])
    const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
    assert.equal(process.version, 'v' + pkg.engines.node, 'Locked Node required')
    // Prevent local shell credentials and VITE overrides entering public build bytes.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|COREPACK_HOME)$/i.test(key)))
    assert.equal(pnpm(['--version'], { cwd: source, env }), pkg.engines.pnpm)
    assert.equal(hash(await readFile(fileURLToPath(import.meta.url))), hash(await readFile(join(source, 'infra/release/client/package.mjs'))), 'Builder differs from candidate')
    const configBytes = await readFile(join(source, 'infra/release/client/config.json'))
    const config = JSON.parse(configBytes)
    const { publicConfiguration } = await import(pathToFileURL(join(source, 'infra/public/render.mjs')).href)
    const origins = { CODELESS_PLATFORM_ORIGIN: config.platformOrigin, CODELESS_PREVIEW_ORIGIN: config.previewOrigin, CODELESS_PUBLICATION_ORIGIN: config.publicOrigin }
    const gateway = await publicConfiguration(origins)
    env.VITE_CODELESS_PREVIEW_ORIGIN = config.previewOrigin
    env.CI = '1'
    await writeFile(join(output, 'install.log'), pnpm(['install', '--frozen-lockfile'], { cwd: source, env }) + '\n')
    await writeFile(join(output, 'web-build.log'), pnpm(['--filter', '@codeless/web', 'build'], { cwd: source, env }) + '\n')
    await cp(join(source, 'apps/web/dist'), join(bundle, 'web'), { recursive: true, errorOnExist: true })
    await writeFile(join(bundle, 'web/codeless-publication-config.json'), JSON.stringify({ publicOrigin: config.publicOrigin }) + '\n')
    command('git', ['archive', '--format=tar', `--output=${join(bundle, 'runner.tar')}`, commit, ...runnerInputs])
    // Actual syntax validation of every packaged runner module and import closure.
    const runnerFiles = await inventory(join(source, 'services/runner'))
    for (const name of Object.keys(runnerFiles).filter(p => p.endsWith('.mjs'))) command(process.execPath, ['--check', join(source, 'services/runner', name)])
    for (const entry of ['preview/main.mjs', 'verify/workflow.mjs', 'publish/frozen-gateway.mjs', 'screenshot/gateway.mjs']) {
      command(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(join(source, 'services/runner/src', entry)).href)})`], { env })
    }
    const ingress = join(bundle, 'ingress'); await mkdir(ingress)
    for (const name of ['edge', 'platform', 'hosting']) await writeFile(join(ingress, name + '.conf'), gateway[name])
    const manifest = { schema: 1, commit, sourceTree: command('git', ['rev-parse', `${commit}^{tree}`]),
      toolchain: { node: process.version, pnpm: pkg.engines.pnpm }, config,
      runnerFormat: 'uncompiled Node ESM source + locked template + policies + operator adapters; not a Docker image',
      sourceArchiveSha256: hash(await readFile(archive)),
      lockSha256: hash(await readFile(join(source, 'pnpm-lock.yaml'))),
      builderSha256: hash(await readFile(fileURLToPath(import.meta.url))),
      configSha256: hash(configBytes),
      files: await inventory(bundle) }
    await writeFile(join(bundle, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    await verify(bundle, commit)
    report.status = 'BUILT'; report.files = manifest.files; report.manifestSha256 = hash(await readFile(join(bundle, 'manifest.json')))
    await save()
    return { output, manifestSha256: report.manifestSha256, commit }
  } catch (error) { report.status = 'FAILED'; report.error = error.message; await save(); throw error }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, value, path] = process.argv.slice(2)
  if (mode === 'build') console.log(JSON.stringify(await build(value, path)))
  else if (mode === 'verify') { await verify(resolve(path), value); console.log('Release bytes verified') }
  else throw new Error('Expected build|verify <full-commit> <new-output-directory|bundle-directory>')
}
