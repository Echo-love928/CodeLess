// Evidence-only: compare B's three named API files. Never compiles, tests or runs gates.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '../../..');
const reviewedCommit = 'b5f9ec8547d4ba281b26a2e6915a9213aa0b5ec3';
const priorReviewedCommit = '0dbc999cc3712d8c7cb66b032e924a9569bc284c';
const metadataPath = 'tests/regression/api/evidence/2026-10-29T06-29-39.894Z-gate/command.json';
const output = join(import.meta.dirname, 'evidence/api-fingerprint-review-b5f9ec8');
const paths = [
  'services/api/src/main/java/dev/codeless/api/data/TaskProgressService.java',
  'services/api/src/main/java/dev/codeless/api/tasks/TaskEventReplay.java',
  'services/api/src/test/java/dev/codeless/api/auth/AuthIntegrationTest.java'
];
const git = (...args) => {
  const r = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root });
  if (r.status !== 0) throw Error('Git read failed: ' + args.join(' '));
  return r.stdout;
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const lf = bytes => Buffer.from(bytes.filter((v, i) => !(v === 13 && bytes[i + 1] === 10)));
const crlfCount = bytes => [...bytes].filter((v, i) => v === 13 && bytes[i + 1] === 10).length;
const bareLfCount = bytes => [...bytes].filter((v, i) => v === 10 && bytes[i - 1] !== 13).length;
const blob = (commit, path) => git('show', `${commit}:${path}`);
const oid = (commit, path) => git('rev-parse', `${commit}:${path}`).toString().trim();
const metadataBytes = blob(reviewedCommit, metadataPath), record = JSON.parse(metadataBytes);
const gateCommit = record.head;
if (gateCommit !== '9cf78ef1f812aa8377fb7d42215650e78b05b3b9' || record.exitCode !== 0)
  throw Error('Unexpected gate record');
if (!lf(readFileSync(join(root, metadataPath))).equals(lf(metadataBytes))) throw Error('Working gate record changed');
mkdirSync(join(output, 'site'), { recursive: true });
const rows = paths.map(path => {
  const working = readFileSync(join(root, path));
  const snapshotPath = 'site/' + path.split('/').at(-1) + '.raw';
  const snapshotFile = join(output, snapshotPath), recordedSha = record.sourceDigests[path];
  if (typeof recordedSha !== 'string') throw Error('Missing measured source fingerprint: ' + path);
  if (!existsSync(snapshotFile)) {
    if (!process.argv.includes('--capture')) throw Error('Raw witness absent; original operator must capture measured bytes');
    if (sha(working) !== recordedSha) throw Error('Current raw bytes do not match original measured SHA256: ' + path);
    // Copy actual bytes only after the recorded hash matches; never manufacture CRLF from a Git/LF version.
    writeFileSync(snapshotFile, working, { flag: 'wx' });
  }
  const site = readFileSync(snapshotFile), normalizedSite = lf(site);
  const versions = [gateCommit, priorReviewedCommit, reviewedCommit].map(commit => {
    const bytes = blob(commit, path);
    return { commit, blobOid: oid(commit, path), bytes: bytes.length, rawSha256: sha(bytes),
      lfSha256: sha(lf(bytes)), crlfPairs: crlfCount(bytes),
      normalizedSiteEqualsGitRaw: normalizedSite.equals(bytes), normalizedSiteEqualsGitLf: normalizedSite.equals(lf(bytes)) };
  });
  const row = { path, recordedRawSha256: recordedSha,
    measuredSiteWitness: { path: snapshotPath, bytes: site.length, rawSha256: sha(site),
      lfSha256: sha(normalizedSite), crlfPairs: crlfCount(site), bareLf: bareLfCount(site),
      lineEndings: crlfCount(site) && bareLfCount(site) ? 'MIXED_CRLF_AND_LF' : crlfCount(site) ? 'CRLF' : 'LF',
      bareCr: [...site].filter((v, i) => v === 13 && site[i + 1] !== 10).length,
      provenance: 'Actual working bytes copied after equality with original gate sourceDigests was verified; not CRLF reconstruction' },
    gitVersions: versions,
    currentWorkingFile: { rawSha256: sha(working), lfSha256: sha(lf(working)), crlfPairs: crlfCount(working),
      rawEqualsMeasuredSite: working.equals(site), lfEqualsReviewedGit: lf(working).equals(blob(reviewedCommit, path)) },
    recordedRawEqualsWitness: recordedSha === sha(site),
    classification: site.equals(blob(reviewedCommit, path)) ? 'IDENTICAL_RAW_BYTES' : 'ONLY_CRLF_TO_LF_NORMALIZATION_DIFFERS',
    onlyRemovedBytes: site.length - normalizedSite.length };
  if (!row.recordedRawEqualsWitness || !versions.every(v => v.normalizedSiteEqualsGitRaw && v.normalizedSiteEqualsGitLf)
      || !row.currentWorkingFile.lfEqualsReviewedGit || row.onlyRemovedBytes !== row.measuredSiteWitness.crlfPairs)
    throw Error('API source association failed: ' + path);
  return row;
});
const changed = (...args) => git('diff', '--name-only', ...args).toString().trim().split(/\r?\n/).filter(Boolean);
const gatePaths = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.github/workflows/ci.yml',
  'scripts/ci-gate.mjs', 'scripts/run-static.mjs', 'scripts/run-maven.mjs', 'scripts/validate-contracts.mjs',
  'services/api/pom.xml', 'services/api/mvnw', 'services/api/mvnw.cmd',
  'tests/regression/api/record-body-boundary.mjs', 'tests/regression/api/stage-observer.mjs'];
const guards = { apiChangesGateToReviewed: changed(gateCommit, reviewedCommit, '--', 'services/api/src'),
  apiWorkingChangesSinceReviewed: changed(reviewedCommit, '--', 'services/api/src'),
  gateEntrypointChanges: changed(gateCommit, reviewedCommit, '--', ...gatePaths),
  gateWorkingChangesSinceReviewed: changed(reviewedCommit, '--', ...gatePaths) };
if (Object.values(guards).some(values => values.length)) throw Error('API/gate inputs changed');
const report = { taskId: 'D24-A', reviewedCommit, priorReviewedCommit, gateCommit,
  verificationCommand: 'node tests/regression/api/verify-api-site-fingerprints.mjs',
  captureCommand: 'node tests/regression/api/verify-api-site-fingerprints.mjs --capture',
  comparatorSha256: sha(readFileSync(join(import.meta.dirname, 'verify-api-site-fingerprints.mjs'))),
  metadata: { path: metadataPath, blobOid: oid(reviewedCommit, metadataPath), sha256: sha(metadataBytes),
    originalLogSha256: record.logSha256 },
  normalization: 'Remove only CR immediately followed by LF; preserve bare CR, BOM, Unicode, spacing and final newline',
  rows, guards, result: 'PASSED_3_OF_3_B_NAMED_API_FILES',
  apiSourceModified: false, gatesRerun: false, paidModelRequests: 0,
  previousWrongScopeReport: 'fingerprint-review-0dbc999 covers documentation/report files, not these API files; retained as historical evidence only',
  historical502RootCause: 'UNKNOWN', approval: 'PENDING_B_REVIEW' };
writeFileSync(join(output, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: report.result, guards, files: rows.map(r => ({ path: r.path,
  recordedRawEqualsWitness: r.recordedRawEqualsWitness, crlfPairs: r.measuredSiteWitness.crlfPairs,
  normalizedEqualsAllThreeGitVersions: r.gitVersions.every(v => v.normalizedSiteEqualsGitRaw), classification: r.classification })) }));
