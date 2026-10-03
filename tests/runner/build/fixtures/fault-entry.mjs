// Trusted test-only entry point. Never installed into the production image.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { connect } from 'node:net'

const mode = readdirSync('/input/src/data')[0].replace('.ts', '')
if (mode === 'Timeout') {
  spawn('node', ['-e', 'while(true) {}'], { stdio: 'inherit' })
  console.log('loop child started')
  while (true) { /* trusted infinite-loop fault */ }
} else if (mode === 'Memory') {
  const held = []
  while (true) held.push(Buffer.alloc(8 * 1024 * 1024, 1))
} else if (mode === 'Logs') {
  process.stdout.write('x'.repeat(200000))
  process.stderr.write('y'.repeat(200000))
  process.exitCode = 7
} else if (mode === 'Exit') {
  console.error('intentional compiler-like failure')
  process.exitCode = 2
} else if (mode === 'Isolation') {
  assert.notEqual(process.getuid(), 0)
  assert.notEqual(process.getgid(), 0)
  assert.equal(readFileSync('/sys/fs/cgroup/pids.max', 'utf8').trim(), '128')
  assert.equal(readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim(), String(512 * 1024 * 1024))
  assert.equal(readFileSync('/sys/fs/cgroup/memory.swap.max', 'utf8').trim(), '0')
  const [quota, period] = readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim().split(' ').map(Number)
  assert.equal(quota / period, 1)
  assert.match(readFileSync('/proc/self/status', 'utf8'), /CapEff:\s+0000000000000000/)
  assert.match(readFileSync('/proc/self/status', 'utf8'), /NoNewPrivs:\s+1/)
  for (const path of ['/var/run/docker.sock', '/run/secrets/codeless', '/platform-secret']) assert.equal(existsSync(path), false, path)
  assert.equal(process.env.CODELESS_MODEL_API_KEY, undefined)
  assert.equal(process.env.DATABASE_URL, undefined)
  assert.throws(() => writeFileSync('/opt/codeless/write-probe', 'blocked'), /EROFS|EACCES/)
  assert.throws(() => writeFileSync('/input/src/data/Isolation.ts', 'blocked'), /EROFS|EACCES/)
  for (const host of ['1.1.1.1', '172.17.0.1']) {
    await new Promise((resolve, reject) => {
      const socket = connect({ host, port: 443 })
      socket.setTimeout(2000, () => { socket.destroy(); reject(new Error('network probe timed out rather than explicitly denied')) })
      socket.on('connect', () => { socket.destroy(); reject(new Error('network unexpectedly reachable')) })
      socket.on('error', (error) => {
        assert.match(error.code, /ENETUNREACH|EHOSTUNREACH|EACCES/)
        resolve()
      })
    })
  }
  console.log('non-root, read-only, network and sensitive access denied')
  writeFileSync('/output/index.html', '<script src="/app.js"></script>')
  writeFileSync('/output/app.js', 'console.log("isolated")')
} else if (mode === 'Symlink') {
  symlinkSync('/etc/passwd', '/output/index.html')
  writeFileSync('/output/app.js', 'bad artifact')
} else if (mode === 'Empty') {
  console.log('exit zero without production artifacts')
} else {
  throw new Error('unknown trusted fault fixture')
}
