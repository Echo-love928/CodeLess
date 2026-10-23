import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs'
import { resolve, join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../../../', import.meta.url))
export const windows = process.platform === 'win32'
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 240000, ...options })
  if (result.error || result.status !== 0 || result.signal) throw new Error(`${command} ${args.join(' ')}: exit=${result.status} signal=${result.signal}\n${result.stdout ?? ''}${result.stderr ?? ''}`, { cause: result.error })
  return (result.stdout ?? '').trim()
}
export function javaHome() {
  const candidates = [process.env.JAVA_HOME, windows ? 'C:/Program Files/Java/jdk-21.0.12.1' : '/usr/lib/jvm/temurin-21-jdk-amd64',
    process.env.JAVA_HOME_21_X64].filter(Boolean)
  for (const home of candidates) {
    const java = join(home, 'bin', windows ? 'java.exe' : 'java')
    if (!existsSync(java)) continue
    const version = spawnSync(java, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
    if (version.status === 0 && /version "21\./.test(version.stderr + version.stdout)) return resolve(home)
  }
  throw new Error('Locked Java 21 required; set JAVA_HOME')
}
export function environment() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (/^CODELESS_|^VITE_|^SPRING_|^JAVA_TOOL_OPTIONS$|^JDK_JAVA_OPTIONS$/.test(key)) delete env[key]
  const previousPath = env.PATH ?? env.Path ?? ''
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key]
  env.JAVA_HOME = javaHome()
  // Desktop's fallback pnpm can shadow Corepack inside nested package scripts.
  // Task-local shim keeps every nested pnpm on packageManager=pnpm@12.6.0.
  const bin = join(root, '.local-data/d20-b/bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, windows ? 'pnpm.cmd' : 'pnpm'), windows
    ? '@echo off\r\ncall corepack pnpm %*\r\nexit /b %ERRORLEVEL%\r\n'
    : '#!/bin/sh\nexec corepack pnpm "$@"\n', { mode: 0o755 })
  env.PATH = [bin, join(env.JAVA_HOME, 'bin'), ...(windows ? ['C:/Program Files/Git/cmd'] : []), resolve(process.execPath, '..'), previousPath].join(delimiter)
  return env
}
export function maven(args, env) {
  return windows ? run(process.env.ComSpec, ['/d', '/c', 'services\\api\\mvnw.cmd', '-f', 'services/api/pom.xml', ...args], { env })
    : run('./services/api/mvnw', ['-f', 'services/api/pom.xml', ...args], { env })
}
export function start(command, args, env, log) {
  mkdirSync(resolve(log, '..'), { recursive: true })
  const fd = openSync(log, 'wx')
  const child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd] })
  closeSync(fd)
  child.on('error', error => { child.launchError = error })
  return child
}
export async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const closed = new Promise(done => child.once('close', done))
  if (windows) run('taskkill', ['/PID', String(child.pid), '/T', '/F'], { timeout: 15000 })
  else child.kill('SIGTERM')
  await Promise.race([closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Owned process cleanup timeout')), 15000); timer.unref() })])
}
