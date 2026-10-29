import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const name = process.argv[2];
if (!/^2026-[0-9TZ.-]+-gate$/.test(name ?? '')) throw Error('Expected a recorded gate directory name');
const folder = join(import.meta.dirname, 'evidence', name);
const command = JSON.parse(readFileSync(join(folder, 'command.json'), 'utf8'));
const raw = readFileSync(command.privateLog);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
if (hash(raw) !== command.logSha256) throw Error('Gate log hash mismatch');
const text = raw.toString('utf8');
const section = stage => text.split(`[ci-gate] verify:${stage}`)[1]?.split('[ci-gate]')[0] ?? '';
const api = [...section('api').matchAll(/Tests run:\s*(\d+), Failures:\s*(\d+), Errors:\s*(\d+), Skipped:\s*(\d+)/g)].at(-1);
const tap = key => [...section('runner').matchAll(new RegExp(`(?:#|ℹ)\\s+${key} (\\d+)`, 'g'))].at(-1)?.[1];
const count = value => value === undefined ? null : Number(value);
const fullProduct = section('e2e').split(/\r?\n/).filter(line => line.startsWith('{')).flatMap(line => {
  try { const value = JSON.parse(line); return Object.hasOwn(value, 'browserExitCode') ? [value] : []; }
  catch { return []; }
}).at(-1);
const watched = ['ApiRequestBody.java', 'AuthFilter.java'].map(p => 'services/api/src/main/java/dev/codeless/api/auth/' + p)
  .concat(['ApiRequestBodyTest.java', 'RequestBodyBoundaryTest.java', 'RequestBodyBoundaryHttpTest.java'].map(p => 'services/api/src/test/java/dev/codeless/api/auth/' + p));
const root = resolve(import.meta.dirname, '../../..');
const unchanged = watched.every(path => hash(readFileSync(join(root, path))) === command.sourceDigests[path]);
const selected = ['ApiRequestBodyTest', 'RequestBodyBoundaryTest', 'RequestBodyBoundaryHttpTest', 'ApiSecurityMatrixTest',
  'AuthHttpTest', 'AuthIntegrationTest', 'VersionHttpIntegrationTest', 'PublicationIntegrationTest', 'TaskQueueIntegrationTest', 'TaskSseHttpTest'];
const coverage = Object.fromEntries(selected.map(name => {
  const result = command.junit.find(row => row.name === 'dev.codeless.api.' + ({ ApiSecurityMatrixTest: 'security',
    VersionHttpIntegrationTest: 'versions', PublicationIntegrationTest: 'deploy', TaskQueueIntegrationTest: 'tasks', TaskSseHttpTest: 'tasks' }[name] ?? 'auth') + '.' + name);
  return [name, result ?? null];
}));
const allPhasesPassed = ['verify:static', 'verify:api', 'verify:runner', 'verify:e2e'].every(name => command.stages?.some(s => s.stage === name && s.exitCode === 0 && s.signal === null));
const result = { taskId: 'D24-A', base: '5a0f14d49690af8341ab90c1aff564392e397177',
  implementationCommit: '0ba5244', gateHead: command.head, pullRequest: 'https://github.com/Echo-love928/CodeLess/pull/79',
  command: command.command, exitCode: command.exitCode, signal: command.signal, stages: command.stages ?? null,
  gateState: command.exitCode === 0 && allPhasesPassed ? 'PASSED' : command.exitCode === null ? 'UNKNOWN' : 'FAILED',
  durationSeconds: (Date.parse(command.finishedAt) - Date.parse(command.startedAt)) / 1000,
  api: api ? { tests: Number(api[1]), failures: Number(api[2]), errors: Number(api[3]), skipped: Number(api[4]) } : null,
  runner: { tests: count(tap('tests')), passed: count(tap('pass')), failed: count(tap('fail')), skipped: count(tap('skipped')) },
  e2eSummary: section('e2e').split(/\r?\n/).filter(line => /^\s*\d+ (passed|failed|skipped|did not run)\b/.test(line)).map(line => line.trim()),
  fullProduct: fullProduct ? { status: fullProduct.status, browserExitCode: fullProduct.browserExitCode,
    run: fullProduct.output?.replaceAll('\\', '/').split('/').at(-1) ?? null } : null,
  targetedCoverage: coverage, integrity: { logSha256Verified: true, testedApiSourceBytesUnchanged: unchanged,
    restoredScreenshots: command.restoredScreenshots, sourceHashes: Object.fromEntries(watched.map(p => [p, command.sourceDigests[p]])) },
  developerTokens: { input: null, output: null, total: null, measurement: 'UNKNOWN' },
  platformModelUsage: { provider: 'deterministic-mock', paidRequests: 0, mockCalls: null, totalTokens: null, usage: 'UNKNOWN_NOT_AGGREGATED' },
  remaining: ['Independent approval of A', 'Current final-head remote checks', 'A+B real combination by enabling PR',
    'D21 real-model effect acceptance', 'D23 operational enablement'] };
if (!unchanged) throw Error('API sources changed since gate started');
writeFileSync(new URL('./evidence/candidate.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ gateState: result.gateState, api: result.api, runner: result.runner, e2eSummary: result.e2eSummary, stages: result.stages, unchanged }));
