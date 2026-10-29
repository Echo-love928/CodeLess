import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, openSync, closeSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '../../..');
const mode = process.argv[2];
const selected = {
  red: 'RequestBodyBoundaryTest',
  'baseline-http': 'RequestBodyBoundaryHttpTest',
  green: 'RequestBodyBoundaryTest,ApiRequestBodyTest,RequestBodyBoundaryHttpTest',
  regression: 'ApiSecurityMatrixTest,AuthHttpTest,AuthIntegrationTest,VersionHttpIntegrationTest,PublicationIntegrationTest,TaskQueueIntegrationTest,GlobalExceptionHandlerTest'
};
if (!selected[mode] && mode !== 'gate') throw Error('Expected red, green, regression or gate');
const stamp = new Date().toISOString().replaceAll(':', '-');
const publicRoot = join(import.meta.dirname, 'evidence', `${stamp}-${mode}`);
const privateRoot = join(import.meta.dirname, '.private', `${stamp}-${mode}`);
mkdirSync(publicRoot, { recursive: true });
mkdirSync(privateRoot, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => {
  const r = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw Error(r.stderr);
  return r.stdout.trim();
};
const env = { ...process.env, CODELESS_MODEL_PROVIDER: 'deterministic-mock', NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1' };
for (const key of ['CODELESS_MODEL_API_KEY', 'CODELESS_MODEL_NAME', 'CODELESS_PLAYWRIGHT_CHANNEL']) delete env[key];
const jdk = join(root, '.local-data/d07-a/tools/java21/jdk-21.0.12.1+1');
if (existsSync(jdk)) {
  env.JAVA_HOME = jdk;
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = join(jdk, 'bin') + (process.platform === 'win32' ? ';' : ':') + (env[pathKey] ?? '');
}
const win = process.platform === 'win32';
env.D24_STAGE_EXITS = join(privateRoot, 'stages.jsonl');
const command = mode === 'gate' ? process.execPath : win ? (env.ComSpec ?? 'cmd.exe') : './services/api/mvnw';
const args = mode === 'gate'
  ? ['--import', new URL('./stage-observer.mjs', import.meta.url).href, 'scripts/ci-gate.mjs']
  : [...(win ? ['/d', '/c', 'services\\api\\mvnw.cmd'] : []), '-f', 'services/api/pom.xml', `-Dtest=${selected[mode]}`, 'test'];
const sources = git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'services/api/src', 'tests/regression/api')
  .split(/\r?\n/).filter(p => p && !p.includes('/evidence/'));
const metadata = { mode, command: [command, ...args], head: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'),
  startedAt: new Date().toISOString(), modelProvider: env.CODELESS_MODEL_PROVIDER,
  sourceDigests: Object.fromEntries(sources.map(p => [p, hash(readFileSync(join(root, p)))])), exitCode: null };
const filterPath = 'services/api/src/main/java/dev/codeless/api/auth/AuthFilter.java';
const originalFilter = readFileSync(join(root, filterPath));
if (mode === 'baseline-http') {
  // Restore exact working bytes in finally; this mode replays only the baseline filter, never resets a checkout.
  const baseline = '5a0f14d';
  const old = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'show', `${baseline}:${filterPath}`], { cwd: root });
  if (old.status !== 0) throw Error('Cannot read baseline filter');
  writeFileSync(join(privateRoot, 'original-AuthFilter.java'), originalFilter);
  writeFileSync(join(root, filterPath), old.stdout);
  metadata.productionBaseline = baseline;
  metadata.sourceDigests[filterPath] = hash(old.stdout);
}
const screenshots = new Map(mode === 'gate' ? git('ls-files', '*.png').split(/\r?\n/).filter(Boolean).map(p => [p, readFileSync(join(root, p))]) : []);
const fd = openSync(join(privateRoot, 'command.log'), 'wx');
console.log('Evidence:', publicRoot);
let result;
try {
  const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', fd, fd] });
  result = await new Promise(done => {
    child.on('error', error => done({ code: null, signal: null, error: error.message }));
    child.on('exit', (code, signal) => done({ code, signal, error: null }));
  });
} finally {
  closeSync(fd);
  if (mode === 'baseline-http') writeFileSync(join(root, filterPath), originalFilter);
}
if (mode === 'baseline-http') metadata.filterRestoredByteForByte = hash(readFileSync(join(root, filterPath))) === hash(originalFilter);
Object.assign(metadata, { exitCode: result.code, signal: result.signal, launchError: result.error, finishedAt: new Date().toISOString(),
  privateLog: join(privateRoot, 'command.log'), logSha256: hash(readFileSync(join(privateRoot, 'command.log'))) });
if (mode === 'gate' && existsSync(env.D24_STAGE_EXITS)) metadata.stages = readFileSync(env.D24_STAGE_EXITS, 'utf8').trim().split('\n').map(JSON.parse);
metadata.restoredScreenshots = [];
for (const [p, bytes] of screenshots) if (!existsSync(join(root, p)) || hash(readFileSync(join(root, p))) !== hash(bytes)) {
  writeFileSync(join(root, p), bytes);
  metadata.restoredScreenshots.push({ path: p, sha256: hash(bytes) });
}
const reports = join(root, 'services/api/target/surefire-reports');
metadata.junit = [];
if (existsSync(reports)) for (const name of readdirSync(reports).filter(p => p.startsWith('TEST-') && p.endsWith('.xml'))) {
  const source = join(reports, name);
  const { statSync } = await import('node:fs');
  if (statSync(source).mtimeMs < Date.parse(metadata.startedAt)) continue;
  const xml = readFileSync(source, 'utf8');
  const attributes = xml.match(/<testsuite\b[^>]*>/)?.[0] ?? '';
  const counts = Object.fromEntries(['name', 'tests', 'failures', 'errors', 'skipped'].map(key => [key, attributes.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1] ?? null]));
  metadata.junit.push({ ...counts, sha256: hash(readFileSync(source)),
    failedCases: [...xml.matchAll(/<testcase\b([^>]+)>\s*<(failure|error)\b/g)].map(m => m[1].match(/\bname="([^"]*)"/)?.[1]) });
  copyFileSync(source, join(privateRoot, name));
}
writeFileSync(join(publicRoot, 'command.json'), JSON.stringify(metadata, null, 2) + '\n');
const log = readFileSync(join(privateRoot, 'command.log'), 'utf8');
const summaries = log.split(/\r?\n/).filter(line => /Tests run:|BUILD SUCCESS|BUILD FAILURE|oversized body must|expected:|but was:|Actual:|Expected:|\[ci-gate\]/.test(line));
writeFileSync(join(publicRoot, 'summary.txt'), summaries.join('\n') + '\n');
console.log(JSON.stringify({ exitCode: result.code, stages: metadata.stages, junit: metadata.junit.map(({name,tests,failures,errors,skipped}) => ({name,tests,failures,errors,skipped})), evidence: publicRoot }));
process.exit(result.code === 0 && !result.signal ? 0 : 1);
