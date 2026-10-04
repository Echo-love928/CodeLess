import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm, link } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { createPreviewRegistry } from '../../../services/runner/src/preview/registry.mjs'
import { createPreviewGateway } from '../../../services/runner/src/preview/gateway.mjs'
import { readSnapshot,digest } from '../../../services/runner/src/artifacts/snapshot.mjs'
import { completedFixture } from '../../runner/browser/fixtures.mjs'
import { KEY_HEX,passedFixture,signed } from './fixtures.mjs'
import { request } from 'node:http'

// Host-authored private evidence fixtures test rehydration/boundaries, not build or model quality.
async function fixture(run) {
  const scratch=await mkdtemp(join(tmpdir(),'codeless-d09-registry-'))
  const privateRoot=join(scratch,'private'),sourceRoot=join(scratch,'sources')
  for(const dir of ['artifacts','receipts','evidence','journal'])await mkdir(join(privateRoot,dir),{recursive:true})
  const taskId=randomUUID(),applicationId=randomUUID(),versionId=randomUUID()
  const source=join(sourceRoot,taskId,'snapshots',randomUUID())
  await mkdir(join(source,'src/pages'),{recursive:true})
  await writeFile(join(source,'src/pages/HomePage.vue'),'<template><h1>Host fixture</h1></template>')
  const sourceManifest=(await readSnapshot(source,{source:true})).manifest
  const built=await completedFixture(join(privateRoot,'artifacts'));built.build.imageId='sha256:'+'a'.repeat(64)
  const version={applicationId,versionId,taskId,buildId:built.build.id,sourceDigest:sourceManifest.digest,artifactDigest:built.build.artifact.digest}
  const verificationId=randomUUID(),executionId=randomUUID(),evidence=join(privateRoot,'evidence',verificationId)
  await mkdir(evidence);await mkdir(join(privateRoot,'journal',taskId))
  const png=await readFile(new URL('./evidence/2026-10-03/version1-verification.png',import.meta.url))
  const verification={...passedFixture({buildId:version.buildId,sourceDigest:version.sourceDigest,artifactDigest:version.artifactDigest}),id:verificationId,
    reportPath:join(evidence,'result.json'),screenshot:{path:join(evidence,'page.png'),digest:digest(png),bytes:png.length,width:1280,height:720}}
  const result={status:'VERIFIED',sourceDigest:version.sourceDigest,build:built.build,verification,executionId}
  const paths={receipt:join(privateRoot,'receipts',executionId+'.json'),report:verification.reportPath,png:verification.screenshot.path,
    draft:join(privateRoot,'journal',taskId,'0001.json'),artifact:join(built.build.artifact.directory,'page.js')}
  await writeFile(paths.png,png);await writeFile(paths.report,JSON.stringify(verification));await writeFile(paths.receipt,JSON.stringify(result))
  const payloads=[{kind:'draft',payload:{versionId,sourceDigest:version.sourceDigest,sourceDirectory:source,files:sourceManifest.files}},
    {kind:'runner.result',payload:result},{kind:'completion',payload:{versionId,buildId:version.buildId,sourceDigest:version.sourceDigest,artifactDigest:version.artifactDigest,verificationId}}]
  for(let i=0;i<payloads.length;i++)await writeFile(join(privateRoot,'journal',taskId,String(i+1).padStart(4,'0')+'.json'),JSON.stringify({sequence:i+1,taskId,...payloads[i]}))
  let values=[version],error=false,clock=Date.now(),registry
  const gateway=createPreviewGateway({signingKeyHex:KEY_HEX,previewOrigin:'https://preview.codeless-preview.test',platformOrigin:'https://platform.codeless.test',isAvailable:()=>registry?.available()??false})
  const config={gateway,privateRoot,sourceRoot,now:()=>clock,loadVersions:async()=>{if(error)throw new Error('private catalogue unavailable');return values}}
  const make=async extra=>{registry=await createPreviewRegistry({...config,...extra});return registry}
  await new Promise(done=>gateway.server.listen(0,'127.0.0.1',done))
  const origin='http://127.0.0.1:'+gateway.server.address().port,host='v'+versionId.replaceAll('-','')+'.preview.codeless-preview.test'
  const token=signed({buildId:version.buildId,sourceDigest:version.sourceDigest,artifactDigest:version.artifactDigest},applicationId,versionId)
  const get=()=>new Promise((done,reject)=>{const req=request(origin,{headers:{Host:host,Cookie:'__Host-codeless-preview='+token}},res=>{res.resume();res.on('end',()=>done(res.statusCode))});req.on('error',reject);req.end()})
  try {await run({make,gateway,version,result,paths,source,sourceRoot,config,get,setValues:v=>{values=v},fail:()=>{error=true},advance:ms=>{clock+=ms}})}
  finally {await registry?.close();await gateway.close();assert.equal(dirname(scratch),resolve(tmpdir()));await rm(scratch,{recursive:true,force:true})}
}
test('resident registry rehydrates committed bindings, restarts, revokes removal, and denies stale/unavailable catalogue',async()=>{
  await fixture(async({make,version,get,setValues,fail,advance})=>{
    let registry=await make();await registry.sync();assert.equal(registry.stats().mapped,1);assert.equal(await get(),200)
    assert.equal(registry.ready(version.applicationId,version.versionId).buildId,version.buildId)
    advance(3000);assert.equal(await get(),503);await registry.sync();assert.equal(await get(),200)
    await registry.close();assert.equal(await get(),503);registry=await make();await registry.sync();assert.equal(await get(),200)
    setValues([]);await registry.sync();assert.equal(await get(),404);assert.equal(registry.stats().mapped,0)
    setValues([version]);await registry.sync();fail();await registry.sync();assert.equal(await get(),503);assert.equal(registry.stats().mapped,0)
  })
})
test('private receipts, source, artifact, browser report and screenshot must all match before registration',async()=>{
  for(const kind of ['receipt','source','artifact','report','png','escape','unknown','binding','hardlink'])await fixture(async({make,version,result,paths,source,sourceRoot,setValues})=>{
    if(kind==='hardlink')await link(paths.receipt,paths.receipt+'.second-link')
    if(['receipt','report','png','artifact'].includes(kind))await writeFile(paths[kind],'corrupt')
    if(kind==='source')await writeFile(join(source,'src/pages/HomePage.vue'),'<template>changed after completion</template>')
    if(kind==='escape') {const draft=JSON.parse(await readFile(paths.draft,'utf8'));draft.payload.sourceDirectory=sourceRoot;await writeFile(paths.draft,JSON.stringify(draft))}
    if(kind==='unknown') {result.build.exitCode=null;await writeFile(paths.receipt,JSON.stringify(result));const eventPath=join(dirname(paths.draft),'0002.json');const event=JSON.parse(await readFile(eventPath,'utf8'));event.payload=result;await writeFile(eventPath,JSON.stringify(event))}
    if(kind==='binding')setValues([{...version,buildId:randomUUID()}])
    const registry=await make();await registry.sync();assert.equal(registry.stats().mapped,0,kind);assert.equal(registry.ready(version.applicationId,version.versionId),null,kind)
  })
})
test('catalogue cannot supply paths, duplicate versions or changed immutable bindings; capacity and retention fail closed',async()=>{
  await fixture(async({make,version,setValues,paths,get})=>{
    let registry=await make({maxBytes:1});await registry.sync();assert.equal(registry.stats().mapped,0);await registry.close()
    registry=await make();await registry.sync();assert.equal(await get(),200)
    setValues([{...version,artifactDigest:'sha256:'+'0'.repeat(64)}]);await registry.sync();assert.equal(registry.stats().mapped,0)
    for(const invalid of [[{...version,path:'C:/arbitrary'}],[version,version]]) {setValues(invalid);await registry.sync();assert.equal(registry.stats().healthy,false)}
    setValues([version]);await registry.sync();assert.equal(registry.stats().mapped,1);await rm(paths.receipt);await registry.sync();assert.equal(registry.stats().mapped,0);assert.equal(await get(),404)
  })
})
