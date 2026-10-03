import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Scoped test setup for the existing API gate, whose CI job has Java/Node/Docker but
// no pnpm dependencies, browser or trusted image yet. Only frozen repository inputs.
const root = fileURLToPath(new URL('../../', import.meta.url))
if (process.version !== 'v24.16.0') throw new Error('D01 Node version required')
function run(command, args) {
  const windows = process.platform === 'win32'
  const cmd = windows && command === 'corepack' ? (process.env.ComSpec ?? 'cmd.exe') : command
  const argv = windows && command === 'corepack' ? ['/d', '/c', 'corepack', ...args] : args
  const result = spawnSync(cmd, argv, { cwd: root, stdio: 'inherit', windowsHide: true, timeout: 240000 })
  if (result.error || result.status !== 0) throw new Error('agent test prerequisite failed: ' + command + ' / ' + (result.status ?? 'unknown'))
}
if (!existsSync(new URL('../../node_modules/@playwright/test/package.json', import.meta.url))) {
  run('corepack', ['pnpm', 'install', '--frozen-lockfile'])
}
const { chromium } = await import('@playwright/test')
if (!existsSync(chromium.executablePath())) {
  run('corepack', ['pnpm', 'exec', 'playwright', 'install', ...(process.platform === 'linux' ? ['--with-deps'] : []), 'chromium'])
}
run('docker', ['build', '--file', 'infra/build-image/Dockerfile', '--tag', 'codeless-vue-build:d05', '.'])
