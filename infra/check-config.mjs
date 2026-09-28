import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const required = [
  'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_PORT',
  'CODELESS_DATABASE_URL', 'CODELESS_DATABASE_USER', 'CODELESS_DATABASE_PASSWORD',
  'CODELESS_PLATFORM_DOMAIN', 'CODELESS_PREVIEW_DOMAIN', 'CODELESS_PUBLICATION_DOMAIN',
  'CODELESS_PLATFORM_PORT', 'CODELESS_PREVIEW_PORT', 'CODELESS_PUBLICATION_PORT',
  'CODELESS_STORAGE_DIR'
];

export function checkConfig(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) throw new Error(`invalid environment line: ${line}`);
    values.set(match[1], match[2].trim());
  }
  const missing = required.filter((key) => !values.get(key));
  if (missing.length) throw new Error(`missing required configuration: ${missing.join(', ')}`);
  for (const key of ['POSTGRES_PORT', 'CODELESS_PLATFORM_PORT', 'CODELESS_PREVIEW_PORT', 'CODELESS_PUBLICATION_PORT']) {
    const port = Number(values.get(key));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${key} must be a TCP port`);
  }
  if (new Set(['POSTGRES_PORT', 'CODELESS_PLATFORM_PORT', 'CODELESS_PREVIEW_PORT', 'CODELESS_PUBLICATION_PORT'].map((key) => values.get(key))).size !== 4) {
    throw new Error('local service ports must be distinct');
  }
  if (values.get('CODELESS_DATABASE_USER') !== values.get('POSTGRES_USER') || values.get('CODELESS_DATABASE_PASSWORD') !== values.get('POSTGRES_PASSWORD')) {
    throw new Error('platform database credentials must match the local PostgreSQL service');
  }
  const expectedDatabaseUrl = `jdbc:postgresql://127.0.0.1:${values.get('POSTGRES_PORT')}/${values.get('POSTGRES_DB')}`;
  if (values.get('CODELESS_DATABASE_URL') !== expectedDatabaseUrl) {
    throw new Error(`CODELESS_DATABASE_URL must match ${expectedDatabaseUrl}`);
  }
  return values;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkConfig(readFileSync(process.argv[2] ?? '.env', 'utf8'));
    console.log('development configuration passed');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
