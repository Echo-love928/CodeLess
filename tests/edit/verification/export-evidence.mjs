// Public deterministic-test evidence only; raw logs/auth/provider transport stay private.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile,readdir,mkdir,cp} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join,relative,resolve,sep} from 'node:path'
const repo=fileURLToPath(new URL('../../../',import.meta.url))
const raw=join(repo,'.local-data/d14-a/runs'),out=join(repo,'tests/edit/verification/evidence/2026-10-14')
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
const readJson=async path=>JSON.parse(await readFile(path,'utf8'))
async function entries(path){try{return await readdir(path,{withFileTypes:true})}catch(error){if(error.code==='ENOENT')return [];throw error}}
async function verifySources(path) {
  for(const version of await entries(join(path,'source'))) {
    assert.ok(version.isDirectory()&&!version.isSymbolicLink())
    const base=join(path,'source',version.name),manifest=await readJson(join(base,'manifest.json'))
    const rows=[]
    for(const f of manifest.files) {
      const target=resolve(base,f.path);assert.ok(target.startsWith(resolve(base)+sep))
      const bytes=await readFile(target);assert.equal(bytes.length,f.bytes);assert.equal(hash(bytes),f.digest)
      rows.push({path:f.path,bytes:f.bytes,digest:f.digest})
    }
    assert.equal(hash(JSON.stringify(rows)),manifest.digest)
  }
  const t4=await readJson(join(path,'D14-A-T4.json')).catch(error=>{if(error.code==='ENOENT')return null;throw error})
  if(t4)for(const version of t4.preview.versions) {
    const f=version.screenshot,bytes=await readFile(join(path,'screenshots',f.path))
    assert.equal(bytes.length,f.bytes);assert.equal(hash(bytes),f.digest)
  }
}
await mkdir(out,{recursive:true})
const commands=[];let canonical=null
for(const folder of (await entries(raw)).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) {
  const path=join(raw,folder.name),meta=await readJson(join(path,'run.json'))
  if(meta.status==='RUNNING')continue // A live command is never an exit-0 report.
  const log=await readFile(join(path,'command.log'));assert.equal(hash(log),meta.logDigest)
  const publicRun=join(out,'runs',folder.name);await mkdir(publicRun,{recursive:true})
  const text=log.toString('utf8'),summary=text.split(/\r?\n/).filter(line=>
    /\[ci-gate\]|Tests run:|Test set:|BUILD (SUCCESS|FAILURE)|# (tests|pass|fail|skipped) |ℹ (tests|pass|fail|skipped) |Test Files|Tests +\d|\d+ passed \(|\d+ failed|Duration |error TS\d|BadSqlGrammar|column .*does not exist|DirectoryNotEmpty|Owned cleanup diagnostic/.test(line))
  await writeFile(join(publicRun,'summary.log'),summary.join('\n')+'\n')
  const junit=[]
  for(const f of await entries(join(path,'junit')))if(f.name.endsWith('.txt')) {
    if(!text.includes('Running '+f.name.slice(0,-4)))continue // Ignore reports left by earlier explicit IT commands.
    const content=await readFile(join(path,'junit',f.name),'utf8')
    const counts=content.match(/Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)/)
    if(counts)junit.push({suite:f.name,tests:Number(counts[1]),failures:Number(counts[2]),errors:Number(counts[3]),skipped:Number(counts[4]),rawDigest:hash(content)})
  }
  const observation={...meta,privateRun:relative(repo,path).replaceAll('\\','/'),junit,summary:'runs/'+folder.name+'/summary.log'}
  await writeFile(join(publicRun,'command.json'),JSON.stringify(observation,null,2)+'\n');commands.push(observation)
  const verification=join(path,'verification')
  if((await entries(verification)).length) {
    await verifySources(verification)
    await cp(verification,join(publicRun,'verification'),{recursive:true})
    const suite=junit.find(s=>s.suite==='dev.codeless.api.edit.EditVerificationIntegrationTest.txt')
    const commandCompleted=meta.status==='PASSED'&&meta.completionVerified || meta.status==='FAILED'&&meta.mode==='gate'&&text.includes('[ci-gate] failed with exit code')
    // A fully completed card suite can pass inside a failed broad gate. Keep that gate FAILED/exit 1.
    // Never promote an incomplete/interrupted command or the first ledger-error suite.
    if(commandCompleted&&suite?.tests===7&&suite.failures===0&&suite.errors===0&&suite.skipped===0)
      canonical={verification,run:folder.name,head:meta.head,cardSuiteStatus:'PASSED',commandStatus:meta.status,commandExitCode:meta.exitCode}
  }
}
if(canonical) {
  await cp(canonical.verification,join(out,'verified'),{recursive:true})
  await writeFile(join(out,'canonical.json'),JSON.stringify({run:canonical.run,head:canonical.head,cardSuiteStatus:canonical.cardSuiteStatus,
    commandStatus:canonical.commandStatus,commandExitCode:canonical.commandExitCode,
    privateEvidence:relative(repo,canonical.verification).replaceAll('\\','/')},null,2)+'\n')
}
await writeFile(join(out,'commands.json'),JSON.stringify(commands,null,2)+'\n')
const artifacts=[]
async function inventory(path) {
  for(const e of await entries(path)) {
    assert.ok(!e.isSymbolicLink());const full=join(path,e.name)
    if(e.isDirectory())await inventory(full)
    else if(e.name!=='artifact-digests.json') {const bytes=await readFile(full);artifacts.push({path:relative(out,full).replaceAll('\\','/'),bytes:bytes.length,digest:hash(bytes)})}
  }
}
await inventory(out)
await writeFile(join(out,'artifact-digests.json'),JSON.stringify(artifacts,null,2)+'\n')
console.log(JSON.stringify({runs:commands.length,canonical:canonical?.run??null,files:artifacts.length}))
