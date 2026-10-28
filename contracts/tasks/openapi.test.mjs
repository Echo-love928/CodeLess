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

test('D22 capacity responses cover exactly task-creating endpoints and preserve other 503 failures', () => {
  const paths = ['/api/v0/tasks', '/api/v0/applications/{applicationId}/edits', '/api/v0/applications/{applicationId}/component-edits'];
  const error = read('contracts/schemas/v0/error.schema.json');
  const validator = new Ajv2020({strict: true, allErrors: true}); addFormats(validator);
  validator.addSchema(error, 'schemas/v0/error.schema.json');
  let total = 0;
  for (const [path, item] of Object.entries(api.paths)) for (const [method, operation] of Object.entries(item)) {
    for (const [status, response] of Object.entries(operation?.responses ?? {})) {
      if (!response['x-codeless-capacity-codes']) continue;
      total++;
      assert.equal(method, 'post'); assert.ok(paths.includes(path));
      const codes = status === '429' ? ['APPLICATION_TASK_LIMIT', 'USER_TASK_LIMIT'] : ['TASK_QUEUE_FULL', 'TASK_ADMISSION_BUSY'];
      assert.ok(['429', '503'].includes(status));
      assert.deepEqual(response['x-codeless-capacity-codes'], codes);
      assert.deepEqual(response.headers['Retry-After'].schema, {type: 'string', const: '1'});
      const validate = validator.compile(response.content['application/json'].schema);
      for (const code of codes) {
        const example = response.content['application/json'].examples[code].value;
        assert.equal(example.path, path); assert.equal(example.code, code);
        assert.equal(validate(example), true, validator.errorsText(validate.errors));
        assert.equal(validate({...example, traceId: undefined}), false);
      }
      const example = response.content['application/json'].examples[codes[0]].value;
      assert.equal(validate({...example, code: 'SNAPSHOT_INVALID'}), path !== '/api/v0/tasks' && status === '503');
      assert.equal(validate({...example, code: 'MODEL_CAPACITY_EXCEEDED'}), path !== '/api/v0/tasks' && status === '503');
    }
  }
  assert.equal(total, 6);
  for (const [file, path] of [['contracts/edit/openapi.patch.json', paths[1]], ['contracts/mapping/openapi.patch.json', paths[2]]]) {
    for (const status of ['429', '503']) assert.deepEqual(read(file).paths[path].post.responses[status], api.paths[path].post.responses[status]);
  }
  const patch = read('tests/performance/api/openapi.patch.json');
  assert.equal(patch.length, 6);
  for (const entry of patch) {
    const keys = entry.path.slice(1).split('/').map(x => x.replaceAll('~1', '/').replaceAll('~0', '~'));
    assert.deepEqual(keys.reduce((value, key) => value[key], api), entry.value);
  }
});

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
