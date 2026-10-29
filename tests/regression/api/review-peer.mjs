import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const head = 'b98c02314c77736965cecabaa1df728dfb6c0222';
const peer = join(import.meta.dirname, '.private/peer-base');
const output = join(import.meta.dirname, 'evidence', 'peer-b98c023-' + new Date().toISOString().replaceAll(':', '-'));
mkdirSync(output, { recursive: true });
const git = (...args) => {
  const result = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root });
  if (result.status !== 0) throw Error('git read failed');
  return result.stdout;
};
const component = 'apps/web/src/features/preview/PreviewPanel.vue';
const tests = 'apps/web/src/features/preview/PreviewPanel.test.ts';
const hash = b => createHash('sha256').update(b).digest('hex');
const bytes = path => git('show', `${head}:${path}`);
writeFileSync(join(peer, tests), bytes(tests));
const runs = [];
const requireWeb = createRequire(join(root, 'apps/web/package.json'));
const vitest = join(dirname(requireWeb.resolve('vitest/package.json')), 'vitest.mjs');
for (const mode of ['red', 'green']) {
  writeFileSync(join(peer, component), git('show', `${mode === 'red' ? '5a0f14d' : head}:${component}`));
  const command = process.execPath;
  const args = [vitest, 'run', 'src/features/preview/PreviewPanel.test.ts'];
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, { cwd: join(peer, 'apps/web'), encoding: 'utf8' });
  const log = (result.stdout ?? '') + (result.stderr ?? '');
  writeFileSync(join(output, `${mode}.log`), log);
  runs.push({ mode, command: [command, ...args], startedAt, finishedAt: new Date().toISOString(),
    exitCode: result.status, signal: result.signal, error: result.error?.message ?? null,
    testSha256: hash(readFileSync(join(peer, tests))), componentSha256: hash(readFileSync(join(peer, component))), logSha256: hash(log) });
  console.log(JSON.stringify(runs.at(-1)));
}
const expected = runs[0].exitCode === 1 && runs[1].exitCode === 0 && runs[0].testSha256 === runs[1].testSha256;
writeFileSync(join(output, 'review.json'), JSON.stringify({ head, base: '5a0f14d', runs, expectedRedGreen: expected,
  scope: 'read-only isolated component checkout; mock API + jsdom, no real-browser claim' }, null, 2) + '\n');
if (!expected) process.exitCode = 1;
