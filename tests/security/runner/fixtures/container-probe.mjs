// Trusted test-only probe. Never installed in the production runner image.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { spawn } from 'node:child_process'
const mode = readFileSync('/input/src/data/Mode.ts', 'utf8')
if (mode.includes('timeout')) {
  spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'inherit' })
  console.log('D19_CHILD_RUNNING')
  setInterval(() => {}, 1000)
} else {
  assert.notEqual(process.getuid(), 0)
  const denied = []
  for (const host of ['1.1.1.1', '10.0.0.1', '172.17.0.1', '192.168.1.1', '169.254.169.254', '100.100.100.200']) {
    await new Promise((done, reject) => {
      const socket = connect({ host, port: 443 })
      socket.setTimeout(1000, () => { socket.destroy(); reject(new Error('timeout is not proof of denial')) })
      socket.once('connect', () => { socket.destroy(); reject(new Error('unexpected network access')) })
      socket.once('error', error => { try { assert.match(error.code, /^(ENETUNREACH|EHOSTUNREACH|EACCES)$/); denied.push({ host, code: error.code }); done() } catch (error) { reject(error) } })
    })
  }
  for (const path of ['/platform', '/host', '/root/.ssh', '/root/.aws', '/var/run/docker.sock', '/run/secrets/codeless'])
    assert.equal(existsSync(path), false, path)
  for (const key of ['CODELESS_MODEL_API_KEY', 'DATABASE_URL', 'AWS_SECRET_ACCESS_KEY']) assert.equal(process.env[key], undefined)
  assert.throws(() => writeFileSync('/input/src/data/Mode.ts', 'evil'), /EROFS|EACCES/)
  assert.throws(() => writeFileSync('/opt/evil', 'evil'), /EROFS|EACCES/)
  console.log('D19_ISOLATION ' + JSON.stringify({ denied, secretsAbsent: true, readOnly: true }))
  writeFileSync('/output/index.html', '<script src="/assets/app.js"></script>')
  // Artifact inspection only, never evaluate this fixture as user code on the host.
  writeFileSync('/output/app.js', 'console.log("isolated")')
}
