import test from 'node:test'
import './cover-contract.cases.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
const read=async p=>JSON.parse(await readFile(new URL('../../'+p,import.meta.url),'utf8'))
const ajv=new Ajv({allErrors:true,strict:true,allowUnionTypes:true});addFormats(ajv)

test('shared OpenAPI registers every deployment route and the strict request',async()=>{
  const api=await read('contracts/openapi.v0.json'),patch=await read('contracts/deploy/openapi.patch.json')
  for(const [path,item] of Object.entries(patch.paths)) assert.deepEqual(api.paths[path],item)
  assert.deepEqual(api.components.schemas.CreatePublicationRequest,{$ref:'./deploy/request.schema.json'})
})
test('strict request, key and owner-publication contract',async()=>{
  const schema=await read('contracts/deploy/request.schema.json'),validate=ajv.compile(schema)
  const request={applicationId:'11111111-1111-4111-8111-111111111111',versionId:'55555555-5555-4555-8555-555555555555',artifactDigest:'sha256:'+'a'.repeat(64)}
  assert.equal(validate(request),true)
  for(const body of [{...request,url:'https://127.0.0.1'},{...request,artifactDigest:null},{applicationId:request.applicationId,versionId:request.versionId}]) assert.equal(validate(body),false)
  const patch=await read('contracts/deploy/openapi.patch.json'),post=patch.paths['/api/v0/publications'].post
  assert.equal(post.parameters[0].$ref,'#/components/parameters/CsrfToken')
  const key=post.parameters.find(p=>p.name==='Idempotency-Key');assert.equal(key.required,true)
  assert.equal(new RegExp(key.schema.pattern).test('../escape'),false)
  assert.equal(Object.keys(patch.paths).length,4)
})
test('actual deployment state and HTTP panel evidence match schemas; hosting fixture is explicit',async()=>{
  const deploy=ajv.compile(await read('contracts/deploy/deployment.schema.json')),list=ajv.compile(await read('contracts/deploy/list.schema.json'))
  const evidence='tests/deploy/evidence/2026-10-14/verified/'
  const t2=await read(evidence+'D15-A-T2.json'),t4=await read(evidence+'D15-A-T4.json')
  assert.equal(t2.hostingProvider,'explicit-fixture-not-public-hosting')
  for(const d of [t2.deployment,...t4.failedCases.map(c=>c.deployment)]) assert.equal(deploy(d),true,JSON.stringify(deploy.errors))
  assert.equal(list(t4.panel),true,JSON.stringify(list.errors));assert.equal(t4.realPublicHosting,false)
  assert.equal(t2.deployment.phase,'SUCCEEDED')
  assert.deepEqual(t2.deployment.history.map(e=>e.phase),['PREPARING','PUBLISHING','PROBING','SUCCEEDED'])
  for(const c of t4.failedCases){assert.equal(c.deployment.phase,'FAILED');assert.equal(c.deployment.publication.url,null);assert.equal(c.deployment.latestSuccessful.id,t4.panel.latestSuccessful.id)}
  assert.equal(deploy({...t2.deployment,phase:'INVENTED_SUCCESS'}),false)
})
