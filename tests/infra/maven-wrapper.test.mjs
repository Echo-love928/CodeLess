import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { crc32 } from 'node:zlib'
import { test } from 'node:test'

// A real ZIP containing a harmless Maven stand-in. curl, SHA-512 and unzip are
// the actual host programs; only the distribution URL/hash in a temporary copy
// of the wrapper point at this loopback fixture. Production pins stay intact.
function distribution() {
  const name = Buffer.from('apache-maven-3.9.11/bin/mvn')
  const bytes = Buffer.from('#!/bin/sh\nprintf "fixture-maven:%s\\n" "$*"\nexit "${FIXTURE_MAVEN_EXIT:-0}"\n')
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22)
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4)
  local.writeUInt32LE(crc32(bytes), 14); local.writeUInt32LE(bytes.length, 18)
  local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26)
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6)
  central.writeUInt32LE(crc32(bytes), 16); central.writeUInt32LE(bytes.length, 20)
  central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28)
  central.writeUInt32LE((0o100755 << 16) >>> 0, 38)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + name.length, 12)
  end.writeUInt32LE(local.length + name.length + bytes.length, 16)
  return Buffer.concat([local, name, bytes, central, name, end])
}

const shell = process.platform === 'win32'
  ? resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8', windowsHide: true }).trim(), '../../../bin/sh.exe')
  : '/bin/sh'

async function fixture(responseFor, run) {
  const directory = await mkdtemp(join(tmpdir(), 'codeless-maven-test-'))
  const archive = distribution(), requests = []
  const server = createServer((request, response) => {
    requests.push(request.url)
    const status = responseFor(requests.length)
    response.writeHead(status, { 'content-type': 'application/zip', connection: 'close' })
    response.end(status === 200 ? archive : 'fixture HTTP failure')
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const source = await readFile('services/api/mvnw', 'utf8')
  const hash = createHash('sha512').update(archive).digest('hex')
  const wrapper = join(directory, 'mvnw')
  const cache = join(directory, 'cache')
  const prepare = async (expected = hash) => writeFile(wrapper, source
    .replace(/^MAVEN_DIST=.*$/m, `MAVEN_DIST='http://127.0.0.1:${server.address().port}/maven.zip'`)
    .replace(/^MAVEN_SHA512=.*$/m, `MAVEN_SHA512='${expected}'`))
  const execute = async (exit = '0') => {
    const child = spawn(shell, [wrapper.replaceAll('\\', '/'), '-f', 'fixture.xml', 'verify'], {
      windowsHide: true, env: { ...process.env, MAVEN_USER_HOME: cache.replaceAll('\\', '/'),
        TMPDIR: directory.replaceAll('\\', '/'), FIXTURE_MAVEN_EXIT: exit }, stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    child.stdout.on('data', bytes => { output += bytes }); child.stderr.on('data', bytes => { output += bytes })
    const timer = setTimeout(() => child.kill(), 20000)
    try { return await new Promise((done, reject) => {
      child.once('error', reject); child.once('close', (code, signal) => done({ code, signal, output }))
    }) } finally { clearTimeout(timer) }
  }
  try { await prepare(); await run({ prepare, execute, requests, cache }) }
  finally { server.closeAllConnections(); await new Promise(done => server.close(done)); await rm(directory, { recursive: true, force: true }) }
}

test('Maven bootstrap recovers from HTTP 429 and reuses the verified distribution', { timeout: 25000 }, async () => {
  await fixture(attempt => attempt === 1 ? 429 : 200, async ({ execute, requests }) => {
    const result = await execute()
    assert.equal(result.code, 0, result.output); assert.equal(result.signal, null)
    assert.equal(requests.length, 2); assert.match(result.output, /fixture-maven:-f fixture.xml verify/)
    const cached = await execute()
    assert.equal(cached.code, 0, cached.output); assert.equal(requests.length, 2)
  })
})

test('persistent Maven HTTP 429 exhausts four attempts and remains a failure', { timeout: 25000 }, async () => {
  await fixture(() => 429, async ({ execute, requests, cache }) => {
    const result = await execute()
    assert.equal(result.code, 22, result.output); assert.equal(requests.length, 4)
    assert.doesNotMatch(result.output, /fixture-maven:/); await assert.rejects(access(cache), { code: 'ENOENT' })
  })
})

test('Maven HTTP 404 fails immediately without installing or running Maven', { timeout: 25000 }, async () => {
  await fixture(() => 404, async ({ execute, requests, cache }) => {
    const result = await execute()
    assert.equal(result.code, 22, result.output); assert.equal(requests.length, 1)
    assert.doesNotMatch(result.output, /fixture-maven:/); await assert.rejects(access(cache), { code: 'ENOENT' })
  })
})

test('Maven download retries preserve checksum enforcement', { timeout: 25000 }, async () => {
  await fixture(attempt => attempt === 1 ? 429 : 200, async ({ prepare, execute, requests, cache }) => {
    await prepare('0'.repeat(128))
    const result = await execute()
    assert.equal(result.code, 1, result.output); assert.equal(requests.length, 2)
    assert.match(result.output, /Maven distribution checksum mismatch/)
    assert.doesNotMatch(result.output, /fixture-maven:/); await assert.rejects(access(cache), { code: 'ENOENT' })
  })
})

test('Maven execution failures propagate without redownloading or retrying tests', { timeout: 25000 }, async () => {
  await fixture(() => 200, async ({ execute, requests }) => {
    const result = await execute('7')
    assert.equal(result.code, 7, result.output); assert.equal(requests.length, 1)
    assert.equal(result.output.match(/fixture-maven:/g)?.length, 1)
  })
})
