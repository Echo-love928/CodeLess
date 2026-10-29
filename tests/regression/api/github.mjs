// Task-scoped PR bookkeeping; credentials remain in memory and are never persisted or printed.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const mode = process.argv[2];
if (!['peer', 'create', 'status'].includes(mode)) throw Error('Expected peer|create|status');
let token;
if (mode === 'create') {
  const credential = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }
  });
  if (credential.status !== 0) throw Error('GitHub credential helper unavailable');
  token = credential.stdout.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
  if (!token) throw Error('GitHub credential missing');
}
const api = async (path, method = 'GET', body) => {
  const response = await fetch('https://api.github.com/repos/Echo-love928/CodeLess/' + path, {
    method, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) throw Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
  return response.json();
};
const prs = await api('pulls?state=all&per_page=100');
const folder = new URL('./evidence/', import.meta.url);
mkdirSync(folder, { recursive: true });
if (mode === 'peer') {
  const peers = prs.filter(p => /d24-b/i.test(p.head.ref + ' ' + p.title));
  const results = [];
  for (const peer of peers) {
    const files = await api(`pulls/${peer.number}/files?per_page=100`);
    const checks = await api(`commits/${peer.head.sha}/check-runs?per_page=100`);
    results.push({ number: peer.number, url: peer.html_url, title: peer.title, state: peer.state,
      head: peer.head.sha, base: peer.base.sha, branch: peer.head.ref, draft: peer.draft, body: peer.body,
      files: files.map(f => ({ filename: f.filename, status: f.status, patch: f.patch ?? null })),
      checks: checks.check_runs.map(c => ({ name: c.name, status: c.status, conclusion: c.conclusion, head: c.head_sha })) });
  }
  const evidence = { checkedAt: new Date().toISOString(), peers: results };
  writeFileSync(new URL('peer-pr.json', folder), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ checkedAt: evidence.checkedAt, peers: results.map(p => ({ number: p.number, title: p.title, head: p.head, branch: p.branch, files: p.files.map(f => f.filename), checks: p.checks })) }));
  process.exit(0);
}
let pr = prs.find(p => p.head.ref === 'codex/d24-a-api-body-boundary' && p.state === 'open');
if (!pr && mode === 'create') pr = await api('pulls', 'POST', {
  title: 'D24-A：限制 API 请求体，阻止超大 JSON 在校验前消耗资源', head: 'codex/d24-a-api-body-boundary', base: 'main', draft: true,
  body: readFileSync(new URL('./PR-DRAFT.md', import.meta.url), 'utf8')
});
const output = { checkedAt: new Date().toISOString(), pr: pr ? {
  number: pr.number, url: pr.html_url, head: pr.head.sha, base: pr.base.sha, draft: pr.draft
} : null };
if (pr) {
  const checks = await api(`commits/${pr.head.sha}/check-runs?per_page=100`);
  output.checks = checks.check_runs.map(c => ({ name: c.name, status: c.status, conclusion: c.conclusion, head: c.head_sha }));
}
writeFileSync(new URL('pr-status.json', folder), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output));
