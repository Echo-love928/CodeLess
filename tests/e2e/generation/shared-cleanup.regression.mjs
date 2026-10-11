import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
process.chdir(fileURLToPath(new URL('../../../',import.meta.url)))
const scratch=resolve('.local-data/d10-b-shared-cleanup/node-'+randomUUID());mkdirSync(scratch,{recursive:true})
for(const entry of ['tests/e2e/preview/platform.acceptance.mjs','tests/e2e/generation/m1-platform.acceptance.mjs'])for(const mode of ['browser','tls','runtime','diagnostic','primary','success','cleanup-after-success'])test(entry+' preserves failure and always attempts every cleanup: '+mode,()=>{
  const source=readFileSync(entry,'utf8').replaceAll('\r\n','\n'),index=source.lastIndexOf('} finally {\n  try {');assert.ok(index>0)
  const tail=source.slice(index),output=join(scratch,entry.includes('/generation/')?'m1-'+mode:'preview-'+mode);mkdirSync(output,{recursive:true})
  const helper=source.includes('cleanupPreviewResources')?'import {cleanupPreviewResources} from '+JSON.stringify(pathToFileURL(resolve('tests/e2e/generation/platform-cleanup.mjs')).href)+';':''
  const script=helper+'\n'+String.raw`import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';import {join} from 'node:path';
const mode=MODE,output=OUTPUT,calls=[];let caught=null,caughtClass=null,success=['success','cleanup-after-success'].includes(mode),primaryFailure=success?null:new Error('ORIGINAL_SENTINEL');
const fail=(stage)=>{calls.push(stage);if(mode===stage||(mode==='cleanup-after-success'&&stage==='browser'))throw new Error(stage+' failure')};
let browser={close:async()=>fail('browser')},tls={},runtime={close:async()=>fail('runtime'),registry:{stats:()=>({})}},deployment={},page=null;
const project='codeless-preview-test-11111111-1111-1111-1111-111111111111',evidence=output,modelMode='deterministic-mock',diagnostic={snapshot:()=>({})};
const closeServer=async()=>fail('tls'),writeFile=async()=>{if(mode==='diagnostic')throw Error('diagnostic failure')};
const compose=()=>{calls.push('down');return {status:0,stdout:'',stderr:''}},spawnSync=()=>({status:0,stdout:'',stderr:''});
try {try {if(primaryFailure)throw primaryFailure;
`.replace('MODE',JSON.stringify(mode)).replace('OUTPUT',JSON.stringify(output))+tail+String.raw`
}catch(error){caught=error.message;caughtClass=error.constructor.name}
writeFileSync(output+'/observed.json',JSON.stringify({mode,calls,caught,caughtClass,exitCode:process.exitCode??0}));
assert.deepEqual(calls,['browser','tls','runtime','down']);if(primaryFailure)assert.equal(caught,'ORIGINAL_SENTINEL');else if(mode==='cleanup-after-success'){assert.equal(caughtClass,'AggregateError');assert.equal(process.exitCode,1)}else {assert.equal(caught,null);assert.equal(process.exitCode??0,0)}
if(['browser','tls','runtime','diagnostic'].includes(mode))assert.equal(process.exitCode,1);
process.exitCode=0;
`
  const path=join(output,'fixture.mjs');writeFileSync(path,script);const run=spawnSync(process.execPath,[path],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(run.status,0,run.stderr)
})
