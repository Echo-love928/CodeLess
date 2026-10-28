// D22-A is the designated writer for this response-only contract update.
import {readFileSync, writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const file = 'contracts/openapi.v0.json';
let text = readFileSync(file, 'utf8');
const api = JSON.parse(text);
const endpoints = ['/api/v0/tasks', '/api/v0/applications/{applicationId}/edits', '/api/v0/applications/{applicationId}/component-edits'];
const codes = {429: ['APPLICATION_TASK_LIMIT', 'USER_TASK_LIMIT'], 503: ['TASK_QUEUE_FULL', 'TASK_ADMISSION_BUSY']};
const patch = [];
for (const path of endpoints) {
  const operation = api.paths[path].post;
  assert.ok(operation.responses['202']);
  for (const status of ['429', '503']) {
    const old = operation.responses[status];
    if (old?.['x-codeless-capacity-codes']) assert.deepEqual(old['x-codeless-capacity-codes'], codes[status]);
    else if (old) assert.ok(path !== '/api/v0/tasks' && status === '503' && old.content['application/json'].schema.$ref === './schemas/v0/error.schema.json', 'Unexpected existing response; inspect before replacing');
    const example = code => ({value: {code, message: 'Task admission limit reached', timestamp: '2026-10-28T00:00:00Z', path, traceId: 'capacity-example', details: {}}});
    const schema = path !== '/api/v0/tasks' && status === '503' ? {$ref: './schemas/v0/error.schema.json'} : {
      allOf: [{$ref: './schemas/v0/error.schema.json'}, {type: 'object', properties: {code: {enum: codes[status]}}}]
    };
    const response = {
      description: status === '429'
        ? 'APPLICATION_TASK_LIMIT or USER_TASK_LIMIT: active QUEUED + RUNNING limit reached; no task/event inserted. A matching idempotent replay returns the original task without another admission.'
        : 'TASK_QUEUE_FULL (global QUEUED limit) or TASK_ADMISSION_BUSY (admission lock timeout, at most 1 second): no task/event inserted.' + (path === '/api/v0/tasks' ? '' : ' Existing snapshot/storage failures also use 503 and retain their error codes; they do not carry the capacity retry header.'),
      'x-codeless-capacity-codes': codes[status],
      headers: {'Retry-After': {description: 'For the listed capacity codes only: 1 second. Optional for other 503 errors. Preserve the same Idempotency-Key and payload when retrying; retry does not guarantee admission.', schema: {type: 'string', const: '1'}}},
      content: {'application/json': {schema, examples: Object.fromEntries(codes[status].map(code => [code, example(code)]))}}
    };
    operation.responses[status] = response;
    patch.push({op: 'add', path: '/paths/' + path.replaceAll('~', '~0').replaceAll('/', '~1') + '/post/responses/' + status, value: response});
  }
}
// Replace only each touched responses object; do not reformat the rest of the shared contract.
function objectEnd(start) {
  let depth = 0, quoted = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  throw Error('Invalid JSON object');
}
for (const path of endpoints) {
  const pathStart = text.indexOf(JSON.stringify(path) + ':'); assert.ok(pathStart >= 0);
  const key = text.indexOf('"responses"', pathStart), start = text.indexOf('{', key), end = objectEnd(start);
  const indent = text.slice(text.lastIndexOf('\n', key) + 1, key);
  const replacement = JSON.stringify(api.paths[path].post.responses, null, 2).replaceAll('\n', '\n' + indent);
  text = text.slice(0, start) + replacement + text.slice(end);
}
assert.deepEqual(JSON.parse(text), api);
writeFileSync(file, text);
for (const [fragment, path] of [['contracts/edit/openapi.patch.json', endpoints[1]], ['contracts/mapping/openapi.patch.json', endpoints[2]]]) {
  const doc = JSON.parse(readFileSync(fragment, 'utf8'));
  assert.ok(doc.paths[path].post.responses['202']);
  for (const status of ['429', '503']) doc.paths[path].post.responses[status] = structuredClone(api.paths[path].post.responses[status]);
  writeFileSync(fragment, JSON.stringify(doc, null, 2) + '\n');
}
writeFileSync('tests/performance/api/openapi.patch.json', JSON.stringify(patch, null, 2) + '\n');
console.log('D22 capacity responses integrated into public OpenAPI: 3 endpoints, 6 responses.');
