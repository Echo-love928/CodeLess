// Evidence-only comparison: no compilation, test, build, model request or gate execution.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '../../..');
const reviewCommit = '0dbc999cc3712d8c7cb66b032e924a9569bc284c';
const recordPath = 'tests/regression/api/evidence/2026-10-29T06-29-39.894Z-gate/command.json';
const output = join(import.meta.dirname, 'evidence/fingerprint-review-0dbc999');
const paths = ['PR-DRAFT.md', 'README.md', 'summarize.mjs'].map(p => 'tests/regression/api/' + p);
const git = (...args) => {
  const result = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root });
  if (result.status !== 0) throw Error('Git read failed: ' + args.join(' '));
  return result.stdout;
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Byte normalization only: remove CR immediately before LF. Preserve bare CR, BOM, Unicode and all other whitespace.
const lf = bytes => Buffer.from(bytes.filter((value, i) => !(value === 13 && bytes[i + 1] === 10)));
const blob = (commit, path) => git('show', `${commit}:${path}`);
const oid = (commit, path) => git('rev-parse', `${commit}:${path}`).toString().trim();
const frozenRecord = blob(reviewCommit, recordPath);
const diskRecord = readFileSync(join(root, recordPath));
if (!lf(frozenRecord).equals(lf(diskRecord))) throw Error('Recorded command metadata differs from reviewed Git content');
const record = JSON.parse(frozenRecord);
const gateCommit = record.head;
const expectedGate = '9cf78ef1f812aa8377fb7d42215650e78b05b3b9';
if (gateCommit !== expectedGate || record.exitCode !== 0) throw Error('Unexpected gate identity/result');

const reasons = {
  'PR-DRAFT.md': 'Post-run PR description replaces pending/old gate text with completed verification and remaining limits.',
  'README.md': 'Post-run replay instructions add the second gate and keep the original FAILED report separately.',
  'summarize.mjs': 'Post-run report tool adds a separate output, historical failure/UNKNOWN fields, full API fingerprint check and preview coverage; it is not a gate entrypoint.'
};
const rows = paths.map(path => {
  const gate = blob(gateCommit, path), reviewed = blob(reviewCommit, path), disk = readFileSync(join(root, path));
  const recorded = record.sourceDigests[path];
  if (typeof recorded !== 'string') throw Error('Missing recorded fingerprint: ' + path);
  const result = { path, recordedRawSha256: recorded,
    gateGitBlob: { oid: oid(gateCommit, path), bytes: gate.length, rawSha256: sha256(gate), lfSha256: sha256(lf(gate)) },
    reviewedGitBlob: { oid: oid(reviewCommit, path), bytes: reviewed.length, rawSha256: sha256(reviewed), lfSha256: sha256(lf(reviewed)) },
    currentWorkingFile: { bytes: disk.length, rawSha256: sha256(disk), lfSha256: sha256(lf(disk)),
      crlfPairs: [...disk].filter((value, i) => value === 13 && disk[i + 1] === 10).length },
    recordedRawMatchesGateBlob: recorded === sha256(gate),
    workingRawMatchesReviewedBlob: disk.equals(reviewed),
    workingLfMatchesReviewedLf: lf(disk).equals(lf(reviewed)),
    gateLfEqualsReviewedLf: lf(gate).equals(lf(reviewed)),
    differenceClassification: 'POST_RUN_CONTENT_CHANGE_NOT_EOL_ONLY',
    explanation: reasons[path.split('/').at(-1)] };
  if (!result.recordedRawMatchesGateBlob || !result.workingLfMatchesReviewedLf || result.gateLfEqualsReviewedLf)
    throw Error('Fingerprint association failed: ' + path);
  return result;
});
const entrypoints = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'scripts/ci-gate.mjs',
  'scripts/run-static.mjs', 'scripts/run-maven.mjs', 'scripts/validate-contracts.mjs', 'scripts/verify-versions.mjs',
  'services/api/pom.xml', 'services/api/mvnw', 'services/api/mvnw.cmd',
  'tests/regression/api/record-body-boundary.mjs', 'tests/regression/api/stage-observer.mjs'];
const changed = (...args) => git('diff', '--name-only', ...args).toString().trim().split(/\r?\n/).filter(Boolean);
const guards = { apiSourceChangesBetweenGateAndReview: changed(gateCommit, reviewCommit, '--', 'services/api/src'),
  apiWorkingChangesSinceReview: changed(reviewCommit, '--', 'services/api/src'),
  gateEntrypointChangesBetweenGateAndReview: changed(gateCommit, reviewCommit, '--', ...entrypoints),
  gateWorkingChangesSinceReview: changed(reviewCommit, '--', ...entrypoints) };
if (Object.values(guards).some(values => values.length)) throw Error('API or gate inputs changed');
const patch = git('diff', '--no-ext-diff', '--no-color', '--no-renames', '--unified=3', gateCommit, reviewCommit, '--', ...paths);
const report = { taskId: 'D24-A', comparisonCommand: 'node tests/regression/api/verify-source-fingerprints.mjs',
  comparator: { path: 'tests/regression/api/verify-source-fingerprints.mjs', sha256: sha256(readFileSync(join(import.meta.dirname, 'verify-source-fingerprints.mjs'))) },
  reviewCommit, gateCommit, normalization: 'CRLF -> LF only; no trim, Unicode normalization, BOM removal or whitespace folding',
  record: { path: recordPath, gitBlobOid: oid(reviewCommit, recordPath),
    reviewedBlobSha256: sha256(frozenRecord), currentFileSha256: sha256(diskRecord), normalizedEqual: true,
    originalGateLogSha256: record.logSha256 },
  rows, guards, changesPatch: { path: 'changes.patch', sha256: sha256(patch) },
  result: 'PASSED_3_OF_3_VERSION_ASSOCIATIONS',
  conclusion: 'Historical raw hashes equal gate-commit blobs; current working files equal reviewed-commit content after LF normalization. The versions differ in post-run documentation/report content, not only EOL.',
  apiSourceOrGateEntrypointsModified: false, gatesRerun: false, paidModelRequests: 0,
  historical502RootCause: 'UNKNOWN', approval: 'PENDING_INDEPENDENT_REVIEW' };
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'changes.patch'), patch);
writeFileSync(join(output, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: report.result, reviewCommit, gateCommit, guards,
  files: rows.map(r => ({ path: r.path, recordedRawMatchesGateBlob: r.recordedRawMatchesGateBlob,
    workingRawMatchesReviewedBlob: r.workingRawMatchesReviewedBlob, workingLfMatchesReviewedLf: r.workingLfMatchesReviewedLf,
    gateLfEqualsReviewedLf: r.gateLfEqualsReviewedLf })) }));
