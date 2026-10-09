import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {cleanupOwnedPreview,recordPreviewDeployment,cleanupPreviewResources} from './platform-cleanup.mjs'
process.chdir(fileURLToPath(new URL('../../../',import.meta.url)))
function fixture(){
 const evidence=resolve('services/api/target/preview-platform-'+randomUUID()+'/evidence'),envFile=join(evidence,'ingress/compose.env'),nonce=randomUUID(),project='codeless-preview-test-'+randomUUID()
 mkdirSync(join(evidence,'ingress'),{recursive:true});writeFileSync(envFile,'explicit fixture never passed to Docker')
 recordPreviewDeployment(evidence,project,{envFile},nonce);return {evidence,nonce,project}
}
for(const mode of ['normal','down-nonzero','down-throws','truncated','invalid-ids','wrong-nonce','immutable'])test('independent trusted project cleanup: '+mode,()=>{
 const f=fixture(),calls=[];const docker=(cmd,args)=>{calls.push(args);assert.equal(cmd,'docker');if(args.includes('down')){if(mode==='down-throws')throw Error('down unavailable');return {status:mode==='down-nonzero'?7:0,stdout:''}}return {status:0,stdout:mode==='truncated'?'x'.repeat(32769):mode==='invalid-ids'?'UNKNOWN':''}}
 if(mode==='wrong-nonce'){assert.throws(()=>cleanupOwnedPreview(f.evidence,randomUUID(),docker));assert.equal(calls.length,0);return}
 if(mode==='immutable'){const before=readFileSync(join(f.evidence,'cleanup-owner.json'));assert.throws(()=>recordPreviewDeployment(f.evidence,f.project,{envFile:join(f.evidence,'ingress/compose.env')},f.nonce));assert.deepEqual(readFileSync(join(f.evidence,'cleanup-owner.json')),before)}
 const r=cleanupOwnedPreview(f.evidence,f.nonce,docker);assert.equal(calls.length,3);assert.equal(r.complete,['normal','immutable'].includes(mode))
 for(const args of calls)assert.ok(args.includes(f.project)||args.includes('label=com.docker.compose.project='+f.project))
 if(['truncated','invalid-ids'].includes(mode)){assert.equal(r.containers.remaining,null);assert.equal(r.networks.remaining,null)}
})
for(const mode of ['multiple-close-failures','compose-failure','query-unknown'])test('every resource cleanup is attempted and failures stay failures: '+mode,async()=>{
 const calls=[],project='codeless-preview-test-'+randomUUID();const r=await cleanupPreviewResources({browser:{close:async()=>{calls.push('browser');if(mode==='multiple-close-failures')throw Error('browser')}},tls:{},closeServer:async()=>{calls.push('tls');if(mode==='multiple-close-failures')throw Error('tls')},runtime:{close:async()=>{calls.push('runtime');if(mode==='multiple-close-failures')throw Error('runtime')}},deployment:{},project,compose:()=>{calls.push('down');return {status:mode==='compose-failure'?7:0}},runDocker:()=>({status:mode==='query-unknown'?null:0,stdout:''})})
 assert.deepEqual(calls,['browser','tls','runtime','down']);assert.equal(r.report.complete,false);assert.ok(r.failures.length>0)
 if(mode==='query-unknown'){assert.equal(r.report.resources.containers.remaining,null);assert.equal(r.report.resources.networks.remaining,null)}
})

for(const hung of ['browser','tls','runtime'])test('never-settling '+hung+' close times out and still reaches down',async()=>{
 const calls=[],close=stage=>{calls.push(stage);return stage===hung?new Promise(()=>{}):Promise.resolve()}
 const r=await cleanupPreviewResources({browser:{close:()=>close('browser')},tls:{},closeServer:()=>close('tls'),runtime:{close:()=>close('runtime')},deployment:{},project:'codeless-preview-test-'+randomUUID(),compose:()=>{calls.push('down');return {status:0}},runDocker:()=>({status:0,stdout:''}),closeTimeoutMs:20})
 assert.deepEqual(calls,['browser','tls','runtime','down']);assert.equal(r.report.complete,false);assert.equal(r.report.steps.find(s=>s.name===hung).state,'TIMEOUT');assert.equal(r.failures[0].name,'TimeoutError')
})
