// Operator-only M6 recording. Existing passing suites are reused, never rerun here.
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, openSync, closeSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { environment } from '../../e2e/full/support.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const runId = process.argv[3] ?? 'final';
if (!/^[a-zA-Z0-9_-]+$/.test(runId)) throw Error('Invalid run id');
const output = resolve(root, '.local-data/d30-b/m6-' + runId);
mkdirSync(output, { recursive: true });
const sha = b => createHash('sha256').update(b).digest('hex');
const git = args => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw Error(r.stderr);
  return r.stdout.trim();
};
const head = git(['rev-parse', 'HEAD']);
const mode = process.argv[2];
if (!['integration', 'api', 'client', 'bind'].includes(mode)) throw Error('Expected integration|api|client|bind');
if (git(['status', '--porcelain'])) throw Error('Commit candidate before recording M6');
const selection = resolve(output, 'candidate.json');
if (!existsSync(selection)) {
  const rows = git(['ls-tree', '-r', head]).split('\n').filter(r => !/\t(?:docs\/|tests\/|README\.md$)/.test(r));
  writeFileSync(selection, JSON.stringify({ commit: head, tree: git(['rev-parse', head + '^{tree}']),
    mainBase: git(['merge-base', head, 'origin/main']), runtimeFiles: rows.length,
    runtimeGitInventorySha256: sha(rows.join('\n')), paidRequests: 0, deployed: false }, null, 2) + '\n', { flag: 'wx' });
}
if (JSON.parse(readFileSync(selection)).commit !== head) throw Error('Candidate changed; preserve output and use a new selection');
const env = environment();
env.DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine';
function run(label, command, args) {
  const receipt = resolve(output, label + '.json');
  if (existsSync(receipt)) throw Error('Existing receipt must not be overwritten: ' + label);
  const logfile = resolve(output, label + '.log');
  const fd = openSync(logfile, 'wx');
  const startedAt = new Date().toISOString();
  const r = spawnSync(command, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  const bytes = readFileSync(logfile);
  const value = { candidate: head, command: [command, ...args], startedAt, endedAt: new Date().toISOString(),
    nativeExitCode: r.status, signal: r.signal, error: r.error?.message ?? null,
    log: logfile, logBytes: bytes.length, logSha256: sha(bytes) };
  writeFileSync(receipt, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ label, candidate: head, nativeExitCode: r.status, signal: r.signal }));
  if (r.status !== 0 || r.signal || r.error) throw Error(label + ' failed; original log and receipt retained');
  if (git(['rev-parse', 'HEAD']) !== head || git(['status', '--porcelain'])) throw Error('Candidate changed during operation');
  return value;
}
if (mode === 'integration') {
  run('integration', process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'services\\api\\mvnw.cmd', '-f', 'services/api/pom.xml',
    '-Dtest=M6SameSourceIT#realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures', 'test']);
  const xml = resolve(root, 'services/api/target/surefire-reports/TEST-dev.codeless.api.preview.M6SameSourceIT.xml');
  const bytes = readFileSync(xml);
  copyFileSync(xml, resolve(output, 'integration-junit.xml'));
  const text = bytes.toString('utf8');
  const suite = text.match(/<testsuite\s[^>]*>/)?.[0];
  const counts = Object.fromEntries(['tests', 'failures', 'errors', 'skipped'].map(k => [k, Number(suite?.match(new RegExp(k + '="([0-9]+)"'))?.[1])]));
  if (counts.tests !== 1 || counts.failures !== 0 || counts.errors !== 0 || counts.skipped !== 0) throw Error('One actual integration method must pass');
  const cases = readdirSync(resolve(root, 'services/api/target')).filter(n => n.startsWith('preview-platform-'));
  const candidates = cases.map(n => resolve(root, 'services/api/target', n, 'evidence/acceptance.json')).filter(existsSync);
  const receipt = JSON.parse(readFileSync(resolve(output, 'integration.json')));
  const { statSync } = await import('node:fs');
  const newest = candidates.filter(p => statSync(p).mtimeMs >= Date.parse(receipt.startedAt)).sort((a,b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!newest) throw Error('Missing fresh real acceptance');
  const a = JSON.parse(readFileSync(newest));
  if (a.platformApiFixture !== false || a.signingFixture !== false || a.realDockerBuild !== true || a.realBrowserVerification !== true) throw Error('Actual integration required');
  writeFileSync(resolve(output, 'integration-public.json'), JSON.stringify({ candidate: head, status: 'PASSED', counts,
    junitSha256: sha(bytes), modelProvider: a.modelProvider, modelQualityAccepted: a.modelQualityAccepted,
    platformApiFixture: a.platformApiFixture, signingFixture: a.signingFixture,
    realDockerBuild: a.realDockerBuild, realBrowserVerification: a.realBrowserVerification,
    applicationId: a.applicationId, taskId: a.taskId, versionId: a.versionId, buildId: a.buildId,
    sourceDigest: a.sourceDigest, artifactDigest: a.artifactDigest,
    acceptanceScope: a.acceptanceScope, reusedChecks: a.reusedChecks,
    residentRestartPassed: a.residentRestartPassed, retentionRevocationPassed: a.retentionRevocationPassed,
    native: receipt }, null, 2) + '\n', { flag: 'wx' });
} else if (mode === 'api') {
  run('api-package', 'python', ['scripts/release/api_release.py', 'build', '--revision', head,
    '--output', resolve(output, 'packages/api'), '--log', resolve(output, 'api-build.log')]);
} else if (mode === 'client') {
  run('client-package', process.execPath, ['infra/release/client/package.mjs', 'build', head,
    resolve(root, '.local-data/d27-b/m6-' + head.slice(0, 12))]);
} else {
  const code = `import json,tarfile,hashlib,sys,pathlib
root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); head=sys.argv[3]
api=out/'packages/api'; client=root/'.local-data/d27-b'/('m6-'+head[:12])/'bundle'
a=json.loads((api/'release.json').read_bytes()); c=json.loads((client/'manifest.json').read_bytes())
assert a['sourceCommit']==c['commit']==head
with tarfile.open(client/'runner.tar') as t:
 members={m.name:m for m in t.getmembers() if m.isfile()}
 common=[r for r in a['sourceFiles'] if r['path'].removeprefix('repository/') in members]
 assert len(common)>100
 assert 'services/runner/src/verify/browser-cleanup.mjs' in members
 for r in common:
  p=r['path'].removeprefix('repository/'); data=(api/r['path']).read_bytes(); shipped=t.extractfile(members[p]).read()
  assert data==shipped and hashlib.sha256(data).hexdigest()==r['sha256'],p
result={'status':'PASSED','candidate':head,'sharedSourceFiles':len(common),'apiManifestSha256':hashlib.sha256((api/'release.json').read_bytes()).hexdigest(),'clientManifestSha256':hashlib.sha256((client/'manifest.json').read_bytes()).hexdigest(),'apiJarSha256':hashlib.sha256((api/'api.jar').read_bytes()).hexdigest(),'newCleanupModuleIncluded':True,'deployed':False}
(out/'package-binding.json').write_text(json.dumps(result,indent=2)+'\\n',encoding='utf8',newline='\\n')
print(json.dumps(result))`;
  run('package-binding', 'python', ['-c', code, root, output, head]);
}
