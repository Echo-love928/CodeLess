import test from 'node:test'
import assert from 'node:assert/strict'
import * as bridge from '../../scripts/eval/ssh-hosting-bridge.mjs'
const { validateBridgeJob, fixedRemoteCommand, sshChildEnvironment } = bridge
const now = Date.now(), publicationId = '10000000-0000-4000-8000-000000000001'
const job = () => ({ action: 'publish', deadline: new Date(now + 20000).toISOString(), payload: { publicationId } })
test('publication transport preserves existing closed messages and forbids data selecting commands or hosts', () => {
  assert.equal(validateBridgeJob(job(), 'https://sites.example.test', now), 20000)
  for (const change of [{ command: 'shell' }, { host: 'attacker' }, { action: 'exec' }, { deadline: new Date(now + 60000).toISOString() }])
    assert.throws(() => validateBridgeJob({ ...job(), ...change }, 'https://sites.example.test', now))
})
test('a probe is bound to the configured public origin and exact immutable publication', () => {
  const probe = { ...job(), action: 'probe', url: 'https://d' + publicationId.replaceAll('-', '') + '.sites.example.test/' }
  validateBridgeJob(probe, 'https://sites.example.test', now)
  for (const url of ['http://127.0.0.1/', 'https://other.test/', 'https://sites.example.test/', probe.url + '?redirect=1'])
    assert.throws(() => validateBridgeJob({ ...probe, url }, 'https://sites.example.test', now))
})
test('operator paths/origins are bounded and the fixed command clears the remote environment', () => {
  const c = { hostingRoot: '/srv/codeless/sites', publicOrigin: 'https://sites.example.test', platformOrigin: 'https://app.other.test',
    previewOrigin: 'https://preview.third.test', workerClient: '/opt/codeless/worker-client.py', gatewayEntry: '/srv/codeless/gateway.mjs' }
  assert.match(fixedRemoteCommand(c), /^env -i PATH=/)
  for (const change of [{ hostingRoot: '/srv/../secret' }, { workerClient: '/usr/bin/node;bad' }, { publicOrigin: 'https://site.test/;bad' }])
    assert.throws(() => fixedRemoteCommand({ ...c, ...change }))
})
test('SSH receives only explicit OS identity metadata, never platform secrets or interpreter options', () => {
  const env = sshChildEnvironment({ PATH: 'tools', CODELESS_MODEL_API_KEY: 'never-forward', NODE_OPTIONS: '--bad' },
    { USERNAME: 'operator', USERPROFILE: 'C:/Users/operator' })
  assert.equal(env.USERNAME, 'operator'); assert.equal(env.USERPROFILE, 'C:/Users/operator')
  assert.equal(env.CODELESS_MODEL_API_KEY, undefined); assert.equal(env.NODE_OPTIONS, undefined)
  for (const unsafe of [{ CODELESS_MODEL_API_KEY: 'secret' }, { NODE_OPTIONS: '--bad' }, { SSH_ASKPASS: 'program' }])
    assert.throws(() => sshChildEnvironment({}, unsafe))
})
