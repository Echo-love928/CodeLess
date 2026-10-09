// Isolated cleanup fault probe: every child-process call is a stub; no Docker or paid provider.
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import {mkdirSync,existsSync,readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'

const [mode,directory]=process.argv.slice(2),evidence=resolve(directory)
const modes=['success','write-error','capture-throw','capture-nonzero','capture-unknown','parse-invalid','existing-failure','cleanup-nonzero','both-throw','invalid-env','unrelated']
assert.ok(modes.includes(mode))
mkdirSync(join(evidence,'ingress'),{recursive:true})
if(['write-error','existing-failure'].includes(mode))mkdirSync(join(evidence,'ingress-api-timings.json'))
if(mode==='existing-failure')process.exitCode=7
process.env.CODELESS_REPAIR_HTTP_DIAGNOSTICS='1'
process.env.CODELESS_PREVIEW_ACCEPTANCE_MODEL='deterministic-mock'
process.env.CODELESS_PREVIEW_EVIDENCE_DIR=evidence
let logsCalls=0,downCalls=0,sameArgs=false,sameOptions=false
const args=['compose','--project-name',mode==='unrelated'?'other-project':'codeless-preview-test-11111111-1111-1111-1111-111111111111',
  '--file','private-compose.yml','--env-file',join(evidence,mode==='invalid-env'?'other.env':'ingress/compose.env'),'down','--remove-orphans']
const options={encoding:'utf8',windowsHide:true,timeout:60000},downResult={status:mode==='cleanup-nonzero'?8:0,stdout:'',stderr:''}
childProcess.spawnSync=function(command,observedArgs,observedOptions){
  assert.equal(command,'docker')
  if(observedArgs.includes('logs')){
    logsCalls++
    assert.equal(observedOptions.timeout,10000)
    if(['capture-throw','both-throw'].includes(mode))throw new Error('PRIVATE_DIAGNOSTIC_ERROR')
    return {status:mode==='capture-nonzero'?2:mode==='capture-unknown'?null:0,
      stdout:mode==='parse-invalid'?'{"kind":"ingress.api" INVALID':JSON.stringify({kind:'ingress.api',route:'application',status:200}),stderr:''}
  }
  assert.ok(observedArgs.includes('down'));downCalls++;sameArgs=observedArgs===args;sameOptions=observedOptions===options
  if(mode==='both-throw')throw Object.assign(new Error('PRIVATE_CLEANUP_ERROR'),{code:'CLEANUP_THROW'})
  return downResult
}
await import('../preview-http-observe.mjs')
let returned=null,dispatchError=null
try {
  returned=childProcess.spawnSync('docker',args,options)
  // The caller still rejects an actual failed cleanup; the observer must forward its result.
  if(returned.status!==0 && !process.exitCode)process.exitCode=returned.status??1
} catch(error){dispatchError={name:error.name,code:error.code??null};if(!process.exitCode)process.exitCode=1}
const reportPath=join(evidence,'ingress-api-timings.json')
let report=null
if(existsSync(reportPath) && !['write-error','existing-failure'].includes(mode))report=JSON.parse(readFileSync(reportPath,'utf8'))
console.log(JSON.stringify({mode,logsCalls,downCalls,sameArgs,sameOptions,returnedStatus:returned?.status??null,
  sameResult:returned===downResult,dispatchError,exitCode:process.exitCode??0,report}))
