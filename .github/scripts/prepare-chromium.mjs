import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const ubuntuSourceFiles = Object.freeze([
  '/etc/apt/sources.list', '/etc/apt/sources.list.d/ubuntu.sources',
  '/etc/apt/apt-mirrors.txt',
])

// GitHub's Ubuntu image may select the Azure mirror. Keep the Ubuntu archive,
// suites, components and signature policy; only change the observed slow host.
export function officialUbuntuSources(text) {
  return text.replace(/https?:\/\/azure\.archive\.ubuntu\.com\/ubuntu(?=\/?(?:\s|$))/g,
    url => url.replace('azure.archive.ubuntu.com', 'archive.ubuntu.com'))
}

export function checkedCommand(command, args, options = {}, spawn = spawnSync) {
  const result = spawn(command, args, { stdio: 'inherit', timeout: 120000, ...options })
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`${command} prerequisite failed: exit=${result.status ?? 'UNKNOWN'}, signal=${result.signal ?? 'none'}, error=${result.error?.code ?? 'none'}`)
  }
}

async function prepare() {
  if (process.platform !== 'linux' || process.version !== 'v24.16.0') throw new Error('Locked Linux/Node CI environment required')
  for (const path of ubuntuSourceFiles) {
    let original
    try { original = await readFile(path, 'utf8') }
    catch (error) { if (error.code === 'ENOENT') continue; throw error }
    const updated = officialUbuntuSources(original)
    if (updated !== original) {
      checkedCommand('sudo', ['tee', path], { input: updated, stdio: ['pipe', 'ignore', 'inherit'] })
      console.log(`Ubuntu archive mirror configured: ${path}`)
    }
  }
  // Separately bounded prerequisites. No test retries or automatic fallback.
  checkedCommand('corepack', ['pnpm', 'exec', 'playwright', 'install-deps', 'chromium'])
  checkedCommand('corepack', ['pnpm', 'exec', 'playwright', 'install', 'chromium'])
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ headless: true, timeout: 30000 })
  try { console.log(`Locked Chromium ready: ${browser.version()}`) }
  finally { await browser.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepare()
}
