import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {randomUUID} from 'node:crypto'

assert.equal(process.platform,'win32','Windows native process lifecycle regression requires Windows')
const directory=resolve('.local-data/d10-a/collector-lifecycle-tests-'+randomUUID())
mkdirSync(directory,{recursive:true})
for(const mode of ['start-gap','parent-error','cancel-error','pipeline-stop','timeout','child-success','child-nonzero','cleanup-nonzero','both-fail','cleanup-throws','invalid-owner','missing-owner','report-write-error','lifecycle-write-error']) {
  test('collector stops its process tree and preserves outcome: '+mode,()=>{
    const output=join(directory,mode)
    const arguments_=['-NoProfile','-File','tests/agent/repair/fixtures/collector-lifecycle.ps1','-Mode',mode,'-Output',output]
    if(process.env.CODELESS_COLLECTOR_TEST_SOURCE)arguments_.push('-SourcePath',process.env.CODELESS_COLLECTOR_TEST_SOURCE)
    const run=spawnSync('pwsh',arguments_,
      {encoding:'utf8',timeout:25000,windowsHide:true})
    assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr)
    const observed=JSON.parse(readFileSync(join(output,'observed.json'),'utf8').replace(/^\uFEFF/,''))
    assert.equal(observed.parentExited,true)
    assert.equal(observed.childAlive,false,'Dispose must not leave the owned child alive')
    assert.equal(observed.grandchildAlive,false,'the owned descendant must also stop')
    assert.equal(observed.downCalls,['start-gap','invalid-owner','missing-owner'].includes(mode)?0:1)
    if(mode==='pipeline-stop'){assert.equal(observed.pipelineState,'Stopped');assert.equal(observed.lifecycle.primaryOutcome,'INTERRUPTED')}
    else assert.equal(observed.parentExit,['child-nonzero','both-fail','cleanup-throws','lifecycle-write-error'].includes(mode)?7:1)
    // No network was collected in this isolated process fixture: even child0 must keep collector failure.
    if(mode==='lifecycle-write-error'){assert.equal(observed.lifecycle,null);return}
    assert.equal(observed.lifecycle?.process?.terminated,true)
    if(mode==='cleanup-nonzero')assert.equal(observed.lifecycle.resources.downExitCode,8)
    if(mode==='both-fail'){assert.equal(observed.lifecycle.resources.downExitCode,8);assert.equal(observed.lifecycle.childExitCode,7)}
    if(mode==='cleanup-throws'){assert.equal(observed.lifecycle.resources.state,'DOWN_UNAVAILABLE');assert.equal(observed.lifecycle.cleanupFailed,true)}
    if(mode==='invalid-owner')assert.equal(observed.lifecycle.resources.state,'OWNERSHIP_REJECTED')
    if(mode==='missing-owner')assert.equal(observed.lifecycle.resources.state,'NOT_CREATED')
    if(mode==='parent-error')assert.equal(observed.lifecycle.primaryExceptionType,'InvalidOperationException')
    if(mode==='cancel-error')assert.equal(observed.lifecycle.primaryExceptionType,'OperationCanceledException')
    if(mode==='timeout')assert.equal(observed.lifecycle.collectorTimedOut,true)
    if(mode==='report-write-error')assert.equal(observed.lifecycle.primaryExceptionType,'NotSupportedException')
    console.log(JSON.stringify({mode,report:join(output,'observed.json'),parentExit:observed.parentExit,childAlive:observed.childAlive,grandchildAlive:observed.grandchildAlive,downCalls:observed.downCalls}))
  })
}
