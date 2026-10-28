// Read-only review of the exact B candidate. Never checks out or runs its Docker harness.
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const revision = '01aa4f944be469e8ceae87713f1e3d15d8769a77';
const aRevision = '9c5cf47143810b27eee9666a13e1ba609d2698e3';
const base = 'tests/performance/runner/';
const output = join(root, 'tests/performance/api/evidence/peer-01aa4f9');
const git = args => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], {cwd: root, maxBuffer: 10_000_000, windowsHide: true});
const blob = (path, ref = revision) => git(['show', `${ref}:${path}`]);
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const save = (path, bytes) => { const target = join(output, path); mkdirSync(dirname(target), {recursive: true}); writeFileSync(target, bytes); };
const manifestBytes = blob(base + 'evidence/manifest.json');
const manifest = JSON.parse(manifestBytes);
save('source/evidence/manifest.json', manifestBytes);
const verified = manifest.reports.map(entry => {
  assert.match(entry.file, /^[A-Za-z0-9.-]+\.json$/);
  const bytes = blob(base + 'evidence/' + entry.file), report = JSON.parse(bytes);
  assert.equal(sha(bytes), entry.digest, entry.file);
  assert.equal(report.status, entry.status); assert.equal(report.canonical, entry.canonical);
  save('source/evidence/' + entry.file, bytes);
  return {file: entry.file, digest: sha(bytes), status: report.status, canonical: report.canonical};
});
const sourceHashes = {};
for (const name of ['api-evidence.mjs', 'api-evidence.test.mjs', 'evidence.test.mjs', 'api-isolation.mjs', 'support.mjs', 'fixtures/Dockerfile', 'fixtures/pressure-entry.mjs']) {
  const bytes = blob(base + name); save('source/' + name, bytes); sourceHashes[base + name] = sha(bytes);
}
// Only these three reviewed tests execute: JSON/hash/causal-order assertions, no services or shell.
const args = ['--test', join(output, 'source/evidence.test.mjs'), join(output, 'source/api-evidence.test.mjs')];
const test = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8', windowsHide: true});
save('audit.log', (test.stdout ?? '') + (test.stderr ?? ''));
save('command.json', JSON.stringify({checkedAt: new Date().toISOString(), revision, command: [process.execPath, ...args], exitCode: test.status, signal: test.signal, sourceHashes}, null, 2) + '\n');
assert.equal(test.error, undefined); assert.equal(test.status, 0, test.stdout + test.stderr);

const corrected = verified.filter(x => x.file.startsWith('api-')).map(x => ({...x, report: JSON.parse(blob(base + 'evidence/' + x.file))})).filter(x => x.report.faults.some(f => f.mode === 'memory-control'));
assert.equal(corrected.length, 2);
const audits = corrected.map(({file, report}) => {
  assert.equal(report.samples.length, 80); assert.equal(report.canonical, false);
  assert.deepEqual(report.cleanupErrors, []);
  for (const key of ['apiRemoved', 'databaseRemoved', 'imageAliasRemoved']) assert.equal(report[key], true);
  const groups = {};
  for (const fault of report.faults) {
    const value = fault.observed.value;
    assert.equal(fault.result.exitCode, 137);
    assert.equal(fault.result.failure, fault.mode === 'timeout' ? 'TIMEOUT' : 'OOM');
    assert.equal(fault.result.artifact, null);
    const phase = fault.mode === 'timeout' ? 'timeout-after-cpu-barrier' : fault.mode === 'memory' ? 'memory-after-oom-confirmation' : 'memory-control-before-pressure-release';
    const samples = report.samples.filter(s => s.phase === phase);
    assert.equal(samples.length, 10);
    if (fault.mode === 'timeout') {
      const usage = text => Number(text.match(/^usage_usec (\d+)$/m)[1]);
      assert.ok(usage(value.barrier.after) - usage(value.barrier.before) > 100000);
      assert.match(value.barrier.top, /node\s+-e\s+while\(true\)/);
    } else {
      assert.equal(value.barrier.state.OOMKilled, true);
      assert.match(value.barrier.events, /^oom_kill [1-9]\d*$/m);
      assert.ok(value.release.monotonicMs < value.barrier.monotonicMs);
    }
    for (const sample of samples) {
      assert.match(sample.containerId, /^[a-f0-9]{64}$/);
      assert.equal(sample.containerId, samples[0].containerId);
      assert.ok(Date.parse(sample.completedAt) <= Date.parse(fault.result.completedAt));
      if (fault.mode === 'memory-control') assert.ok(sample.monotonicEndMs < value.release.monotonicMs);
      else { assert.equal(sample.barrierMonotonicMs, value.barrier.monotonicMs); assert.ok(sample.monotonicStartMs >= value.barrier.monotonicMs); }
    }
  }
  for (const phase of new Set(report.samples.map(s => s.phase))) {
    const samples = report.samples.filter(s => s.phase === phase);
    assert.equal(samples.length, 10);
    groups[phase] = {n: samples.length, maxMs: Math.max(...samples.map(s => s.elapsedMs))};
  }
  let apiSourceFiles = null, apiSourceMatch = null, harnessSourceMatch = null;
  if (file.startsWith('api-ab-')) {
    assert.equal(report.apiSourceChanges, false);
    apiSourceFiles = Object.keys(report.apiSources).length; assert.equal(apiSourceFiles, 113);
    apiSourceMatch = {gitBytes: 0, crlfCheckoutOnly: 0};
    for (const [path, digest] of Object.entries(report.apiSources)) {
      const bytes = blob(path, aRevision);
      if (sha(bytes) === digest) apiSourceMatch.gitBytes++;
      else { assert.equal(sha(Buffer.from(bytes.toString('utf8').replace(/\r?\n/g, '\r\n'))), digest, path); apiSourceMatch.crlfCheckoutOnly++; }
    }
    harnessSourceMatch = {};
    for (const path of Object.keys(sourceHashes).filter(p => p.endsWith('api-isolation.mjs') || p.endsWith('support.mjs') || p.includes('/fixtures/'))) {
      const bytes = blob(path);
      if (sha(bytes) === report.sources[path]) harnessSourceMatch[path] = 'gitBytes';
      else { assert.equal(sha(Buffer.from(bytes.toString('utf8').replace(/\r?\n/g, '\r\n'))), report.sources[path], path); harnessSourceMatch[path] = 'crlfCheckoutOnly'; }
    }
  }
  return {file, status: report.status, canonical: report.canonical, machine: report.machine, groups, apiSourceFiles, apiSourceMatch, harnessSourceMatch};
});
const full = JSON.parse(blob(base + 'evidence/ab-integration.json'));
assert.equal(full.full.exitCode, 1); assert.equal(full.full.status, 'FAILED'); assert.equal(full.full.observedPhase, 'UNKNOWN');
save('summary.json', JSON.stringify({checkedAt: new Date().toISOString(), revision, aRevision, auditExitCode: test.status, rawReportsVerified: verified, sourceHashes, audits,
  scope: 'Independent replay of committed raw evidence and source review; no rerun of Docker pressure or full product deployment.',
  remaining: {fullProductStatus: full.full.status, observedPhase: full.full.observedPhase, productionCapacityCalibration: 'NOT_COMPLETED'}}, null, 2) + '\n');
console.log(JSON.stringify({revision, auditExitCode: test.status, rawReportsVerified: verified.length, samples: audits.map(a => ({file: a.file, total: 80, qualifiedOOM: a.groups['memory-after-oom-confirmation'].n})), abApiSourceFiles: 113}));
