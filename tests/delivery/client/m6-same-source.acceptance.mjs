// Final-candidate delta only. Full UI/ingress/revocation evidence remains separately reusable.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startPreviewRuntime } from '../../../services/runner/src/preview/main.mjs';
import { readSnapshot, digest } from '../../../services/runner/src/artifacts/snapshot.mjs';
import { tlsServer, closeServer } from '../../e2e/preview/fixtures.mjs';

assert.equal(process.env.CODELESS_PREVIEW_ACCEPTANCE_MODEL, 'deterministic-mock');
const evidence = resolve(process.env.CODELESS_PREVIEW_EVIDENCE_DIR);
await mkdir(evidence, { recursive: true });
const api = new URL(process.env.CODELESS_PREVIEW_API_INTERNAL_ORIGIN);
assert.equal(api.hostname, '127.0.0.1');
const cookies = new Map();
async function request(path, method = 'GET', body, token) {
  const response = await fetch(new URL('/api/v0/' + path, api), {
    method, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { Cookie: [...cookies].map(([k,v]) => k + '=' + v).join('; '),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { 'X-CSRF-Token': token, 'Idempotency-Key': randomUUID() } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(';', 1)[0], index = pair.indexOf('=');
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return { status: response.status, body: await response.json() };
}
async function call(path, method = 'GET', body) {
  if (method === 'GET') return request(path);
  const csrf = await request('auth/csrf');
  assert.equal(csrf.status, 200);
  return request(path, method, body, csrf.body.token);
}
let runtime, tls, browser;
try {
  runtime = await startPreviewRuntime(process.env);
  tls = await tlsServer(join(evidence, 'tls'), (req, res) => {
    const host = req.headers.host ?? '';
    if (!/^v[a-f0-9]{32}\.preview\.codeless-preview\.test:\d+$/.test(host)) {
      res.writeHead(403); res.end(); return;
    }
    runtime.gateway.server.emit('request', req, res);
  }, Number(new URL(process.env.CODELESS_PREVIEW_ORIGIN).port));
  assert.equal((await call('auth/login', 'POST', {
    email: 'demo@codeless.local', password: 'demo-password-for-test-only'
  })).status, 200);
  const created = await call('applications', 'POST', { name: 'M6 final candidate', dataMode: 'STATIC', template: 'VUE' });
  assert.equal(created.status, 201);
  const app = created.body.id;
  const started = await call('tasks', 'POST', { applicationId: app,
    prompt: '生成静态个人展示页，使用两个 Vue 文件展示 Ada Lovelace 与作品列表' });
  assert.equal(started.status, 202);
  const task = started.body.id, deadline = Date.now() + 90000;
  await writeFile(join(evidence, 'started.json'), JSON.stringify({ applicationId: app, taskId: task }));
  for (;;) {
    const state = await call('tasks/' + task);
    assert.equal(state.status, 200);
    assert.notEqual(state.body.status, 'FAILED', JSON.stringify(state.body));
    if (state.body.status === 'READY') break;
    assert.ok(Date.now() < deadline, 'Generation deadline exceeded');
    await new Promise(done => setTimeout(done, 500));
  }
  const version = (await call('applications/' + app)).body.latestReadyVersionId;
  assert.ok(version);
  // Drain a scan that may predate READY, then perform a scan of the committed READY version.
  await runtime.registry.sync(); await runtime.registry.sync();
  const issued = await call('applications/' + app + '/versions/' + version + '/preview-credentials', 'POST');
  assert.equal(issued.status, 200);
  const url = new URL(issued.body.url);
  assert.equal(url.hostname, 'v' + version.replaceAll('-', '') + '.preview.codeless-preview.test');
  browser = await chromium.launch({ args: ['--host-resolver-rules=MAP *.codeless-preview.test 127.0.0.1', '--no-proxy-server'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort());
  const page = await context.newPage();
  assert.equal((await page.goto(url.href)).status(), 200);
  await expect(page.getByTestId('profile-name')).toHaveText('Ada Lovelace');
  await page.reload();
  await expect(page.getByTestId('profile-name')).toHaveText('Ada Lovelace');
  assert.ok(!(await context.cookies()).some(c => c.name === 'JSESSIONID'));
  await page.screenshot({ path: join(evidence, 'same-source-preview.png') });
  const journal = (await readSnapshot(join(process.env.CODELESS_AGENT_PRIVATE_ROOT, 'journal', task))).buffers;
  const result = [...journal.values()].map(b => JSON.parse(b.toString('utf8'))).findLast(v => v.kind === 'runner.result').payload;
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.build.status, 'SUCCEEDED');
  assert.equal(result.build.exitCode, 0);
  assert.equal(result.verification.status, 'PASSED');
  assert.equal(result.verification.cleanup.browserClosed, true);
  const snapshot = await call('versions/' + version + '/snapshot');
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.body.sourceDigest, result.sourceDigest);
  assert.equal(snapshot.body.validation.artifactDigest, result.build.artifact.digest);
  const image = await readFile(join(evidence, 'same-source-preview.png'));
  await writeFile(join(evidence, 'acceptance.json'), JSON.stringify({
    applicationId: app, taskId: task, versionId: version, buildId: result.build.id,
    sourceDigest: result.sourceDigest, artifactDigest: result.build.artifact.digest,
    modelProvider: 'deterministic-mock', modelQualityAccepted: false,
    platformApiFixture: false, signingFixture: false, realDockerBuild: true, realBrowserVerification: true,
    acceptanceScope: 'M6-final-candidate-authenticated-api-runner-browser-source-binding',
    reusedChecks: ['platform UI', 'Nginx ingress', 'restart', 'retention and revocation', 'six delivery categories'],
    screenshot: { path: 'same-source-preview.png', digest: digest(image), bytes: image.length }
  }, null, 2) + '\n', { flag: 'wx' });
  console.log('M6 focused real API/SQL/runner/build/browser/source-binding passed.');
} finally {
  const cleanup = await Promise.allSettled([
    browser?.close(), tls ? closeServer(tls) : undefined, runtime?.close()
  ]);
  const failures = cleanup.filter(r => r.status === 'rejected').map(r => r.reason);
  if (failures.length) throw new AggregateError(failures, 'M6 cleanup failed');
}
