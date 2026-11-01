import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const worker = fileURLToPath(new URL('../../../services/runner/src/screenshot/worker.mjs', import.meta.url))
async function runWorker(grantPermit) {
  const env = {}
  for (const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE','LOCALAPPDATA','PLAYWRIGHT_BROWSERS_PATH'])
    if (process.env[key] !== undefined) env[key] = process.env[key]
  const noEgress = new URL('./followup/no-egress-transport.mjs', import.meta.url).href
  const child = spawn(process.execPath, ['--import', noEgress, worker], { env, windowsHide: true, stdio: ['pipe','pipe','pipe','ipc'] })
  const messages = []; let output = '', stderr = ''
  child.on('message', m => {
    messages.push(m)
    if (grantPermit && m.phase === 'BROWSER_STARTING') child.send({ phase: 'BROWSER_LAUNCH_ALLOWED' })
  })
  child.stdout.on('data', b => { output += b }); child.stderr.on('data', b => { stderr = (stderr + b).slice(-2000) })
  child.stdin.on('error', () => {})
  child.stdin.end(JSON.stringify({ deploymentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',applicationId:'11111111-1111-4111-8111-111111111111',
    versionId:'55555555-5555-4555-8555-555555555555',sourceDigest:'sha256:'+'1'.repeat(64),artifactDigest:'sha256:'+'2'.repeat(64),
    url:'https://daaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.sites.codeless-public.test/',address:'8.8.8.8',
    files:[{path:'index.html',bytes:0,digest:'sha256:'+'3'.repeat(64)},{path:'assets/app.js',bytes:0,digest:'sha256:'+'4'.repeat(64)}],deadline:Date.now()+(grantPermit?8000:1200) }))
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error('Owned worker exceeded diagnostic bound')) }, 12000)
    child.once('error', e => { clearTimeout(timer); reject(e) })
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({code,signal}) })
  })
  return { messages, result, stderr, report: JSON.parse(output) }
}

test('real screenshot worker cannot fork Chromium before the parent grants launch permission', { timeout: 15000 }, async () => {
  const { messages, result, stderr, report } = await runWorker(false)
  assert.equal(messages.some(m => m.phase === 'BROWSER_STARTING'), true, JSON.stringify({messages,result,stderr}))
  assert.equal(messages.some(m => Number.isSafeInteger(m.browserPid)), false,
    'Chromium PID appeared without a parent permit: '+JSON.stringify({messages,result,stderr}))
  assert.equal(report.status, 'FAILED'); assert.equal(report.browserClosed, true)
  assert.equal(report.failure, 'CAPTURE_TIMEOUT'); assert.equal(result.code, 1); assert.equal(result.signal, null)
})

test('parent permit allows real Chromium launch and transport failure still closes the browser', { timeout: 15000 }, async () => {
  const { messages, result, stderr, report } = await runWorker(true)
  const barrier = messages.findIndex(m => m.phase === 'BROWSER_STARTING')
  const browser = messages.findIndex(m => Number.isSafeInteger(m.browserPid))
  assert.ok(barrier >= 0 && browser > barrier, JSON.stringify({ messages, result, stderr }))
  assert.equal(report.status, 'FAILED') // Explicit no-egress transport fails; never report it as a successful capture.
  assert.equal(report.browserClosed, true)
  assert.equal(result.code, 1); assert.equal(result.signal, null)
})
