import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '../../..');
const git = (...args) => {
  const r = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root });
  if (r.status !== 0) throw Error('git read failed');
  return r.stdout;
};
const origin = git('remote', 'get-url', 'origin').toString().trim();
if (origin !== 'https://github.com/Echo-love928/CodeLess.git') throw Error('Unexpected remote');
const response = await fetch('https://api.github.com/repos/Echo-love928/CodeLess', { headers: { Accept: 'application/vnd.github+json' } });
if (!response.ok) throw Error(`Cannot verify remote: HTTP ${response.status}`);
const repo = await response.json();
if (repo.private !== false || repo.full_name !== 'Echo-love928/CodeLess') throw Error('Remote identity not verified');
const files = git('diff', '--name-only', 'origin/main...HEAD').toString().trim().split(/\r?\n/).filter(Boolean);
const violations = [];
const digests = {};
for (const path of files) {
  if (!/^(services\/api\/|tests\/regression\/api\/|docs\/(defects\.md|handoffs\/D24-A\.md)$)/.test(path)
      || path.includes('/.private/')) violations.push({ path, reason: 'outside task/public scope' });
  const bytes = git('show', `HEAD:${path}`), text = bytes.toString('utf8');
  digests[path] = createHash('sha256').update(bytes).digest('hex');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-[A-Za-z0-9]{24,}/.test(text))
    violations.push({ path, reason: 'credential-like literal' });
  for (const name of ['CODELESS_MODEL_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN']) {
    const value = process.env[name];
    if (value && value.length > 8 && text.includes(value)) violations.push({ path, reason: 'environment credential present' });
  }
}
const result = { checkedAt: new Date().toISOString(), origin, repository: repo.full_name, private: repo.private,
  repositoryUrl: repo.html_url, branch: git('branch', '--show-current').toString().trim(),
  head: git('rev-parse', 'HEAD').toString().trim(), base: git('rev-parse', 'origin/main').toString().trim(),
  initialPushRejected: true, recheckReason: 'Existing public origin; only scoped source, fixture evidence and summaries; no private logs or detected credentials',
  sourceDigests: digests, violations };
writeFileSync(new URL('./evidence/publish-audit.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ origin, repository: repo.full_name, private: repo.private, head: result.head, files: files.length, violations }));
if (violations.length) process.exitCode = 1;
