import { spawnSync } from 'node:child_process';
import { openSync, closeSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { environment } from '../e2e/full/support.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const configuredMode = process.argv.find(arg => ['--configured', '--configured-static', '--configured-api'].includes(arg));
const configured = !!configuredMode;
const runId = process.argv.find(arg => arg.startsWith('--run-id='))?.slice(9);
if (runId !== undefined && !/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('Invalid run ID');
const output = resolve(root, 'tests/release/d29-evidence', configured ? configuredMode.slice(2) : process.argv.includes('--network-enabled') ? 'network-enabled' : '.', runId ?? '.');
mkdirSync(output, { recursive: true });
const env = configured ? environment() : process.env;
if (configured) env.DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const receipt = { baseline: 'aefaca193af3019bcadbcf8fdf3f6424baee750c', scope: 'D29 documentation branch; no production deployment or human rehearsal', node: process.version, configuredToolchain: configured, javaHome: env.JAVA_HOME ?? null, commands: [] };
const stages = configured ? (configuredMode === '--configured-static' ? ['verify:static'] : configuredMode === '--configured-api' ? ['verify:api'] : ['ci:gate']) : ['verify:static', 'verify:api', 'verify:runner', 'verify:e2e', 'ci:gate'];
if (existsSync(resolve(output, 'verification.json')) || stages.some(script => existsSync(resolve(output, `${script.replace(':', '-')}.log`))))
  throw new Error('Existing evidence must be preserved; use a fresh --run-id=<identifier>');
for (const script of stages) {
  const name = script.replace(':', '-');
  const fd = openSync(resolve(output, `${name}.log`), 'w');
  const startedAt = new Date().toISOString();
  const args = ['/d', '/c', 'corepack', 'pnpm', script];
  const result = spawnSync(process.env.ComSpec ?? 'cmd.exe', args, { cwd: root, stdio: ['ignore', fd, fd], env });
  closeSync(fd);
  receipt.commands.push({ command: `corepack pnpm ${script}`, startedAt, endedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal, error: result.error?.message ?? null, log: `${name}.log` });
  writeFileSync(resolve(output, 'verification.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`${script}: exit=${result.status} signal=${result.signal}`);
}
process.exitCode = receipt.commands.some(item => item.exitCode !== 0) ? 1 : 0;
