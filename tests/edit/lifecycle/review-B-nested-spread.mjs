import assert from 'node:assert/strict'
import {mkdir,cp,readFile,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {chromium} from '@playwright/test'
const base=resolve('.local-data/d12-a/review-b-71c7a1f')
const {createBuildRunner}=await import(pathToFileURL(join(base,'services/runner/src/build/runner.mjs')))
const {readSnapshot}=await import(pathToFileURL(join(base,'services/runner/src/artifacts/snapshot.mjs')))
const {buildVersionMapping,resolveSelection}=await import(pathToFileURL(join(base,'services/runner/src/mapping/manifest.mjs')))
const root=resolve('.local-data/d12-a/probes',randomUUID());await mkdir(root,{recursive:true})
const source=join(root,'source');await cp(join(base,'templates/vue/fixtures/mapping'),source,{recursive:true})
const page=join(source,'src/pages/HomePage.vue');const bytes=await readFile(page,'utf8')
assert.ok(bytes.includes('<SharedCard label="丙" />'))
await writeFile(page,bytes.replace('<SharedCard label="丙" />',`<SharedCard label="丙" v-bind="{ 'data-ai-component': 'home-page' }" />`))
const snapshot=await readSnapshot(source,{source:true})
const runBuild=await createBuildRunner({workRoot:join(root,'work'),artifactRoot:join(root,'artifacts')})
const versionId='55555555-5555-4555-8555-555555555555'
const mapped=await buildVersionMapping({sourceDirectory:source,versionId,sourceDigest:snapshot.manifest.digest,runBuild})
assert.equal(mapped.status,'MAPPED');assert.equal(mapped.build.exitCode,0)
const artifact=await readSnapshot(mapped.build.artifact.directory)
const server=createServer((req,res)=>{const path=new URL(req.url,'http://127.0.0.1').pathname.slice(1)||'index.html';const value=artifact.buffers.get(path);if(!value){res.writeHead(404).end();return}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/html');res.end(value)})
let browser
try {
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok)})
  browser=await chromium.launch({headless:true});const tab=await browser.newPage();await tab.goto(`http://127.0.0.1:${server.address().port}/`)
  await tab.locator('h2').first().waitFor()
  const markers=await tab.locator('h2').evaluateAll(nodes=>nodes.map(n=>n.closest('[data-ai-component]')?.getAttribute('data-ai-component')))
  assert.deepEqual(markers,['shared-card','shared-card','home-page'])
  const selection=resolveSelection(mapped.manifest,{versionId,sourceDigest:snapshot.manifest.digest,componentId:markers[2]})
  assert.equal(selection.selectable,true);assert.equal(selection.sourceFile,'src/pages/HomePage.vue')
  const report={status:'BUG_CONFIRMED',head:'71c7a1f76bda5fa0781fcc2e281716d8dd0c72b8',fixtureChange:`<SharedCard label="丙" v-bind="{ 'data-ai-component': 'home-page' }" />`,
    expected:'Parent source must be disabled for unsafe component-call marker override; selection must not resolve a SharedCard root to HomePage.vue',
    actual:{markers,selection,manifest:mapped.manifest},realDockerBuild:true,realChromium:true,modelRequests:0,buildExitCode:mapped.build.exitCode}
  await writeFile('.local-data/d12-a/nested-spread.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,markers,wrongSourceFile:selection.sourceFile}))
} finally {try{await browser?.close()}finally{await new Promise((ok,bad)=>server.close(e=>e?bad(e):ok()))}}
