import { spawnSync } from 'node:child_process';

const stages = ['verify:static', 'verify:api', 'verify:runner', 'verify:e2e'];
const isWindows = process.platform === 'win32';
const corepack = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack';
let exitCode = 0;

for (const stage of stages) {
  console.log(`\n[ci-gate] ${stage}`);
  if (process.env.CODELESS_FORCE_FAIL === stage) {
    console.error(`[ci-gate] injected failure for ${stage}`);
    exitCode ||= 86;
    continue;
  }
  const args = isWindows ? ['/d', '/c', 'corepack', 'pnpm', 'run', stage] : ['pnpm', 'run', stage];
  const result = spawnSync(corepack, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    exitCode ||= 1;
  } else if (result.status !== 0) {
    exitCode ||= result.status ?? 1;
  }
}

if (exitCode !== 0) console.error(`[ci-gate] failed with exit code ${exitCode}`);
else console.log('[ci-gate] all stages passed');
process.exit(exitCode);
