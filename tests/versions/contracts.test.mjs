import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const ajv=new Ajv2020({strict:true,allErrors:true})
addFormats(ajv)
const schema=JSON.parse(await readFile(new URL('../../contracts/versions/response.schema.json',import.meta.url)))
ajv.addSchema(JSON.parse(await readFile(new URL('../../contracts/schemas/v0/version.schema.json',import.meta.url))),
  'https://codeless.dev/contracts/schemas/v0/version.schema.json')
ajv.addSchema(schema)
const validate=kind=>ajv.getSchema(`${schema.$id}#/$defs/${kind}`)
const id='11111111-1111-4111-8111-111111111111',digest='sha256:'+'a'.repeat(64)
test('additive OpenAPI paths preserve the existing detail and public error contract',async()=>{
  const patch=JSON.parse(await readFile(new URL('../../contracts/versions/openapi.patch.json',import.meta.url)))
  const shared=JSON.parse(await readFile(new URL('../../contracts/openapi.v0.json',import.meta.url)))
  assert.equal(Object.keys(patch.paths).length,4)
  assert.equal(patch.paths['/api/v0/versions/{versionId}'],undefined)
  for(const route of Object.values(patch.paths)) {
    assert.deepEqual(Object.keys(route).sort(),['get','parameters'])
    assert.deepEqual(route.get.security,[{sessionCookie:[]}])
    assert.equal(shared.components.securitySchemes.sessionCookie.name,'JSESSIONID')
    assert.match(route.get.responses['200'].content['application/json'].schema.$ref,/^\.\/versions\/response\.schema\.json#/)
    assert.equal(route.get.responses['401'].content['application/json'].schema.$ref,'./schemas/v0/error.schema.json')
  }
})
test('closed file response, text scripts, traversal and false status fixtures',()=>{
  const file={versionId:id,sourceDigest:digest,path:'src/pages/HomePage.vue',bytes:8,digest,content:'<script>alert(1)</script>'}
  assert.equal(validate('file')(file),true)
  for(const invalid of [{...file,path:'../secret'},{...file,bytes:131073},{...file,content:4},{...file,hostPath:'C:/secret'}]) assert.equal(validate('file')(invalid),false)
  assert.equal(validate('list')({items:[],page:0,size:20,total:0}),true)
  assert.equal(validate('list')({items:[],page:0,size:101,total:0}),false)
  assert.equal(validate('snapshot')({versionId:id,status:'VERIFIED',sourceDigest:digest,files:[]}),false)
  assert.equal(validate('snapshot')({versionId:id,status:'READY',sourceDigest:digest,files:[]}),false)
})
test('actual Java/PostgreSQL/Docker/Chromium acceptance responses conform',async()=>{
  const root=new URL('./evidence/2026-10-11/',import.meta.url)
  const load=async file=>JSON.parse(await readFile(new URL(file,root)))
  const t1=await load('D11-A-T1.json'),t2=await load('D11-A-T2.json'),t3=await load('D11-A-T3.json'),boundaries=await load('boundaries.json')
  const integrated=await load('preview-source-consistency.json')
  for(const [kind,value] of [['file',t1.sourceBeforeAfter],['outcome',t1.validation],['snapshot',t2.failedSnapshot],['list',t3.page],
    ...t3.manifests.map(m=>['files',m]),['list',boundaries.emptyList],['snapshot',integrated.snapshot],...integrated.sourceReads.map(f=>['file',f])]) {
    const check=validate(kind);assert.equal(check(value),true,JSON.stringify(check.errors))
  }
  assert.equal(t2.failedSnapshot.validation.report.exitCode,null)
  assert.equal(t1.realBuildAndBrowser,true)
  assert.equal(integrated.preview.versionId,integrated.snapshot.versionId)
  assert.equal(integrated.preview.sourceDigest,integrated.snapshot.sourceDigest)
  assert.equal(integrated.preview.artifactDigest,integrated.snapshot.validation.artifactDigest)
})
