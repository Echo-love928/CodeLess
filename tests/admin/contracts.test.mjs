import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const url = p => new URL('../../' + p, import.meta.url)
const read = async p => JSON.parse(await readFile(url(p), 'utf8'))
const EVIDENCE = 'tests/admin/evidence/2026-10-20/'
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true }); addFormats(ajv)
ajv.addSchema(await read('contracts/admin/admin.schema.json'), 'admin')
const schema = name => ajv.getSchema(`admin#/$defs/${name}`)
const valid = (name, value) => { const f = schema(name); assert.equal(f(value), true, `${name}: ${JSON.stringify(f.errors)}`) }
const invalid = (name, value, why) => assert.equal(schema(name)(value), false, why)
const clone = v => structuredClone(v)

test('OpenAPI fragment: 7 admin GETs + 1 audited CSRF cancel, session auth, no-store, strict errors', async () => {
  const patch = await read('contracts/admin/openapi.patch.json'), api = await read('contracts/openapi.v0.json')
  const lists = ['users', 'applications', 'tasks', 'deployments', 'model-calls', 'audit'].map(p => `/api/v0/admin/${p}`)
  assert.deepEqual(Object.keys(patch.paths).sort(), [...lists, '/api/v0/admin/metrics', '/api/v0/admin/tasks/{taskId}/cancel'].sort())
  for (const path of [...lists, '/api/v0/admin/metrics']) {
    const get = patch.paths[path].get
    assert.deepEqual(Object.keys(patch.paths[path]), ['get'], path + ' is read-only')
    assert.deepEqual(get.security, [{ sessionCookie: [] }])
    assert.equal(get.responses['200'].headers['Cache-Control'].schema.const, 'no-store')
    for (const status of ['400', '401', '403']) assert.ok(get.responses[status], `${path} ${status}`)
    const names = get.parameters.map(p => p.name)
    if (path.endsWith('metrics')) assert.deepEqual(names, ['from', 'to'])
    else assert.deepEqual(names.slice(0, 2), ['page', 'size'])
    assert.equal(get.parameters.find(p => p.name === 'size')?.schema.maximum ?? 100, 100)
  }
  const cancel = patch.paths['/api/v0/admin/tasks/{taskId}/cancel']
  assert.deepEqual(Object.keys(cancel).sort(), ['parameters', 'post'])
  assert.deepEqual(cancel.post.parameters, [{ $ref: '#/components/parameters/CsrfToken' }])
  assert.equal(cancel.post.requestBody.content['application/json'].schema.$ref, './admin/admin.schema.json#/$defs/CancelRequest')
  assert.deepEqual(Object.keys(cancel.post.responses).sort(), ['200', '400', '401', '403', '404', '503'])
  assert.equal(patch.paths['/api/v0/admin/audit'].get.responses['503'].content['application/json'].schema.$ref, './schemas/v0/error.schema.json')
  // Shared registration is the maintainer's; once registered it must equal this reviewed fragment.
  for (const [path, item] of Object.entries(patch.paths)) if (api.paths[path]) assert.deepEqual(api.paths[path], item, path)
})

test('enum drift guard: every filter value in the fragment is accepted by the Java controller/queries', async () => {
  const patch = await read('contracts/admin/openapi.patch.json')
  const java = (await readFile(url('services/api/src/main/java/dev/codeless/api/admin/AdminController.java'), 'utf8'))
    + (await readFile(url('services/api/src/main/java/dev/codeless/api/admin/AdminQueries.java'), 'utf8'))
  for (const [path, item] of Object.entries(patch.paths)) for (const p of item.get?.parameters ?? []) {
    for (const value of p.schema.enum ?? []) assert.ok(java.includes(`"${value}"`), `${path} ${p.name}=${value} not in Java`)
    assert.ok(java.includes(`"${p.name}"`), `${path} parameter ${p.name} not parsed by the controller`)
  }
})

test('schema invariants reject unknown-as-zero, prompt leakage and impossible states', async () => {
  const t3 = await read(EVIDENCE + 'D17-A-T3.json'), t4 = await read(EVIDENCE + 'D17-A-T4.json')
  const empty = clone(t3.emptyWindow); empty.generation.successRate = 0
  invalid('Metrics', empty, 'denominator 0 must not report a 0% rate')
  const deployment = clone(t3.emptyWindow); deployment.deployment.successRate = 1
  invalid('Metrics', deployment, 'denominator 0 must not report 100%')
  const tokens = clone(t3.metrics); tokens.tokens = clone(t4.tokensMixedWindow); tokens.tokens.totalTokens = 0
  invalid('Metrics', tokens, 'incomplete usage must not give an exact total')
  const call = clone(t4.modelCallPage.items.find(i => i.usage === 'UNKNOWN')); call.totalTokens = 0
  invalid('ModelCall', call, 'unknown usage must not total 0')
  const task = clone(t4.cancel.task); valid('Task', task)
  invalid('Task', { ...task, prompt: 'full prompt' }, 'full prompt must never be a field')
  invalid('Task', { ...task, cancellable: true }, 'a FAILED task is not cancellable')
  invalid('Task', { ...task, promptPreview: 'x'.repeat(42) }, 'preview is capped')
  const audit = clone(t4.cancel.audit); valid('AuditEntry', audit)
  invalid('AuditEntry', { ...audit, outcome: 'UNKNOWN' }, 'UNKNOWN cannot carry a completion')
  invalid('AuditEntry', { ...audit, resultingStatus: 'READY' }, 'a cancel ends FAILED')
  invalid('CancelResponse', { ...clone(t4.cancel), audit: { ...audit, outcome: 'NOT_FOUND' } }, 'NOT_FOUND is a 404, not a 200 body')
  valid('CancelRequest', { reason: 'stuck' })
  for (const body of [{}, { reason: '' }, { reason: 'x'.repeat(201) }, { reason: 'ok', force: true }, { reason: 'tab\tinside' }])
    invalid('CancelRequest', body, JSON.stringify(body))
  const page = await read(EVIDENCE + 'D17-A-04.json')
  invalid('User', { id: page.taskPage.items[0].ownerId, email: 'a@b.test', displayName: 'A', status: 'ACTIVE', role: 'USER',
    applicationCount: 0, createdAt: '2026-10-20T00:00:00Z', passwordHash: '$2a$10$x' }, 'no credential fields')
})

