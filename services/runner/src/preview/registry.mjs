import { lstat, realpath, open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, join, dirname, relative } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { readSnapshot, digest, isDigest } from '../artifacts/snapshot.mjs'
import { openArtifactService } from '../artifacts/service.mjs'
import { uuid } from './credentials.mjs'

// Host-owned private evidence, reconciled with committed SQL. No model/user paths or serialized handles.
export async function canonical(path) {
  const absolute=resolve(path)
  let current=absolute
  while(current!==dirname(current)) {
    const stat=await lstat(current)
    if(stat.isSymbolicLink() || await realpath(current)!==current) throw new Error('private path rejected')
    current=dirname(current)
  }
  return absolute
}
async function bytes(path,limit) {
  await canonical(path)
  const stat=await lstat(path)
  if(!stat.isFile() || stat.nlink!==1 || stat.size>limit) throw new Error('evidence file rejected')
  const file=await open(path,constants.O_RDONLY | (constants.O_NOFOLLOW??0))
  try {
    const checked=await file.stat()
    if(checked.dev!==stat.dev || checked.ino!==stat.ino || checked.nlink!==1) throw new Error('evidence changed')
    const content=Buffer.alloc(stat.size+1)
    let length=0
    while(length<content.length) {const result=await file.read(content,length,content.length-length,length);if(!result.bytesRead) break;length+=result.bytesRead}
    if(length!==stat.size) throw new Error('evidence changed')
    return content.subarray(0,length)
  } finally {await file.close()}
}
const json=async path=>JSON.parse((await bytes(path,2*1024*1024)).toString('utf8'))
const id=version=>version.applicationId+':'+version.versionId
const fields=['applicationId','artifactDigest','buildId','sourceDigest','taskId','versionId']
function catalogue(values) {
  if(!Array.isArray(values) || values.length>1000) throw new Error('invalid catalogue')
  const seen=new Set()
  for(const value of values) {
    if(!value || Object.keys(value).sort().join(',')!==fields.join(',') ||
      !['applicationId','versionId','taskId','buildId'].every(field=>typeof value[field]==='string' && uuid.test(value[field])) ||
      !isDigest(value.sourceDigest) || !isDigest(value.artifactDigest) || seen.has(id(value))) throw new Error('invalid catalogue')
    seen.add(id(value))
  }
  return values
}
async function readEvidence(version,privateRoot,sourceRoot) {
  const journal=join(privateRoot,'journal',version.taskId)
  await canonical(journal)
  const snapshot=await readSnapshot(journal,{files:100,bytes:32*1024*1024,fileBytes:2*1024*1024})
  const events=snapshot.manifest.files.map((file,index)=>{
    if(file.path!==String(index+1).padStart(4,'0')+'.json') throw new Error('invalid journal sequence')
    const event=JSON.parse(snapshot.buffers.get(file.path).toString('utf8'))
    if(event.sequence!==index+1 || event.taskId!==version.taskId) throw new Error('invalid journal binding')
    return event
  })
  const latest=kind=>events.findLast(event=>event.kind===kind)?.payload
  const draft=latest('draft'),result=latest('runner.result'),completion=latest('completion')
  if(!draft || !result || !completion || draft.versionId!==version.versionId || draft.sourceDigest!==version.sourceDigest ||
    completion.versionId!==version.versionId || completion.buildId!==version.buildId || completion.sourceDigest!==version.sourceDigest ||
    completion.artifactDigest!==version.artifactDigest || result.status!=='VERIFIED' || result.sourceDigest!==version.sourceDigest ||
    !uuid.test(result.executionId??'') || !uuid.test(result.verification?.id??'') || completion.verificationId!==result.verification.id)
    throw new Error('completion binding rejected')
  const source=resolve(draft.sourceDirectory??'')
  const expectedParent=join(sourceRoot,version.taskId,'snapshots')
  if(dirname(source)!==expectedParent || !uuid.test(relative(expectedParent,source))) throw new Error('source outside trusted root')
  await canonical(source)
  const actual=await readSnapshot(source,{source:true,files:40,bytes:524288,fileBytes:131072})
  if(actual.manifest.digest!==version.sourceDigest || !isDeepStrictEqual(actual.manifest.files,draft.files)) throw new Error('source mismatch')
  const receipt=join(privateRoot,'receipts',result.executionId+'.json')
  if(!isDeepStrictEqual(await json(receipt),result)) throw new Error('worker receipt mismatch')
  const build=result.build,verification=result.verification
  const artifactRoot=join(privateRoot,'artifacts'),artifact=join(artifactRoot,version.buildId)
  if(build?.id!==version.buildId || build.artifact?.digest!==version.artifactDigest || resolve(build.artifact.directory??'')!==artifact ||
    !Number.isSafeInteger(build.artifact.bytes) || build.artifact.bytes<1 || build.artifact.bytes>32*1024*1024 ||
    !isDigest(build.imageId) || verification.buildId!==version.buildId || verification.sourceDigest!==version.sourceDigest ||
    verification.artifactDigest!==version.artifactDigest) throw new Error('build binding rejected')
  const report=join(privateRoot,'evidence',verification.id,'result.json'),png=join(privateRoot,'evidence',verification.id,'page.png')
  if(resolve(verification.reportPath??'')!==report || resolve(verification.screenshot?.path??'')!==png ||
    !isDeepStrictEqual(await json(report),verification)) throw new Error('browser receipt mismatch')
  const image=await bytes(png,6*1024*1024)
  if(image.length<24 || !image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
    image.readUInt32BE(16)!==1280 || image.readUInt32BE(20)!==720 || image.length!==verification.screenshot.bytes ||
    digest(image)!==verification.screenshot.digest || verification.screenshot.width!==1280 || verification.screenshot.height!==720)
    throw new Error('screenshot mismatch')
  await canonical(artifact)
  return {build,verification,source,receipt,report,png,artifact,artifactRoot}
}
export async function createPreviewRegistry({gateway,privateRoot,sourceRoot,loadVersions,maxVersions=32,maxBytes=256*1024*1024,now=Date.now}) {
  privateRoot=await canonical(privateRoot);sourceRoot=await canonical(sourceRoot)
  if(!Number.isSafeInteger(maxVersions) || maxVersions<1 || maxVersions>128 || !Number.isSafeInteger(maxBytes) || maxBytes<1 || maxBytes>256*1024*1024)
    throw new Error('registry bounds required')
  const entries=new Map()
  let healthy=false,lastSync=0,closed=false,pending=null,failures=0
  async function remove(key) {const entry=entries.get(key);if(!entry)return;gateway.revoke(entry.version.applicationId,entry.version.versionId);entries.delete(key);await entry.handle.close()}
  async function clear() {for(const key of [...entries.keys()]) await remove(key)}
  async function reconcile() {
    if(closed) return
    try {
      const values=catalogue(await loadVersions()).slice(0,maxVersions)
      if(closed) return
      const wanted=new Set(values.map(id))
      for(const key of [...entries.keys()]) if(!wanted.has(key)) await remove(key)
      for(const version of values) {
        if(closed) return
        const key=id(version),current=entries.get(key)
        try {
          if(current) {
            if(!isDeepStrictEqual(current.version,version)) throw new Error('immutable registry binding changed')
            // Retention/removal invalidates a live snapshot. Mutations never replace bytes already admitted.
            for(const path of [current.receipt,current.report,current.png,current.artifact,current.source]) await canonical(path)
            continue
          }
          const evidence=await readEvidence(version,privateRoot,sourceRoot)
          const used=[...entries.values()].reduce((sum,value)=>sum+value.build.artifact.bytes,0)
          if(used+evidence.build.artifact.bytes>maxBytes) throw new Error('registry capacity reached')
          const handle=await openArtifactService({artifactRoot:evidence.artifactRoot,build:evidence.build,sourceDigest:version.sourceDigest})
          try {
            if(closed) {await handle.close();return}
            gateway.register({applicationId:version.applicationId,versionId:version.versionId,handle,verification:evidence.verification})
            entries.set(key,{...evidence,version:{...version},handle})
          } catch(error) {await handle.close();throw error}
        } catch {failures++;await remove(key)}
      }
      lastSync=now();healthy=true
    } catch {healthy=false;failures++;await clear()}
  }
  return {
    sync() {if(closed)return Promise.resolve();if(!pending)pending=reconcile().finally(()=>{pending=null});return pending},
    available:()=>!closed && healthy && now()-lastSync<3000,
    ready(applicationId,versionId) {const entry=entries.get(applicationId+':'+versionId);return this.available() && entry ?
      {ready:true,buildId:entry.version.buildId,sourceDigest:entry.version.sourceDigest,artifactDigest:entry.version.artifactDigest}:null},
    stats:()=>({healthy:!closed&&healthy&&now()-lastSync<3000,mapped:entries.size,failures,lastSync}),
    async close() {closed=true;healthy=false;if(pending)await pending;await clear()}
  }
}
