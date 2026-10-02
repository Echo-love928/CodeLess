import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = resolve(import.meta.dirname, '../..');
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const api = read('contracts/openapi.v0.json');
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

test('shared task create contract preserves CSRF and bounds application-scoped idempotency keys', () => {
  const create = api.paths['/api/v0/tasks'].post;
  assert.ok(create.parameters.some(item => item.$ref === '#/components/parameters/CsrfToken'));
  const key = create.parameters.find(item => item.name === 'Idempotency-Key');
  assert.equal(key.required, false);
  assert.equal(key.in, 'header');
  const validate = ajv.compile(key.schema);
  for (const value of ['a', 'request:1_A-b.c', 'a'.repeat(128)]) assert.equal(validate(value), true);
  for (const value of ['', 'a'.repeat(129), 'bad key', '汉字', 'x\n']) assert.equal(validate(value), false);
  assert.ok(create.responses['202']);
  for (const status of ['400', '401', '403', '404', '409']) assert.ok(create.responses[status]);
  assert.equal(create.responses['409'].content['application/json'].schema.allOf[1].properties.code.const, 'IDEMPOTENCY_CONFLICT');
});

test('shared cancel contract has owner identity, CSRF and real terminal task response', () => {
  const item = api.paths['/api/v0/tasks/{taskId}/cancel'];
  assert.deepEqual(item.parameters, [{ $ref: '#/components/parameters/TaskId' }]);
  assert.ok(item.post.parameters.some(param => param.$ref === '#/components/parameters/CsrfToken'));
  assert.equal(item.post.security?.length === 0, false);
  assert.equal(item.post.responses['200'].content['application/json'].schema.$ref, './schemas/v0/task.schema.json');
  for (const status of ['400', '401', '403', '404']) assert.ok(item.post.responses[status]);
});

test('structured diagnostics contract distinguishes absent, empty and actual metadata and rejects unsafe paths/false build success', () => {
  const operation = api.paths['/api/v0/tasks/{taskId}/diagnostics'].get;
  assert.equal(operation.security?.length === 0, false);
  assert.equal(operation.responses['200'].content['application/json'].schema.$ref, './schemas/v0/task-diagnostics.schema.json');
  const validate = ajv.compile(read('contracts/schemas/v0/task-diagnostics.schema.json'));
  const valid = read('contracts/examples/v0/valid/task-diagnostics.json');
  assert.equal(validate(valid), true, ajv.errorsText(validate.errors));
  assert.equal(validate(read('contracts/examples/v0/invalid/task-diagnostics.json')), false);
  assert.equal(validate({ ...valid, files: { available: false, revision: 0, changes: [] }, builds: [] }), true);
  assert.equal(validate({ ...valid, files: { available: true, revision: 1, changes: [] }, builds: [] }), true);
  assert.equal(validate({ ...valid, files: { ...valid.files, available: false } }), false);
  assert.equal(validate({ ...valid, builds: [{ ...valid.builds[0], status: 'SUCCEEDED', exitCode: 0 }] }), false);
  assert.equal(validate({ ...valid, builds: [{ ...valid.builds[0], status: 'FUTURE' }] }), false);
  assert.equal(validate({ ...valid, files: { ...valid.files, changes: Array(41).fill(valid.files.changes[0]) } }), false);
  assert.equal(validate({ ...valid, builds: Array(101).fill(valid.builds[0]) }), false);
  assert.equal(validate({ ...valid, rawLog: 'must not be returned' }), false);
});
