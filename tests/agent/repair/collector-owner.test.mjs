import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync,readFileSync,existsSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {recordCaptureOwner} from './preview-http-observe.mjs'

function fixture(){
  const id=randomUUID(),root=resolve('services/api/target/preview-platform-'+randomUUID()),evidence=join(root,'evidence')
  const output=resolve('.local-data/d10-a/collector-owner-test-'+randomUUID()),path=join(output,'capture-owner-'+id+'.json')
  mkdirSync(join(evidence,'ingress'),{recursive:true});mkdirSync(output,{recursive:true})
  writeFileSync(join(evidence,'ingress/nginx.conf'),'proxy_pass http://host.docker.internal:12345;\n')
  const project='codeless-preview-test-'+randomUUID(),envFile=join(evidence,'ingress/compose.env')
  return {id,root,evidence,path,project,envFile,args:['compose','--project-name',project,'--env-file',envFile,'up','-d'],
    env:{CODELESS_REPAIR_CAPTURE_ID:id,CODELESS_REPAIR_CAPTURE_OWNER_FILE:path}}
}
test('trusted mock harness records exact project, root, environment and capture binding before up',()=>{
  const f=fixture();recordCaptureOwner(f.evidence,f.args,f.env)
  assert.deepEqual(JSON.parse(readFileSync(f.path,'utf8')),{captureId:f.id,project:f.project,root:f.root,envFile:f.envFile,apiPort:12345})
})
test('existing owner is immutable; a second up cannot overwrite its project binding',()=>{
  const f=fixture();recordCaptureOwner(f.evidence,f.args,f.env);const before=readFileSync(f.path)
  assert.throws(()=>recordCaptureOwner(f.evidence,f.args,f.env),{code:'EEXIST'});assert.deepEqual(readFileSync(f.path),before)
})
test('foreign environment path and project reject before any witness is created',()=>{
  const f=fixture(),bad=[...f.args];bad[4]=join(f.evidence,'foreign.env')
  assert.throws(()=>recordCaptureOwner(f.evidence,bad,f.env));assert.equal(existsSync(f.path),false)
  bad[4]=f.envFile;bad[2]='other-project'
  assert.throws(()=>recordCaptureOwner(f.evidence,bad,f.env));assert.equal(existsSync(f.path),false)
})
test('outside private output or mismatched capture filename cannot acquire cleanup authority',()=>{
  const f=fixture()
  assert.throws(()=>recordCaptureOwner(f.evidence,f.args,{...f.env,CODELESS_REPAIR_CAPTURE_OWNER_FILE:join(f.root,'capture-owner-'+f.id+'.json')}))
  assert.throws(()=>recordCaptureOwner(f.evidence,f.args,{...f.env,CODELESS_REPAIR_CAPTURE_OWNER_FILE:f.path+'.other'}))
  assert.equal(existsSync(f.path),false)
})
