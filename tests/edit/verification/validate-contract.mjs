// Validate the additive maintainer proposal against the actual HTTP restore response.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
const repo=fileURLToPath(new URL('../../../',import.meta.url))
const proposal=JSON.parse(await readFile(new URL('openapi.restore.patch.json',import.meta.url),'utf8'))
const route='/api/v0/applications/{applicationId}/versions/{versionId}/restore'
const published=JSON.parse(await readFile(join(repo,'contracts/openapi.v0.json'),'utf8'))
assert.deepEqual(published.paths[route],proposal.paths[route],'Shared restore route must match the reviewed additive fragment')
const post=proposal.paths[route].post
const ajv=new Ajv2020({strict:true});addFormats(ajv)
const request=ajv.compile(post.requestBody.content['application/json'].schema)
const response=ajv.compile(post.responses['200'].content['application/json'].schema)
const root=join(repo,'tests/edit/verification/evidence/2026-10-14')
const t4=JSON.parse(await readFile(join(root,'verified/D14-A-T4.json'),'utf8'))
assert.equal(response(t4.restore),true,JSON.stringify(response.errors))
assert.equal(request({expectedCurrentVersionId:t4.restore.previousVersionId}),true)
for(const value of [{},{expectedCurrentVersionId:null},{expectedCurrentVersionId:3},
  {expectedCurrentVersionId:'1-1-1-1-1'},{expectedCurrentVersionId:t4.restore.previousVersionId,publish:true}])assert.equal(request(value),false)
assert.equal(response({...t4.restore,sourceFile:'../secret'}),false)
const output=join(root,'review-registration')
await mkdir(output,{recursive:true})
await writeFile(join(output,'contract-validation.json'),JSON.stringify({status:'PASSED',realHttpResponse:'../verified/D14-A-T4.json',
  responseCases:2,requestCases:6,sharedContractRegistered:true,sharedFragmentExactlyMatches:true},null,2)+'\n')
console.log('Registered restore contract matches the reviewed fragment; 8 schema cases passed against the real HTTP response.')
