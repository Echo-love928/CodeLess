// Private subprocess fixture: observe real IPC, cancel before the production permission handler.
// No hooks or transport controls are exposed by the production job JSON.
import cp from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const worker = fileURLToPath(new URL('../../../../services/runner/src/screenshot/worker.mjs', import.meta.url))
const capture = new URL('../../../../services/runner/src/screenshot/capture.mjs', import.meta.url)
const noEgress = new URL('./no-egress-transport.mjs', import.meta.url).href
const mutant = process.argv[2] === '--ignore-stop-mutant'
assert.ok(process.argv.length === 2 || mutant)
const controller = new AbortController(), events = [], browserPids = []
let requests = 0, permissions = 0, ownedWorkerPid, ownedWorkerClosed = false, workerExit
const originalSpawn = cp.spawn
cp.spawn = function (...args) {
  const owned = args[0] === process.execPath && Array.isArray(args[1]) && args[1][0] === worker
  const call = [...args]
  // Explicit no-egress fixture only; the actual worker, IPC and native termination remain real.
  if (owned) call[1] = ['--import', noEgress, ...args[1]]
  const child = Reflect.apply(originalSpawn, this, call)
  if (!owned) return child
  ownedWorkerPid = child.pid
  const send = child.send
  child.send = function (...values) {
    if (values[0]?.phase === 'BROWSER_LAUNCH_ALLOWED') { permissions++; events.push('PERMISSION_SENT') }
    return Reflect.apply(send, this, values)
  }
  child.prependListener('message', message => {
    if (message?.phase === 'BROWSER_STARTING') {
      requests++; events.push('REQUEST_RECEIVED'); controller.abort(); events.push('ABORT_RETURNED')
    }
    if (Number.isSafeInteger(message?.browserPid)) browserPids.push(message.browserPid)
  })
  child.once('close', (code, signal) => { ownedWorkerClosed = true; workerExit = { code, signal }; events.push('OWNED_WORKER_CLOSED') })
  return child
}
syncBuiltinESMExports()
try {
  let module = capture.href
  if (mutant) {
    // Test sensitivity only: same source/worker, with exactly the stopped guard removed.
    const source = readFileSync(capture, 'utf8'), guard = ' && !stopped && child.connected'
    assert.equal(source.split(guard).length, 2)
    const changed = source.replace(guard, ' && child.connected').replaceAll('import.meta.url', JSON.stringify(capture.href))
    module = 'data:text/javascript;base64,' + Buffer.from(changed).toString('base64')
  }
  const { captureDeployment } = await import(module)
  const result = await captureDeployment({ deploymentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',applicationId:'11111111-1111-4111-8111-111111111111',
    versionId:'55555555-5555-4555-8555-555555555555',sourceDigest:'sha256:'+'1'.repeat(64),artifactDigest:'sha256:'+'2'.repeat(64),
    url:'https://daaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.sites.codeless-public.test/',address:'8.8.8.8',
    files:[{path:'index.html',bytes:0,digest:'sha256:'+'3'.repeat(64)},{path:'assets/app.js',bytes:0,digest:'sha256:'+'4'.repeat(64)}]
  }, { signal:controller.signal, timeoutMs:6000 })
  const report = { fixture:'REAL_IPC_CANCEL_BEFORE_PERMISSION', testSensitivityMutation:mutant, requests, permissions,
    browserPidCount:browserPids.length, ownedWorkerObserved:Number.isSafeInteger(ownedWorkerPid), ownedWorkerClosed, workerExit,
    aborted:controller.signal.aborted, events,
    result:{status:result.status,failure:result.failure,cleanupConfirmed:result.cleanupConfirmed,launchPermitGranted:result.launchPermitGranted,
      cleanupProof:result.cleanupProof ? { confirmed:result.cleanupProof.confirmed, code:result.cleanupProof.code, timeout:result.cleanupProof.timeout } : null} }
  console.log(JSON.stringify(report))
  assert.equal(requests,1); assert.equal(controller.signal.aborted,true)
  assert.equal(report.ownedWorkerObserved,true); assert.equal(ownedWorkerClosed,true)
  assert.equal(result.status,'FAILED'); assert.equal(result.failure,'CAPTURE_TIMEOUT')
  assert.equal(permissions,0,'Permission must not be sent after the request listener cancels')
  assert.equal(browserPids.length,0); assert.equal(result.launchPermitGranted,false)
  assert.equal(result.cleanupConfirmed,true)
} finally {
  cp.spawn = originalSpawn; syncBuiltinESMExports()
}
