import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join,relative,resolve,sep} from 'node:path'
const repo=fileURLToPath(new URL('../../../',import.meta.url))
const peer=join(repo,'.local-data/d14-a/review-b-59ed')
const out=join(repo,'tests/edit/verification/evidence/2026-10-14/review-registration')
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
await mkdir(join(out,'peer'),{recursive:true})
const commands=[]
for(const folder of (await readdir(join(peer,'.local-data/d14-b'),{withFileTypes:true})).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) {
  const root=join(peer,'.local-data/d14-b',folder.name)
  const meta=JSON.parse(await readFile(join(root,'run.json'),'utf8'))
  assert.equal(meta.head,'59ed05b33f7f2dd8f54d5caf70da2fa302db69a2');assert.equal(meta.changes,'')
  const log=await readFile(join(root,'command.log'));assert.equal(hash(log),meta.logDigest)
  const lines=log.toString('utf8').split(/\r?\n/).filter(line=>/Test Files|Tests +\d|\d+ passed|ok \d|does not exist|Process from config|Exit code:|Error:/.test(line))
  await writeFile(join(out,'peer',folder.name+'.summary.log'),lines.join('\n')+'\n')
  const result={...meta,privateRun:relative(repo,root).replaceAll('\\','/'),summary:'peer/'+folder.name+'.summary.log'}
  if(meta.mode==='browser') {
    const browser=JSON.parse(await readFile(join(root,'browser-results.json'),'utf8'))
    result.browserStats=browser.stats
    result.testExecution=browser.suites.length?'EXECUTED':'NOT_STARTED'
    if(meta.status==='PASSED'){assert.equal(browser.stats.expected,6);assert.equal(browser.stats.unexpected,0);assert.equal(browser.stats.skipped,0);assert.equal(browser.stats.flaky,0)}
  }
  commands.push(result)
}
await writeFile(join(out,'peer-commands.json'),JSON.stringify(commands,null,2)+'\n')
const images=join(peer,'apps/web/test-results')
async function collect(path) {
  for(const item of await readdir(path,{withFileTypes:true})) {
    const full=join(path,item.name)
    if(item.isDirectory())await collect(full)
    else if(['four-edits.png','failure-recovery.png','mobile-edit-task.png'].includes(item.name))await copyFile(full,join(out,'peer',item.name))
  }
}
await collect(images)
const evidence=join(peer,'tests/e2e/visual-edit/evidence/2026-10-14')
const artifacts=JSON.parse(await readFile(join(evidence,'artifact-digests.json'),'utf8'))
for(const row of artifacts) {
  const path=resolve(evidence,row.path);assert.ok(path.startsWith(resolve(evidence)+sep))
  const bytes=await readFile(path);assert.equal(bytes.length,row.bytes);assert.equal(hash(bytes),row.digest)
}
const integration=JSON.parse(await readFile(join(evidence,'ab-integration/command.json'),'utf8'))
const sourceVariants=[]
for(const row of integration.testedFileDigests.filter(row=>row.path.startsWith('apps/web/'))) {
  assert.match(row.path,/^apps\/web\/src\/features\/(versions|visual-edit)\/[A-Za-z0-9_.-]+\.(vue|ts)$/)
  const bytes=execFileSync('git',['show','59ed05b:'+row.path],{cwd:repo})
  const variant=hash(bytes)===row.digest?'LF_GIT_BLOB':hash(bytes.toString('utf8').replaceAll('\n','\r\n'))===row.digest?'CRLF_CHECKOUT':'MISMATCH'
  assert.notEqual(variant,'MISMATCH');sourceVariants.push({path:row.path,variant})
}
await writeFile(join(out,'peer-artifact-validation.json'),JSON.stringify({head:commands[0].head,
  publishedArtifactsVerified:artifacts.length,integrationUiSourceVariants:sourceVariants,
  peerReportedIntegrationTests:8,independentlyReranJavaIntegration:false},null,2)+'\n')
console.log(JSON.stringify({peerHead:commands[0].head,runs:commands.length,successfulRuns:commands.filter(c=>c.status==='PASSED').length,failedRuns:commands.filter(c=>c.status==='FAILED').length}))
