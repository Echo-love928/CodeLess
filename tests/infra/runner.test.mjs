import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createTcpServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createRunnerServer, runnerListenOptions } from '../../services/runner/health.mjs';
import { toBuildContract } from '../../services/runner/build-contract.mjs';

const require = createRequire(import.meta.url);
const Ajv = require('ajv/dist/2020.js');
const addFormats = require('ajv-formats');
const ajv = new Ajv({ strict: true });
addFormats(ajv);
const schema = JSON.parse(readFileSync(new URL('../../contracts/schemas/v0/build.schema.json', import.meta.url)));
const validateBuild = ajv.compile(schema);
const fixture = JSON.parse(readFileSync(new URL('../../contracts/examples/v0/valid/build.json', import.meta.url)));

let server;
let base;
before(async () => {
  server = createRunnerServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });

test('internal health responds without exposing environment secrets', async () => {
  process.env.CODELESS_MODEL_API_KEY = 'test-secret-that-must-not-appear';
  const response = await fetch(`${base}/internal/health`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(body), { status: 'UP', service: 'codeless-runner' });
  assert.equal(body.includes('test-secret-that-must-not-appear'), false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  delete process.env.CODELESS_MODEL_API_KEY;
});

test('health is the only route and has a strict method', async () => {
  assert.equal((await fetch(`${base}/anything-else`)).status, 404);
  const response = await fetch(`${base}/internal/health`, { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});

test('runner refuses a public bind by default', () => {
  assert.deepEqual(runnerListenOptions({}), { host: '127.0.0.1', port: 8787 });
  assert.throws(() => runnerListenOptions({ RUNNER_HOST: '0.0.0.0' }), /loopback/);
  assert.throws(() => runnerListenOptions({ RUNNER_PORT: '0' }), /RUNNER_PORT/);
  assert.deepEqual(runnerListenOptions({ RUNNER_HOST: '0.0.0.0', RUNNER_CONTAINER_ONLY: '1' }), { host: '0.0.0.0', port: 8787 });
});

test('runner entrypoint starts and serves health over a loopback socket', async () => {
  const probe = createTcpServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../services/runner/main.mjs', import.meta.url))], {
    env: { ...process.env, RUNNER_HOST: '127.0.0.1', RUNNER_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('runner did not start')), 5000);
      child.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`runner exited ${code}`)); });
    });
    const response = await fetch(`http://127.0.0.1:${port}/internal/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).service, 'codeless-runner');
  } finally {
    child.kill();
  }
});

test('observed exit result maps to the shared build contract', () => {
  const baseResult = { id: fixture.id, taskId: fixture.taskId, versionId: fixture.versionId, createdAt: fixture.createdAt };
  const running = toBuildContract({ ...baseResult, exitCode: null });
  const succeeded = toBuildContract({ ...baseResult, exitCode: 0, artifactDigest: fixture.artifactDigest, completedAt: fixture.completedAt, status: 'FAILED' });
  const failed = toBuildContract({ ...baseResult, exitCode: 7, completedAt: fixture.completedAt });
  for (const result of [running, succeeded, failed]) assert.equal(validateBuild(result), true, JSON.stringify(validateBuild.errors));
  assert.equal(running.status, 'RUNNING');
  assert.equal(succeeded.status, 'SUCCEEDED');
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.exitCode, 7);
  assert.throws(() => toBuildContract({ ...baseResult, exitCode: 0, completedAt: fixture.completedAt }), /digest/);
  assert.throws(() => toBuildContract({ ...baseResult, exitCode: null, artifactDigest: fixture.artifactDigest }), /unfinished/);
});