test('real HTTP evidence matches the schema and proves T1–T4 and 04', async () => {
  const names = (await readdir(url(EVIDENCE))).filter(n => /^D17-A-.+\.json$/.test(n)).sort()
  assert.deepEqual(names, ['D17-A-04.json', 'D17-A-T1.json', 'D17-A-T2.json', 'D17-A-T3.json', 'D17-A-T4.json'])
  const t1 = await read(EVIDENCE + 'D17-A-T1.json')
  assert.equal(t1.matrix.length, 8)
  for (const row of t1.matrix) { assert.equal(row.anonymous, 401); assert.equal(row.ordinaryUser, 403) }
  assert.ok(t1.matrix.filter(r => r.method === 'GET').every(r => r.admin === 200))
  assert.equal(t1.matrix.find(r => r.method === 'POST').adminWithoutCsrf, 403)
  assert.ok(t1.pathVariants.every(v => v.status !== 200))
  assert.ok(t1.pathVariants.some(v => v.path === '/api/v0/%61dmin/session' && v.status === 403))
  assert.equal(t1.taskAfterRejectedAttempts.status, 'GENERATE')
  const t2 = (await read(EVIDENCE + 'D17-A-T2.json')).result
  t2.userPages.forEach(p => valid('UserPage', p))
  assert.deepEqual(t2.userPages.map(p => p.items.length), [10, 10, 3])
  assert.equal(new Set(t2.userPages.flatMap(p => p.items.map(i => i.id))).size, 23)
  for (const [name, value] of [['DeploymentPage', t2.deploymentSecondPage], ['TaskPage', t2.taskPage], ['ApplicationPage', t2.applicationPage],
    ['ModelCallPage', t2.modelCallPage], ['UserPage', t2.pageBeyondEnd]]) valid(name, value)
  assert.ok(t2.rejected.length >= 20 && t2.rejected.every(r => r.status === 400 && r.code === 'INVALID_REQUEST'))
  const t3 = await read(EVIDENCE + 'D17-A-T3.json')
  for (const m of [t3.emptyWindow, t3.metrics, t3.afterExtraFailedDeployment, t3.afterExtraReadyTask]) valid('Metrics', m)
  assert.equal(t3.emptyWindow.generation.successRate, null); assert.equal(t3.emptyWindow.deployment.successRate, null)
  assert.equal(t3.metrics.generation.successRate, 0.5714); assert.equal(t3.metrics.deployment.successRate, 0.3333)
  assert.deepEqual(t3.afterExtraFailedDeployment.generation, t3.metrics.generation)
  assert.deepEqual(t3.afterExtraReadyTask.deployment, t3.afterExtraFailedDeployment.deployment)
  assert.ok(t3.drillDown.every(d => d.totalItems === d.metric))
  const t4 = await read(EVIDENCE + 'D17-A-T4.json')
  valid('ModelCallPage', t4.modelCallPage); valid('CancelResponse', t4.cancel); valid('CancelResponse', t4.repeatCancel)
  valid('AuditPage', t4.auditForTask); valid('AuditPage', t4.auditForMissingTask)
  assert.equal(t4.tokensMixedWindow.totalTokens, null); assert.equal(t4.tokensMixedWindow.knownTotalTokens, 150)
  assert.equal(t4.tokensUnknownOnlyWindow.totalTokens, null); assert.equal(t4.tokensKnownOnlyWindow.totalTokens, 12)
  assert.equal(t4.cancel.audit.outcome, 'CANCELLED'); assert.equal(t4.repeatCancel.audit.outcome, 'ALREADY_TERMINAL')
  assert.ok(!JSON.stringify(t4.cancel).includes('sk-live'))
  assert.deepEqual(t4.auditForTask.items.map(i => i.outcome), ['ALREADY_TERMINAL', 'CANCELLED'])
  assert.equal(t4.auditForMissingTask.items[0].outcome, 'NOT_FOUND')
  assert.equal(t4.auditUnavailable.cancelStatus, 503); assert.equal(t4.auditUnavailable.listStatus, 503)
  assert.equal(t4.auditUnavailable.taskAfter.status, 'VERIFY')
  const d04 = await read(EVIDENCE + 'D17-A-04.json')
  valid('TaskPage', d04.taskPage)
  assert.ok(!JSON.stringify(d04).match(/sk-test|hunter2|BEGIN PRIVATE|秘密口令/))
})
