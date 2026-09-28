import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkConfig } from '../../infra/check-config.mjs';

const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');

test('keyless local example has all required environment settings', () => {
  const values = checkConfig(example);
  assert.equal(values.get('CODELESS_MODEL_API_KEY'), '');
  assert.equal(values.get('CODELESS_PLATFORM_SIGNING_KEY'), '');
  assert.equal(values.get('CODELESS_STORAGE_DIR'), './.local-data');
});

test('missing and conflicting configuration fails clearly', () => {
  assert.throws(() => checkConfig(example.replace(/^POSTGRES_PASSWORD=.*\n/m, '')), /POSTGRES_PASSWORD/);
  assert.throws(() => checkConfig(example.replace(/^CODELESS_PREVIEW_DOMAIN=.*\n/m, '')), /CODELESS_PREVIEW_DOMAIN/);
  assert.throws(() => checkConfig(example.replace('CODELESS_PREVIEW_PORT=18081', 'CODELESS_PREVIEW_PORT=18080')), /distinct/);
});

test('runner stays without a host port and excludes platform secrets', () => {
  const compose = readFileSync(new URL('../../infra/compose.dev.yml', import.meta.url), 'utf8');
  const runner = compose.split(/^  runner:\s*$/m)[1].split(/^volumes:/m)[0];
  assert.doesNotMatch(runner, /^    ports:/m);
  assert.match(runner, /networks: \[runner-internal\]/);
  assert.doesNotMatch(runner, /CODELESS_PLATFORM_SIGNING_KEY|CODELESS_MODEL_API_KEY|docker\.sock/);
});
