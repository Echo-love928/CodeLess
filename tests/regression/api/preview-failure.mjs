import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const name = process.argv[2];
if (!/^preview-platform-[0-9a-f-]{36}$/.test(name ?? '')) throw Error('Expected this run\'s preview-platform fixture name');
const root = join(import.meta.dirname, '../../../services/api/target', name, 'evidence');
const files = ['ingress-api-timings.json', 'platform-diagnostics.json'];
const data = Object.fromEntries(files.map(name => [name, readFileSync(join(root, name))]));
const ingress = JSON.parse(data[files[0]]), diagnostics = JSON.parse(data[files[1]]);
const pick = (value, fields) => Object.fromEntries(fields.filter(k => k in value).map(k => [k, value[k]]));
const result = { fixture: name, captureExitCode: ingress.captureExitCode, instrumented: ingress.instrumented,
  truncated: ingress.truncated, platformSuccess: diagnostics.success, modelProvider: diagnostics.modelMode,
  registryHealthy: diagnostics.registry?.healthy ?? null,
  originalHashes: Object.fromEntries(files.map(p => [p, createHash('sha256').update(data[p]).digest('hex')])),
  failures: ingress.entries.filter(e => e.kind === 'ingress.error').map(e => pick(e, ['kind', 'route', 'phase', 'errorClass', 'errno', 'timedOut'])),
  failedResponses: ingress.entries.filter(e => Number(e.status) >= 500).map(e => pick(e,
    ['kind', 'route', 'at', 'status', 'requestSeconds', 'connectSeconds', 'headerSeconds', 'responseSeconds', 'upstreamStatus'])),
  source: 'Unmodified real ingress/API fixture diagnostics; no headers, bodies, cookies, credentials, query strings or private upstream addresses exported',
  disposition: 'Original API gate remains FAILED. No retry or API/runner/timeout/isolation change.' };
writeFileSync(new URL('./evidence/preview-502.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
