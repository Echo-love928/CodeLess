import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = resolve(import.meta.dirname, '..');
const kinds = ['application', 'task', 'event', 'build', 'version', 'publication', 'task-diagnostics'];
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validators = new Map();
for (const kind of kinds) {
  const schema = readJson(`contracts/schemas/v0/${kind}.schema.json`);
  validators.set(kind, ajv.compile(schema));
}

function validateFixtures(selectedKinds = kinds) {
  for (const kind of selectedKinds) {
    const validate = validators.get(kind);
    const valid = readJson(`contracts/examples/v0/valid/${kind}.json`);
    const invalid = readJson(`contracts/examples/v0/invalid/${kind}.json`);
    if (!validate(valid)) {
      throw new Error(`${kind} valid fixture failed: ${ajv.errorsText(validate.errors)}`);
    }
    if (validate(invalid)) {
      throw new Error(`${kind} invalid fixture unexpectedly passed`);
    }
    if (kind === 'application') {
      if (!validate.errors?.some(error => error.instancePath === '/template')) {
        throw new Error('application invalid fixture must reject the unsupported template');
      }
      const draft = readJson('contracts/examples/v0/valid/application-draft.json');
      if (!validate(draft)) {
        throw new Error(`application draft response failed: ${ajv.errorsText(validate.errors)}`);
      }
    }
    console.log(`${kind}: valid accepted; invalid rejected`);
  }
}

function validateOpenApiSurface() {
  const api = readJson('contracts/openapi.v0.json');
  const requiredPaths = [
    '/api/health',
    '/api/v0/auth/csrf',
    '/api/v0/auth/login',
    '/api/v0/auth/me',
    '/api/v0/auth/logout',
    '/api/v0/admin/session',
    '/api/v0/applications',
    '/api/v0/tasks',
    '/api/v0/tasks/{taskId}/events',
    '/api/v0/builds/{buildId}',
    '/api/v0/versions/{versionId}',
    '/api/v0/publications'
  ];
  for (const path of requiredPaths) {
    if (!api.paths[path]) throw new Error(`OpenAPI path missing: ${path}`);
  }
  if (!api.paths['/api/v0/applications'].get
      || !api.paths['/api/v0/applications/{applicationId}'].patch) {
    throw new Error('application pagination or rename operation missing');
  }
  const serialized = JSON.stringify(api);
  for (const kind of [...kinds, 'error']) {
    if (!serialized.includes(`./schemas/v0/${kind}.schema.json`)) {
      throw new Error(`OpenAPI does not reference ${kind} schema`);
    }
  }
  const sessionCookie = api.components?.securitySchemes?.sessionCookie;
  if (sessionCookie?.type !== 'apiKey' || sessionCookie.in !== 'cookie' || sessionCookie.name !== 'JSESSIONID') {
    throw new Error('host-only session cookie security scheme missing');
  }
  if (api.security?.length !== 1 || api.security[0].sessionCookie === undefined) {
    throw new Error('global session cookie authentication missing');
  }
  if (api.components.securitySchemes.bearerAuth || serialized.includes('bearerAuth')) {
    throw new Error('obsolete bearer authentication remains');
  }
  if (api.paths['/api/health'].get.security?.length !== 0) throw new Error('health must be explicitly public');
  if (api.paths['/api/v0/auth/csrf'].get.security?.length !== 0
      || api.paths['/api/v0/auth/login'].post.security?.length !== 0) {
    throw new Error('CSRF bootstrap and login must allow anonymous sessions');
  }
  for (const [path, item] of Object.entries(api.paths)) {
    if (!path.startsWith('/api/v0/')) continue;
    for (const method of ['post', 'put', 'patch', 'delete']) {
      const operation = item[method];
      if (!operation) continue;
      const parameters = [...(item.parameters ?? []), ...(operation.parameters ?? [])];
      if (!parameters.some(parameter => parameter.$ref === '#/components/parameters/CsrfToken')
          || !operation.responses?.['403']) {
        throw new Error(`CSRF header or failure response missing: ${method.toUpperCase()} ${path}`);
      }
    }
  }
  for (const [path, method] of [['/api/v0/auth/me', 'get'], ['/api/v0/auth/logout', 'post'],
    ['/api/v0/admin/session', 'get'], ['/api/v0/applications', 'post'],
    ['/api/v0/tasks', 'post'], ['/api/v0/publications', 'post']]) {
    if (api.paths[path][method].security?.length === 0) {
      throw new Error(`authenticated operation is public: ${method.toUpperCase()} ${path}`);
    }
  }
  console.log('OpenAPI surface and authentication boundary passed');
}

function validateRunnerBoundary() {
  validateFixtures(['build', 'version']);
  const buildSchema = readJson('contracts/schemas/v0/build.schema.json');
  const fields = Object.keys(buildSchema.properties);
  for (const unsafe of ['command', 'shell', 'dependencies', 'dockerSocket', 'secrets']) {
    if (fields.includes(unsafe)) throw new Error(`build contract exposes unsafe field: ${unsafe}`);
  }
  const architecture = readFileSync(resolve(root, 'docs/architecture.md'), 'utf8');
  for (const boundary of ['任意 shell', '宿主 Docker socket', '平台密钥']) {
    if (!architecture.includes(boundary)) throw new Error(`runner boundary is undocumented: ${boundary}`);
  }
  console.log('runner contract boundary passed');
}

function validateFlow() {
  validateFixtures();
  const application = readJson('contracts/examples/v0/valid/application.json');
  const task = readJson('contracts/examples/v0/valid/task.json');
  const event = readJson('contracts/examples/v0/valid/event.json');
  const build = readJson('contracts/examples/v0/valid/build.json');
  const version = readJson('contracts/examples/v0/valid/version.json');
  const publication = readJson('contracts/examples/v0/valid/publication.json');

  const assertions = [
    [task.applicationId === application.id, 'task must belong to application'],
    [event.taskId === task.id, 'event must belong to task'],
    [build.taskId === task.id, 'build must belong to task'],
    [build.versionId === version.id, 'build must target version'],
    [version.buildId === build.id, 'verified version must reference successful build'],
    [version.applicationId === application.id, 'version must belong to application'],
    [application.latestReadyVersionId === version.id, 'latest ready version must be verified fixture'],
    [publication.applicationId === application.id, 'publication must belong to application'],
    [publication.versionId === version.id, 'publication must target version'],
    [version.status === 'VERIFIED' && build.status === 'SUCCEEDED' && build.exitCode === 0,
      'publication target needs a verified version backed by a zero-exit build']
  ];
  for (const [passed, message] of assertions) if (!passed) throw new Error(message);
  console.log('cross-resource READY/publication flow passed');
}

const mode = process.argv[2] ?? 'all';
try {
  if (mode === 'all') {
    validateFixtures();
    validateOpenApiSurface();
    validateRunnerBoundary();
    validateFlow();
  } else if (mode === 'runner') {
    validateRunnerBoundary();
  } else if (mode === 'flow') {
    validateOpenApiSurface();
    validateFlow();
  } else {
    throw new Error(`unknown validation mode: ${mode}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
