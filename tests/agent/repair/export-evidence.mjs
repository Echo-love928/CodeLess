import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises'
import { resolve, join, isAbsolute, dirname } from 'node:path'
import { createHash } from 'node:crypto'

// Export byte-checked evidence from one explicit run, never convert failures/unknowns to success.
const input=resolve(process.argv[2]??'.local-data/d10-a/evidence')
const output=resolve('tests/agent/repair/evidence/2026-10-07')
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
const portable=value=>{
  if(Array.isArray(value)) return value.map(portable)
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,
    typeof item==='string' && ['directory','sourceDirectory','reportPath','path'].includes(key) && (isAbsolute(item)||/^[A-Za-z]:[\\/]/.test(item))?'PRIVATE_PATH_RETAINED_LOCALLY':portable(item)]))
  return value
}
await mkdir(output,{recursive:true})
for(const name of (await readdir(input)).filter(name=>/^D10-A-[A-Za-z0-9-]+\.json$/.test(name)).sort()) {
  const outputName=process.argv[3]??name
  assert.match(outputName,/^D10-A-[A-Za-z0-9-]+\.json$/)
  const report=JSON.parse(await readFile(join(input,name),'utf8'))
  const candidates=[];const runners=[]
  for(const event of report.events) {
    if(event.kind==='draft') {
      const draft=event.payload,manifest=[]
      const relative=`source/${outputName.slice(0,-5)}/candidate-${candidates.length}`
      for(const file of draft.files) {
        assert.match(file.path,/^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/)
        const bytes=await readFile(join(draft.sourceDirectory,file.path))
        assert.equal(bytes.length,file.bytes);assert.equal(digest(bytes),file.digest)
        manifest.push({path:file.path,bytes:file.bytes,digest:file.digest})
        const target=join(output,relative,file.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes)
      }
      manifest.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)
      assert.equal(digest(JSON.stringify(manifest)),draft.sourceDigest)
      candidates.push({...portable(draft),sourceDirectory:relative})
    }
    if(event.kind==='runner.result') {
      const actual=event.payload,screenshot=actual.verification?.screenshot
      if(screenshot) {
        const bytes=await readFile(screenshot.path);assert.equal(digest(bytes),screenshot.digest);assert.equal(bytes.length,screenshot.bytes)
        const relative=`screenshots/${outputName.slice(0,-5)}-${runners.length}.png`;await mkdir(join(output,'screenshots'),{recursive:true});await copyFile(screenshot.path,join(output,relative))
        const exported=portable(actual);exported.verification.screenshot.path=relative;runners.push(exported)
      } else runners.push(portable(actual))
    }
  }
  await writeFile(join(output,outputName),JSON.stringify({task:report.task,budget:report.budget,modelProvider:report.modelProvider,
    modelQualityEvidence:report.modelQualityEvidence,extra:report.extra,candidates,runners,
    usage:report.events.filter(e=>e.kind==='model.usage').map(e=>({stage:e.stage,...e.payload})),
    decisions:report.events.filter(e=>['repair.failure','failure','completion','stage.finished'].includes(e.kind)).map(portable)},null,2)+'\n')
}
const commands=[]
for(const [stem,command] of [
  ['compile','mvnw -DskipTests compile'],
  ['repair-first','mvnw -Dtest=RepairPolicyTest,RepairLoopIntegrationTest test'],
  ['ci-gate','pnpm ci:gate'],
  ['api-final','pnpm verify:api (affected browser diagnostic regression)'],
  ['cleanup-diagnostic','mvnw -Dtest=FileToolsIntegrationTest#d08aT4MissingExistingDigestConflictAndUnknownShellNeverBecomeSuccessfulEvents test (diagnostic, not a gate replacement)'],
  ['peer-e2e','peer E2E before building dist (failed prerequisite, retained)'],
  ['peer-e2e-final','pnpm --filter @codeless/web exec playwright test --config playwright.config.ts --grep D10-B --workers=1'],
  ['real-platform-first','mvnw -Dtest=RealPreviewPlatformAcceptanceIT test'],
  ['real-repair','mvnw -Dtest=RealRepairAcceptanceIT test'],
  ['real-repair-confirm','mvnw -Dtest=RealRepairAcceptanceIT test (independent fresh task; initial failure retained)'],
]) {
  try {
    const log=await readFile(`.local-data/d10-a/${stem}.log`);const exit=Number((await readFile(`.local-data/d10-a/${stem}.exit`,'utf8')).trim());assert.ok(Number.isInteger(exit))
    commands.push({command,exitCode:exit,log:`.local-data/d10-a/${stem}.log`,logDigest:digest(log)})
  } catch(error) {
    if(error.code!=='ENOENT') throw error
    commands.push({command,exitCode:null,status:'NOT_YET_EXPORTED'})
  }
}
await writeFile(join(output,'commands.json'),JSON.stringify(commands,null,2)+'\n')
console.log('Exported independently byte-checked D10-A source, runner and screenshot evidence')
