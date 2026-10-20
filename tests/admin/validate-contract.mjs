// Runs the D17-A contract tests, then lints a private combination of the shared OpenAPI and the admin fragment.
// The shared contracts/openapi.v0.json is not modified; registering the fragment is the maintainer's step.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { redoclyEnvironment } from '../../scripts/cli-environment.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url)), target = join(repo, '.local-data/d17-a/combined-contracts')
await rm(target, { recursive: true, force: true }); await mkdir(target, { recursive: true })
await cp(join(repo, 'contracts'), target, { recursive: true })
const doc = JSON.parse(await readFile(join(target, 'openapi.v0.json'), 'utf8'))
const patch = JSON.parse(await readFile(join(target, 'admin/openapi.patch.json'), 'utf8'))
for (const path of Object.keys(patch.paths)) if (doc.paths[path]) throw new Error(`shared OpenAPI already defines ${path}`)
Object.assign(doc.paths, patch.paths)
doc.tags = [...(doc.tags ?? []), ...patch.tags]
await writeFile(join(target, 'openapi.v0.json'), JSON.stringify(doc, null, 2) + '\n')
const windows = process.platform === 'win32'
for (const [command, args, env] of [
  [process.execPath, ['--test', 'tests/admin/contracts.test.mjs'], process.env],
  [windows ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack',
    windows ? ['/d', '/c', 'corepack', 'pnpm', 'exec', 'redocly', 'lint', join(target, 'openapi.v0.json')]
      : ['pnpm', 'exec', 'redocly', 'lint', join(target, 'openapi.v0.json')], redoclyEnvironment()],
]) {
  const result = spawnSync(command, args, { cwd: repo, env, stdio: 'inherit' })
  if (result.error || result.status !== 0) process.exit(result.status ?? 1)
}
console.log('D17-A admin schemas, evidence and private combined OpenAPI passed; shared registration pending')
