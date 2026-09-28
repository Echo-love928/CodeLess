import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkConfig } from '../../infra/check-config.mjs';

const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');

function withoutSetting(source, key) {
  const line = new RegExp(`^${key}=[^\\r\\n]*(?:\\r?\\n|$)`, 'm');
  assert.match(source, line);
  return source.replace(line, '');
}

test('keyless local example has all required environment settings', () => {
  const values = checkConfig(example);
  assert.equal(values.get('CODELESS_MODEL_API_KEY'), '');
  assert.equal(values.get('CODELESS_PLATFORM_SIGNING_KEY'), '');
  assert.equal(values.get('CODELESS_STORAGE_DIR'), './.local-data');
});

test('missing and conflicting configuration fails clearly with LF and CRLF', () => {
  for (const source of [example, example.replace(/\r?\n/g, '\r\n')]) {
    assert.throws(() => checkConfig(withoutSetting(source, 'POSTGRES_PASSWORD')), /POSTGRES_PASSWORD/);
    assert.throws(() => checkConfig(withoutSetting(source, 'CODELESS_PREVIEW_DOMAIN')), /CODELESS_PREVIEW_DOMAIN/);
    assert.throws(() => checkConfig(source.replace('CODELESS_PREVIEW_PORT=18081', 'CODELESS_PREVIEW_PORT=18080')), /distinct/);
  }
});

test('runner stays without a host port and excludes platform secrets', () => {
  const compose = readFileSync(new URL('../../infra/compose.dev.yml', import.meta.url), 'utf8');
  const runner = compose.split(/^  runner:\s*$/m)[1].split(/^volumes:/m)[0];
  assert.doesNotMatch(runner, /^    ports:/m);
  assert.match(runner, /networks: \[runner-internal\]/);
  assert.doesNotMatch(runner, /CODELESS_PLATFORM_SIGNING_KEY|CODELESS_MODEL_API_KEY|docker\.sock/);
});
