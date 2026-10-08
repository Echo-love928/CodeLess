import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,join,dirname,basename} from 'node:path'
import {fileURLToPath} from 'node:url'

const probe=fileURLToPath(new URL('./fixtures/preview-http-cleanup.mjs',import.meta.url))
for(const [mode,exitCode] of [['success',0],['write-error',1],['capture-throw',1],['capture-nonzero',1],['capture-unknown',1],
  ['parse-invalid',1],['existing-failure',7],['cleanup-nonzero',8],['both-throw',1],['invalid-env',1],['unrelated',0]]){
  test('cleanup forwards the original down and preserves failure: '+mode,()=>{
    const parent=resolve(tmpdir()),evidence=mkdtempSync(join(parent,'codeless-http-cleanup-'))
    try {
      const env={...process.env}
      for(const key of ['CODELESS_MODEL_API_KEY','CODELESS_MODEL_NAME','CODELESS_M1_REAL_APPROVED'])delete env[key]
      const child=spawnSync(process.execPath,[probe,mode,evidence],{env,encoding:'utf8',timeout:10000,windowsHide:true})
      assert.equal(child.error,undefined);assert.equal(child.signal,null)
      const observed=JSON.parse(child.stdout.trim())
      assert.equal(observed.downCalls,1,'diagnostic failures must never bypass cleanup')
      assert.equal(observed.sameArgs,true);assert.equal(observed.sameOptions,true)
      assert.equal(child.status,exitCode);assert.equal(observed.exitCode,exitCode)
      assert.ok(!child.stderr.includes('PRIVATE_DIAGNOSTIC_ERROR'));assert.ok(!child.stderr.includes('PRIVATE_CLEANUP_ERROR'))
      assert.equal(observed.logsCalls,['invalid-env','unrelated'].includes(mode)?0:1)
      if(mode==='both-throw')assert.equal(observed.dispatchError.code,'CLEANUP_THROW')
      else {assert.equal(observed.dispatchError,null);assert.equal(observed.sameResult,true);assert.equal(observed.returnedStatus,mode==='cleanup-nonzero'?8:0)}
      if(mode==='parse-invalid')assert.equal(observed.report.parseFailure,'INGRESS_DIAGNOSTIC_INVALID')
      if(mode==='capture-unknown')assert.equal(observed.report.captureExitCode,null)
      if(['write-error','capture-throw','existing-failure','both-throw','invalid-env'].includes(mode))assert.ok(child.stderr.includes('Ingress diagnostics could not be captured or persisted.'))
    } finally {
      // Only this freshly created, verified temp directory is removed, through one filesystem API.
      assert.equal(dirname(resolve(evidence)),parent);assert.ok(basename(evidence).startsWith('codeless-http-cleanup-'))
      rmSync(evidence,{recursive:true,force:true})
    }
  })
}
