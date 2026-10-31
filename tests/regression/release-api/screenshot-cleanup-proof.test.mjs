import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confirmedStoppedCleanup } from '../../../services/runner/src/screenshot/capture.mjs'
test('closed owned worker with an ungranted launch permit proves no browser was forked', () => {
  for (const terminated of [{code:128,confirmed:false},{code:1,confirmed:false},{timeout:true,confirmed:false},null])
    assert.equal(confirmedStoppedCleanup({childClosed:true,terminated,launchPermitGranted:false}),true)
})
test('granted or unknown launch without native/closed-browser proof remains unconfirmed', () => {
  for (const launchPermitGranted of [true,undefined])
    for (const terminated of [{code:128,confirmed:false},{code:1,confirmed:false},{timeout:true,confirmed:false},null])
      assert.equal(confirmedStoppedCleanup({childClosed:true,terminated,launchPermitGranted}),false)
})
test('native cleanup or explicit closed-browser evidence is accepted only after child close', () => {
  for (const proof of [{terminated:true},{terminated:{confirmed:true}},{browserClosed:true}]) {
    assert.equal(confirmedStoppedCleanup({childClosed:true,launchPermitGranted:true,...proof}),true)
    assert.equal(confirmedStoppedCleanup({childClosed:false,launchPermitGranted:true,...proof}),false)
  }
})
