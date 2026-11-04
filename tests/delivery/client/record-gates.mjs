// Record the existing entry points without retries or altered assertions.
import { spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { environment } from '../../e2e/full/support.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const id = process.argv[2];
if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('Provide a fresh run ID');
const out = resolve(root, 'tests/delivery/client/evidence', id);
mkdirSync(resolve(out, '..'), { recursive: true });
mkdirSync(out); // Existing evidence is never overwritten.
const raw = resolve(root, '.local-data/d30-b', id);
mkdirSync(raw, { recursive: true });
const env = environment();
env.DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const report = { task: 'D30-B', head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(), node: process.version, paidRequestsRequested: 0, commands: [] };
for (const stage of ['verify:static', 'verify:api', 'verify:runner', 'verify:e2e', 'ci:gate']) {
  const path = resolve(raw, stage.replace(':', '-') + '.log');
  const fd = openSync(path, 'wx');
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.env.ComSpec, ['/d', '/c', 'corepack', 'pnpm', stage], { cwd: root, env, stdio: ['ignore', fd, fd], windowsHide: true });
  closeSync(fd);
  const log = readFileSync(path);
  report.commands.push({ command: `corepack pnpm ${stage}`, startedAt, endedAt: new Date().toISOString(), nativeExitCode: result.status, signal: result.signal, error: result.error?.message ?? null, log: path, bytes: log.length, sha256: createHash('sha256').update(log).digest('hex') });
  writeFileSync(resolve(out, 'gates.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${stage}: native=${result.status}, signal=${result.signal}`);
}
process.exitCode = report.commands.every(c => c.nativeExitCode === 0 && c.signal === null && c.error === null) ? 0 : 1;
