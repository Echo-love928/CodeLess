import { spawnSync } from 'node:child_process';
import { redoclyEnvironment } from './cli-environment.mjs';

const isWindows = process.platform === 'win32';
const corepack = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack';
const redoclyArgs = isWindows
  ? ['/d', '/c', 'corepack', 'pnpm', 'exec', 'redocly', 'lint', 'contracts/openapi.v0.json']
  : ['pnpm', 'exec', 'redocly', 'lint', 'contracts/openapi.v0.json'];
const commands = [
  ['node', ['scripts/verify-versions.mjs']],
  ['node', ['scripts/validate-contracts.mjs', 'all']],
  ['node', ['--test', 'contracts/events/openapi.test.mjs', 'contracts/tasks/openapi.test.mjs']],
  [corepack, redoclyArgs, redoclyEnvironment()],
  [corepack, isWindows
    ? ['/d', '/c', 'corepack', 'pnpm', '--filter', '@codeless/web', 'verify']
    : ['pnpm', '--filter', '@codeless/web', 'verify']]
];

for (const [command, args, env] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
