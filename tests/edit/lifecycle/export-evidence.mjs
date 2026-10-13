// Copy only bounded public acceptance projections. Raw logs/session input/private roots remain private.
import assert from 'node:assert/strict'
import {readFile,readdir,mkdir,writeFile,copyFile} from 'node:fs/promises'
import {resolve,join,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
const root=fileURLToPath(new URL('../../../',import.meta.url))
const date=process.argv[2]??'2026-10-12'
assert.match(date,/^\d{4}-\d{2}-\d{2}$/)
const publicRoot=join(root,'tests/edit/lifecycle/evidence',date)
const privateRoot=join(root,'.local-data/d12-a/runs')
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
await mkdir(publicRoot,{recursive:true})
const runs=[]
for(const name of (await readdir(privateRoot)).sort()) {
  const directory=join(privateRoot,name),meta=JSON.parse(await readFile(join(directory,'run.json'),'utf8'))
  if(!meta.startedAt.startsWith(date))continue
  const log=await readFile(join(directory,'command.log'))
  if(meta.logDigest)assert.equal(hash(log),meta.logDigest)
  const matches=[...log.toString('utf8').matchAll(/Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)/g)]
  const lifecycle=log.toString('utf8').match(/Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+),[^\r\n]* -- in dev\.codeless\.api\.edit\.EditLifecycleIntegrationTest/)
  runs.push({...meta,cwd:'.',run:relative(root,directory),command:meta.command.map(v=>v.replace(root,'.')),
    junit:matches.length?Object.fromEntries(['tests','failures','errors','skipped'].map((key,i)=>[key,Number(matches.at(-1)[i+1])])):null,
    editLifecycle:lifecycle?Object.fromEntries(['tests','failures','errors','skipped'].map((key,i)=>[key,Number(lifecycle[i+1])])):null})
}
const latest=runs.findLast(run=>['PASSED','FAILED'].includes(run.status)&&['acceptance','gate','api'].includes(run.mode)
  &&run.editLifecycle?.tests>=7&&run.editLifecycle.failures===0&&run.editLifecycle.errors===0&&run.editLifecycle.skipped===0)
assert.ok(latest,'No successful real acceptance run exists')
const evidence=join(root,latest.run,'edit')
for(const name of ['D12-A-T1','D12-A-T2','D12-A-T3','D12-A-T4','boundaries','real-build-failure','commit-conflict','cancel-preview','runtime-usage']) {
  const source=join(evidence,name+'.json')
  try {await copyFile(source,join(publicRoot,name+'.json'))}
  catch(error) {if(name==='runtime-usage'&&latest.mode==='acceptance'&&latest.junit?.tests===7)continue;throw error}
}
if(date>='2026-10-13')for(const name of ['delete-existing','delete-boundaries'])
  await copyFile(join(evidence,name+'.json'),join(publicRoot,name+'.json'))
const preview=JSON.parse(await readFile(join(publicRoot,'cancel-preview.json'),'utf8'))
for(const item of preview.versions) {
  let found=false
  for(const name of await readdir(join(root,'services/api/target/edit-integration'))) {
    if(!name.startsWith('preview-'))continue
    const path=join(root,'services/api/target/edit-integration',name,item.screenshot.path)
    try {
      const bytes=await readFile(path)
      if(hash(bytes)!==item.screenshot.digest)continue
      assert.equal(bytes.length,item.screenshot.bytes)
      await writeFile(join(publicRoot,item.screenshot.path),bytes);found=true;break
    } catch(error) {if(error.code!=='ENOENT')throw error}
  }
  assert.ok(found,'Screenshot with the reported immutable hash not found')
}
await writeFile(join(publicRoot,'commands.json'),JSON.stringify({runs,acceptanceSource:latest.run,
  acceptanceSourceRunStatus:latest.status,acceptanceSourceRunExitCode:latest.exitCode,
  acceptanceScope:'D12-A lifecycle only. A successful class inside a failed full suite never makes the full suite PASSED.',
  rawLogs:'Retained privately under each run/command.log; hashes/native exits above',
  stageStatusRule:'Only completed native exit 0 is PASSED. Missing completion is UNKNOWN.'},null,2)+'\n')
console.log(JSON.stringify({exportedFrom:latest.run,runs:runs.length}))
