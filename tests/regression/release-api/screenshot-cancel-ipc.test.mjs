import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const fixture = fileURLToPath(new URL('./followup/cancel-at-launch-request.mjs', import.meta.url))
function execute(args = []) {
  const env = { ...process.env }
  delete env.NODE_OPTIONS; delete env.D26_PROCESS_OBSERVER
  const r = spawnSync(process.execPath,[fixture,...args],{env,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:20000})
  assert.equal(r.error,undefined); assert.equal(r.signal,null)
  const report = JSON.parse(r.stdout.trim())
  console.log(JSON.stringify({ fixtureNativeExitCode:r.status, ...report }))
  return { nativeExitCode:r.status, report, stderr:r.stderr }
}

test('real parent cancels on the actual worker request before its permission handler runs', { timeout:20000 }, () => {
  const r = execute()
  assert.equal(r.nativeExitCode,0,r.stderr)
  assert.deepEqual(r.report.events,['REQUEST_RECEIVED','ABORT_RETURNED','OWNED_WORKER_CLOSED'])
  assert.equal(r.report.permissions,0); assert.equal(r.report.browserPidCount,0)
  assert.equal(r.report.result.status,'FAILED'); assert.equal(r.report.result.launchPermitGranted,false)
})

test('the real IPC regression rejects a private mutant that grants permission after cancellation', { timeout:20000 }, () => {
  const r = execute(['--ignore-stop-mutant'])
  assert.equal(r.nativeExitCode,1,'The missing stopped guard must fail the same assertion')
  assert.match(r.stderr,/Permission must not be sent after the request listener cancels/)
  assert.equal(r.report.requests,1); assert.equal(r.report.permissions,1)
  assert.equal(r.report.ownedWorkerClosed,true); assert.equal(r.report.result.launchPermitGranted,true)
  assert.equal(r.report.result.status,'FAILED')
})
