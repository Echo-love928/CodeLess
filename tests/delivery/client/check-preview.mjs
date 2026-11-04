// Browser smoke of the independently built export, served only on loopback.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
const [distArg, output] = process.argv.slice(2);
if (!distArg || !output || existsSync(output)) throw Error('Provide built dist and a new receipt path');
const dist = resolve(distArg);
const server = createServer((req, res) => {
  let target = resolve(dist, '.' + new URL(req.url, 'http://localhost').pathname);
  if (target !== dist && !target.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
  if (!extname(target)) target = resolve(dist, 'index.html');
  try {
    const bytes = readFileSync(target);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(target)] ?? 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const report = { command: ['node', 'tests/delivery/client/check-preview.mjs', distArg, output], builtIndexSha256: createHash('sha256').update(readFileSync(resolve(dist, 'index.html'))).digest('hex'), scope: 'Independent exported dist on loopback static server; not a new production deployment or full CRUD test', checks: [], status: 'FAILED' };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  // Export is static/LocalStorage: it must not need a platform API or external service.
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const [path, text] of [['/', 'CodeLess Showcase'], ['/tasks', '待添加任务。'], ['/catalog', '待添加目录。']]) {
    const response = await page.goto(`http://127.0.0.1:${server.address().port}${path}`);
    if (response.status() !== 200) throw Error('Non-200 route');
    await expect(page.locator('main')).toContainText(text);
    await page.reload();
    await expect(page.locator('main')).toContainText(text);
    report.checks.push({ path, http: 200, renderedAndRefreshed: true, expectedText: text });
  }
  if (errors.length) throw Error(JSON.stringify(errors));
  report.status = 'PASSED';
} catch (error) { report.error = error.message; }
finally { await browser?.close(); await new Promise(done => server.close(done)); }
report.nativeExitCode = report.status === 'PASSED' ? 0 : 1;
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(report.status);
process.exitCode = report.nativeExitCode;
