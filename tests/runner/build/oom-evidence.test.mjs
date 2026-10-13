import assert from 'node:assert/strict'
import { test } from 'node:test'
import { oomEventEvidence } from '../../../services/runner/src/build/oom-evidence.mjs'
const id = 'a'.repeat(64)
const event = { Type: 'container', Action: 'oom', Actor: { ID: id, Attributes: { secret: 'must-not-be-reported' } }, time: 1791805727 }
test('OOM requires same-container daemon evidence and drops all attributes', () => {
  assert.deepEqual(oomEventEvidence(JSON.stringify(event), id), { status: 'OBSERVED', events: [{ containerId: id, action: 'oom', time: event.time }] })
  for (const value of [{ ...event, Action: 'kill' }, { ...event, Type: 'image' }, { ...event, Actor: { ID: 'b'.repeat(64) } }, { ...event, time: null }])
    assert.deepEqual(oomEventEvidence(JSON.stringify(value), id), { status: 'UNAVAILABLE', events: [] })
})
test('empty evidence remains no OOM; malformed/truncated/over-limit evidence stays unknown', () => {
  assert.deepEqual(oomEventEvidence('', id), { status: 'NO_OOM_EVENT', events: [] })
  for (const raw of ['137', '{"Type":', 'x'.repeat(32769), Array(9).fill(JSON.stringify(event)).join('\n')])
    assert.deepEqual(oomEventEvidence(raw, id), { status: 'UNAVAILABLE', events: [] })
})
