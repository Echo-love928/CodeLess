import { spawnSync } from 'node:child_process';
import { openSync, closeSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { environment } from '../e2e/full/support.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const configured = process.argv.includes('--configured') || process.argv.includes('--configured-static');
const output = resolve(root, 'tests/release/d29-evidence', configured ? (process.argv.includes('--configured-static') ? 'configured-static' : 'configured') : process.argv.includes('--network-enabled') ? 'network-enabled' : '.');
mkdirSync(output, { recursive: true });
const env = configured ? environment() : process.env;
if (configured) env.DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const receipt = { baseline: 'aefaca193af3019bcadbcf8fdf3f6424baee750c', scope: 'D29 documentation branch; no production deployment or human rehearsal', node: process.version, configuredToolchain: configured, javaHome: env.JAVA_HOME ?? null, commands: [] };
const stages = configured ? (process.argv.includes('--configured-static') ? ['verify:static'] : ['ci:gate']) : ['verify:static', 'verify:api', 'verify:runner', 'verify:e2e', 'ci:gate'];
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
