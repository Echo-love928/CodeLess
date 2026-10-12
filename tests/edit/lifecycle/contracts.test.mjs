import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url)))
const schema = await load('../../../contracts/edit/edit.schema.json')
const ajv = new Ajv2020({strict: true, allErrors: true})
addFormats(ajv)
ajv.addSchema(await load('../../../contracts/schemas/v0/task.schema.json'),'https://codeless.dev/contracts/schemas/v0/task.schema.json')
ajv.addSchema(schema)
const check = kind => ajv.getSchema(`${schema.$id}#/$defs/${kind}`)
const id='11111111-1111-4111-8111-111111111111'
test('CHAT request is closed and refuses publication, component claims and malformed provenance', () => {
  const request={baseVersionId:id,prompt:'修改介绍',source:{type:'CHAT',messageId:'chat-12'}}
  assert.equal(check('request')(request),true)
  for(const invalid of [{...request,baseVersionId:'1-1-1-1-1'},{...request,prompt:' '},{...request,publish:true},
    {...request,source:{type:'COMPONENT',componentId:'profile'}},{...request,source:{type:'CHAT',messageId:'../forged'}},
    {...request,source:{type:'CHAT',sourceFile:'../secret'}},{...request,source:{type:'CHAT',messageId:null}}])
    assert.equal(check('request')(invalid),false)
})
test('proposed component reference uses version-scoped source files and has no DOM-instance field', () => {
  const value={componentId:'profile_card',sourceFile:'src/components/ProfileCard.vue',versionId:id}
  assert.equal(check('componentReferenceProposal')(value),true)
  for(const invalid of [{...value,sourceFile:'../secret'},{...value,versionId:'current'},{...value,instanceId:'dom-1'},
    {...value,sourceFile:'src/data/config.ts'},{...value,componentId:''}]) assert.equal(check('componentReferenceProposal')(invalid),false)
})
test('additive routes require authenticated session, POST CSRF and normal errors',async () => {
  const patch=await load('../../../contracts/edit/openapi.patch.json')
  assert.equal(Object.keys(patch.paths).length,2)
  for(const route of Object.values(patch.paths)) for(const method of ['get','post']) if(route[method]) {
    const op=route[method];assert.deepEqual(op.security,[{sessionCookie:[]}])
    for(const status of ['400','401','404']) assert.equal(op.responses[status].content['application/json'].schema.$ref,'./schemas/v0/error.schema.json')
    if(method==='post') assert.equal(op.parameters.find(p=>p.name==='X-CSRF-Token').required,true)
  }
})
test('actual acceptance responses and conflict retention conform to existing task and error schemas',async () => {
  const evidence=name=>load(`./evidence/2026-10-12/${name}.json`)
  const t1=await evidence('D12-A-T1'),t2=await evidence('D12-A-T2'),t3=await evidence('D12-A-T3'),t4=await evidence('D12-A-T4')
  assert.equal(check('response')(t1.edit),true,JSON.stringify(check('response').errors))
  assert.equal(t1.realPostgresDockerChromium,true);assert.equal(t1.publications,0)
  assert.notEqual(t1.versionId,t1.baseVersionId);assert.equal(t1.draft.status,'DRAFT')
  ajv.addSchema(await load('../../../contracts/schemas/v0/error.schema.json'))
  const error=ajv.getSchema('https://codeless.dev/contracts/v0/error.schema.json')
  assert.equal(error(t2.response),true,JSON.stringify(error.errors));assert.equal(t2.httpStatus,409)
  assert.equal(t2.response.details.sourceType,'CHAT');assert.ok(t2.response.details.prompt)
  assert.equal(t3.statuses.filter(s=>s===202).length,1);assert.equal(t3.statuses.filter(s=>s===409).length,7)
  assert.equal(t4.cancel.failureCode,'CANCELLED');assert.equal(t4.originalSourceAndPreviewHttpStatus,200)
})
