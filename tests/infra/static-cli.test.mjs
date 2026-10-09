import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { redoclyEnvironment } from '../../scripts/cli-environment.mjs'

// Actual locked CLI; all attempted HTTP goes to a synthetic loopback redirect.
// No original request headers/body or project metadata are sent anywhere.
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'codeless-cli-exit-'))
  const hits = []
  const server = createServer((_request, response) => {
    hits.push('loopback'); response.writeHead(302, { Location: '/', connection: 'close' }); response.end()
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const preload = join(directory, 'local-fetch.cjs'), trace = join(directory, 'trace.jsonl')
  await writeFile(preload, `const fs=require('node:fs');const nativeFetch=globalThis.fetch;
globalThis.fetch=async()=>{fs.appendFileSync(process.env.CODELESS_CLI_TEST_TRACE,'fetch\\n');return nativeFetch(process.env.CODELESS_CLI_TEST_ORIGIN)};`)
  const parent = { ...process.env, REDOCLY_SUPPRESS_UPDATE_NOTICE: 'true',
    CODELESS_CLI_TEST_TRACE: trace, CODELESS_CLI_TEST_ORIGIN: 'http://127.0.0.1:' + server.address().port }
  delete parent.REDOCLY_TELEMETRY
  for (const name of ['CODELESS_MODEL_API_KEY', 'CODELESS_MODEL_NAME', 'CODELESS_M1_REAL_APPROVED']) delete parent[name]
  const execute = async (env, specification = 'contracts/openapi.v0.json') => {
    const child = spawn(process.execPath, ['--require', preload, resolve('node_modules/@redocly/cli/bin/cli.js'), 'lint', specification],
      { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', bytes => { stdout = (stdout + bytes).slice(-32768) })
    child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-32768) })
    const timer = setTimeout(() => child.kill(), 15000)
    try { return await new Promise((done, reject) => {
      child.once('error', reject); child.once('close', (code, signal) => done({ code, signal, stdout, stderr }))
    }) } finally { clearTimeout(timer) }
  }
  try { await run({ execute, directory, trace, parent, hits }) }
  finally { server.closeAllConnections(); await new Promise(done => server.close(done)); await rm(directory, { recursive: true, force: true }) }
}

test('locked Redocly default probe reaches the known Windows forced-exit failure path', { timeout: 20000 }, async () => {
  await fixture(async ({ execute, parent, hits }) => {
    const result = await execute(parent)
    assert.ok(hits.length > 0, 'the actual CLI performed its optional probe')
    assert.match(result.stdout + result.stderr, /API description is valid/)
    if (process.platform === 'win32') {
      assert.equal(result.code, 3221226505); assert.match(result.stderr, /UV_HANDLE_CLOSING/)
    } else { assert.equal(result.code, 0, result.stderr) }
  })
})

test('gate environment validates the actual contract with zero optional HTTP attempts', { timeout: 20000 }, async () => {
  await fixture(async ({ execute, trace, parent, hits }) => {
    parent.REDOCLY_TELEMETRY = 'on'; parent.REDOCLY_SUPPRESS_UPDATE_NOTICE = 'false'
    const result = await execute(redoclyEnvironment(parent))
    assert.equal(result.code, 0, result.stderr); assert.equal(result.signal, null)
    assert.match(result.stdout + result.stderr, /API description is valid/)
    assert.deepEqual(hits, []); await assert.rejects(readFile(trace), { code: 'ENOENT' })
  })
})

test('offline CLI still rejects a genuinely invalid specification with exit 1', { timeout: 20000 }, async () => {
  await fixture(async ({ execute, directory, trace, parent, hits }) => {
    const specification = join(directory, 'invalid.json')
    await writeFile(specification, '{"openapi":"3.0.3","info":{"title":"invalid"},"paths":{}}')
    const result = await execute(redoclyEnvironment(parent), specification)
    assert.equal(result.code, 1, result.stderr); assert.equal(result.signal, null)
    assert.match(result.stdout + result.stderr, /error|invalid/i)
    assert.deepEqual(hits, []); await assert.rejects(readFile(trace), { code: 'ENOENT' })
  })
})
test('actual static gate scopes offline settings to Redocly and preserves other child environments', { timeout: 20000 }, async () => {
  await fixture(async ({ execute, directory, trace, parent, hits }) => {
    parent.REDOCLY_TELEMETRY = 'on'; parent.REDOCLY_SUPPRESS_UPDATE_NOTICE = 'false'
    const shim = join(directory, 'static-child.cjs')
    await writeFile(shim, `const cp=require('node:child_process'),fs=require('node:fs');const real=cp.spawnSync;
cp.spawnSync=(command,args,options)=>{if(args.includes('redocly'))return real(process.execPath,['--require',${JSON.stringify(join(directory, 'local-fetch.cjs'))},${JSON.stringify(resolve('node_modules/@redocly/cli/bin/cli.js'))},'lint','contracts/openapi.v0.json'],options);if(options.env!==undefined)throw Error('unrelated child environment changed');return {status:0}};require('node:module').syncBuiltinESMExports();`)
    const child = spawn(process.execPath, ['--require', shim, 'scripts/run-static.mjs'],
      { env: parent, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''; child.stdout.on('data', b => { output = (output + b).slice(-32768) }); child.stderr.on('data', b => { output = (output + b).slice(-32768) })
    const timer = setTimeout(() => child.kill(), 15000)
    try { const code = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done) }); assert.equal(code, 0, output) }
    finally { clearTimeout(timer) }
    assert.match(output, /API description is valid/); assert.deepEqual(hits, [])
    await assert.rejects(readFile(trace), { code: 'ENOENT' })
  })
})
