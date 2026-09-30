import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { basePath, compose } from './prepare-openapi.mjs';

const root = resolve(import.meta.dirname, '../..');
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const path = '/api/v0/tasks/{taskId}/events';
const base = JSON.parse(readFileSync(basePath, 'utf8'));
const candidate = compose(base);
const operation = candidate.paths[path].get;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(read('contracts/schemas/v0/event.schema.json'), 'schemas/v0/event.schema.json');
ajv.addSchema(read('contracts/schemas/v0/error.schema.json'), 'schemas/v0/error.schema.json');

test('scoped patch preserves authentication, path identity and every unrelated operation', () => {
  assert.deepEqual(candidate.security, [{ sessionCookie: [] }]);
  assert.deepEqual(candidate.paths[path].parameters, base.paths[path].parameters);
  const restored = structuredClone(candidate);
  restored.paths[path].get = base.paths[path].get;
  assert.deepEqual(restored, base);
  assert.ok(operation.responses['200'].content['text/event-stream']);
  assert.ok(operation.responses['200'].content['application/json']);
  assert.equal(operation.security?.length === 0, false);
  const drift = structuredClone(base);
  drift.paths[path].get.operationId = 'concurrentMaintainerChange';
  assert.throws(() => compose(drift), /precondition/);
});

test('wire cursor schema rejects UUIDs, padding, signs and int32 overflow; page limits are bounded', () => {
  const cursor = ajv.compile(operation.parameters[1].schema);
  const valid = ['0', '1', '999999999', '1000000000', '1999999999', '2000000000', '2147483647'];
  const invalid = ['', '01', '-1', '+1', ' 1', '1 ', '1\n', '1.0', '1,2', '2147483648', '9999999999', '22222222-2222-4222-8222-222222222222'];
  for (const value of valid) assert.equal(cursor(value), true, value);
  for (const value of invalid) assert.equal(cursor(value), false, value);
  for (let i = 0; i <= 4096; i++) {
    const number = Math.floor(i * 3000000000 / 4096);
    assert.equal(cursor(String(number)), number <= 2147483647, String(number));
  }
  const limit = ajv.compile(operation.parameters[2].schema);
  for (const value of [1, 1000]) assert.equal(limit(value), true);
  for (const value of [0, 1001, 1.5]) assert.equal(limit(value), false);
});

test('documented wire examples match the existing event schema and separate comments/errors from persisted IDs', () => {
  const examples = operation.responses['200'].content['text/event-stream'].examples;
  const [business, heartbeat] = examples.taskEvent.value.trim().split('\n\n');
  const fields = Object.fromEntries(business.split('\n').map(line => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)]));
  const event = JSON.parse(fields.data);
  assert.equal(fields.event, 'task-event');
  assert.equal(fields.id, String(event.sequence));
  assert.notEqual(fields.id, event.id);
  const validate = ajv.getSchema('schemas/v0/event.schema.json');
  assert.equal(validate(event), true, ajv.errorsText(validate.errors));
  assert.match(heartbeat, /^:heartbeat\nretry:1000$/);
  assert.doesNotMatch(heartbeat, /^(id|data|event):/m);
  assert.doesNotMatch(examples.streamError.value, /^id:/m);
  assert.match(examples.streamError.value, /^event:stream-error\n/);
  assert.equal(examples.terminalAtHead.value, '');
  const page = ajv.compile(operation.responses['200'].content['application/json'].schema);
  assert.equal(page([event]), true);
  assert.equal(page([{ ...event, sequence: 0 }]), false);
  assert.equal(page(Array(1001).fill(event)), false);
});

test('pre-stream errors remain JSON and validate their actual codes with the shared error envelope', () => {
  const sample = { code: '', message: 'Request is invalid', timestamp: '2026-09-30T00:00:00Z', path, traceId: 'contract-test' };
  const cases = { '400': ['INVALID_EVENT_ID', 'INVALID_EVENT_LIMIT', 'INVALID_REQUEST'],
    '409': ['EVENT_CURSOR_AHEAD', 'EVENT_BACKLOG_EXCEEDED'], '500': ['INTERNAL_ERROR'], '503': ['EVENT_STREAM_CAPACITY'] };
  for (const [status, codes] of Object.entries(cases)) {
    const content = operation.responses[status].content;
    assert.deepEqual(Object.keys(content), ['application/json']);
    const validate = ajv.compile(content['application/json'].schema);
    for (const code of codes) assert.equal(validate({ ...sample, code }), true, code);
    assert.equal(validate({ ...sample, code: 'WRONG_STATUS_CODE' }), false);
    assert.equal(validate({ code: codes[0] }), false);
  }
  assert.equal(operation.responses['401'].$ref, '#/components/responses/Unauthorized');
  assert.equal(operation.responses['404'].$ref, '#/components/responses/NotFound');
});
