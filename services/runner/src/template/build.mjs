import { spawnSync } from 'node:child_process'
import { lstat, mkdir, readdir, readFile, realpath } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const IMAGE = 'codeless-vue-build:d05'

export function containerUser(uid = process.getuid?.(), gid = process.getgid?.()) {
  if (uid === undefined && gid === undefined) return '1000:1000'
  if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(gid) || uid <= 0 || gid <= 0) {
    throw new Error('template build worker must run as a non-root host user')
  }
  return `${uid}:${gid}`
}

const allowed = /^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/

async function filesUnder(root, current = root) {
  const result = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const file = resolve(current, entry.name)
    const stat = await lstat(file)
    if (stat.isDirectory()) result.push(...await filesUnder(root, file))
    else if (stat.isFile()) result.push(file)
    else throw new Error(`unsupported source type: ${entry.name}`)
  }
  return result
}

export async function validateSource(source) {
  const root = await realpath(source)
  const files = await filesUnder(root)
  if (files.length < 1 || files.length > 40) throw new Error('expected 1 to 40 source files')
  let total = 0
  for (const file of files) {
    const name = relative(root, file).split(sep).join('/')
    if (!allowed.test(name)) throw new Error(`unapproved source path: ${name}`)
    const content = await readFile(file)
    if (content.length > 128 * 1024) throw new Error(`source file too large: ${name}`)
    total += content.length
  }
  if (total > 512 * 1024) throw new Error('source bundle too large')
  return root
}

export async function build(source, output) {
  const user = containerUser()
  const input = await validateSource(source)
  const target = resolve(output)
  if (target === input || target.startsWith(`${input}${sep}`)) throw new Error('output must be outside input')
  await mkdir(target, { recursive: true })
  if ((await lstat(target)).isSymbolicLink() || (await readdir(target)).length !== 0) {
    throw new Error('output must be a new empty directory')
  }
  const outputRoot = await realpath(target)
  const args = [
    'run', '--rm', '--pull', 'never', '--network', 'none', '--read-only', '--user', user, '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--pids-limit', '128', '--memory', '512m', '--cpus', '1',
    '--tmpfs', '/tmp:rw,nosuid,size=256m',
    '--mount', `type=bind,src=${input},dst=/input,readonly`,
    '--mount', `type=bind,src=${outputRoot},dst=/output`,
    IMAGE
  ]
  const result = spawnSync('docker', args, { stdio: 'inherit', env: process.env, timeout: 120000 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Docker build exited ${result.status ?? 'unknown'}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) {
    console.error('Usage: node build.mjs <source-dir> <output-dir>')
    process.exitCode = 2
  } else {
    build(process.argv[2], process.argv[3]).catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
  }
}
