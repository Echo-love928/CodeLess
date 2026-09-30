import { cp, mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative } from 'node:path'

const template = '/opt/codeless/template'
const input = '/input'
const work = '/tmp/codeless-build'
const output = '/output'
const allowed = /^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/

async function visit(dir) {
  const result = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name)
    if (entry.isDirectory()) result.push(...await visit(absolute))
    else if (entry.isFile()) result.push(absolute)
    else throw new Error(`unsupported input type: ${entry.name}`)
  }
  return result
}

try {
  const files = await visit(input)
  if (files.length === 0 || files.length > 40) throw new Error('expected 1 to 40 source files')
  for (const file of files) {
    const name = relative(input, file).replaceAll('\\', '/')
    if (!allowed.test(name)) throw new Error(`unapproved source path: ${name}`)
  }
  await cp(template, work, { recursive: true, filter: (name) => !name.endsWith('/node_modules') })
  await symlink(join(template, 'node_modules'), join(work, 'node_modules'), 'dir')
  for (const file of files) {
    const destination = join(work, relative(input, file))
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, await readFile(file))
  }
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: work,
    stdio: 'inherit',
    env: { PATH: process.env.PATH, HOME: '/tmp', CI: '1', NODE_ENV: 'production' }
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  await cp(join(work, 'dist'), output, { recursive: true, force: true })
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
