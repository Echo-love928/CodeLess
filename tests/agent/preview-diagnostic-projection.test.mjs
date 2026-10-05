import assert from 'node:assert/strict'
import {test} from 'node:test'
import {buildCleanupEvidence,browserCleanupEvidence} from './preview-diagnostic-projection.mjs'
test('cleanup failures cannot export private paths or raw secrets',()=>{
  const privatePath='C:/private-model/runtime/workspaces/not-public'
  const marker='synthetic-private-error-marker'
  const input={containerRemoved:true,workspaceRemoved:false,errors:['EPERM: '+privatePath+' '+marker],extra:marker}
  const result=buildCleanupEvidence(input)
  assert.deepEqual(result,{containerRemoved:true,workspaceRemoved:false,errorCount:1,rawErrorsShared:false})
  assert.ok(!JSON.stringify(result).includes(privatePath));assert.ok(!JSON.stringify(result).includes(marker))
  assert.deepEqual(browserCleanupEvidence({browserClosed:false,error:marker}),{browserClosed:false,processTreeTerminated:null})
})
test('missing cleanup evidence stays unknown',()=>{
  assert.equal(buildCleanupEvidence(null),null);assert.equal(browserCleanupEvidence(undefined),null)
  assert.deepEqual(buildCleanupEvidence({}),{containerRemoved:null,workspaceRemoved:null,errorCount:null,rawErrorsShared:false})
})
