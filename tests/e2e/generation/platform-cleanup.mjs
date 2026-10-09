import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,lstatSync,realpathSync,writeFileSync} from 'node:fs'
import {resolve,join,dirname,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
const repository=resolve(fileURLToPath(new URL('../../../',import.meta.url)))
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const projectPattern=new RegExp('^codeless-preview-test-'+uuid+'$')
function unlinked(path,target) {
  assert.ok(path.startsWith(target+sep))
  for(let current=path;current!==target;current=dirname(current))assert.equal(lstatSync(current).isSymbolicLink(),false)
  assert.equal(realpathSync(target),target)
}
export function recordPreviewDeployment(evidence,project,deployment,nonce) {
  assert.match(nonce,new RegExp('^'+uuid+'$'));assert.match(project,projectPattern)
  const target=join(repository,'services/api/target'),root=dirname(resolve(evidence)),envFile=resolve(deployment.envFile)
  assert.equal(dirname(root),target);assert.match(root.split(/[\\/]/).at(-1),new RegExp('^(?:real-)?preview-platform-'+uuid+'$'))
  assert.equal(envFile,join(resolve(evidence),'ingress/compose.env'));unlinked(envFile,target)
  writeFileSync(join(evidence,'cleanup-owner.json'),JSON.stringify({nonce,evidence:resolve(evidence),project,envFile})+'\n',{flag:'wx'})
}
function result(run) {return {exitCode:run.status??null,state:run.error?'UNAVAILABLE':run.status===null?'UNKNOWN':'OBSERVED'}}
function query(project,kind,runDocker) {
  const args=kind==='containers'?['ps','--all','--filter','label=com.docker.compose.project='+project,'--format','{{.ID}}']:
    ['network','ls','--filter','label=com.docker.compose.project='+project,'--format','{{.ID}}']
  const run=runDocker('docker',args,{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:32768})
  const state=result(run),text=run.stdout??'',ids=text.trim()?text.trim().split(/\r?\n/):[]
  const complete=state.state==='OBSERVED'&&state.exitCode===0&&Buffer.byteLength(text)<=32768&&ids.every(id=>/^[a-f0-9]{12,64}$/.test(id))
  return {...state,remaining:complete?ids.length:null}
}
export async function cleanupPreviewResources({browser,tls,runtime,closeServer,deployment,compose,project,runDocker=spawnSync,closeTimeoutMs=10000}) {
  const failures=[],steps=[]
  const attempt=async(name,fn,bounded=false)=>{
    let timer
    try{
      if(bounded)await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error(name+' close deadline exceeded');error.name='TimeoutError';reject(error)},closeTimeoutMs)})])
      else await fn()
      steps.push({name,state:'COMPLETED'})
    }catch(error){failures.push(error);steps.push({name,state:error?.name==='TimeoutError'?'TIMEOUT':'FAILED',errorClass:error?.name??'UNKNOWN'})}
    finally{clearTimeout(timer)}
  }
  if(browser)await attempt('browser',()=>browser.close(),true)
  if(tls)await attempt('tls',()=>closeServer(tls),true)
  if(runtime)await attempt('runtime',()=>runtime.close(),true)
  let resources=null
  if(deployment){
    await attempt('compose',()=>{const down=compose(['down','--remove-orphans']);assert.equal(down.error,undefined);assert.equal(down.status,0)})
    resources={}
    for(const kind of ['containers','networks'])await attempt(kind,()=>{resources[kind]=query(project,kind,runDocker);assert.equal(resources[kind].remaining,0,kind+' cleanup not confirmed')})
  }
  return {failures,report:{steps,resources,complete:failures.length===0}}
}
export function cleanupOwnedPreview(evidence,nonce,runDocker=spawnSync) {
  const ownerFile=join(resolve(evidence),'cleanup-owner.json')
  try{lstatSync(ownerFile)}catch(error){if(error.code==='ENOENT')return {state:'NOT_CREATED',complete:true};throw error}
  const target=join(repository,'services/api/target'),root=dirname(resolve(evidence))
  assert.equal(dirname(root),target);assert.match(root.split(/[\\/]/).at(-1),new RegExp('^(?:real-)?preview-platform-'+uuid+'$'));unlinked(ownerFile,target)
  assert.ok(lstatSync(ownerFile).size<=4096)
  const owner=JSON.parse(readFileSync(ownerFile,'utf8'))
  assert.equal(owner.nonce,nonce);assert.match(nonce,new RegExp('^'+uuid+'$'));assert.match(owner.project,projectPattern)
  assert.equal(owner.evidence,resolve(evidence));assert.equal(owner.envFile,join(resolve(evidence),'ingress/compose.env'));unlinked(owner.envFile,target)
  const args=['compose','--project-name',owner.project,'--file',join(repository,'infra/preview/compose.yml'),'--env-file',owner.envFile,'down','--remove-orphans']
  let down,containers,networks
  try{down=result(runDocker('docker',args,{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:32768}))}catch{down={exitCode:null,state:'UNAVAILABLE'}}
  for(const kind of ['containers','networks']){let observed;try{observed=query(owner.project,kind,runDocker)}catch{observed={state:'UNAVAILABLE',exitCode:null,remaining:null}}if(kind==='containers')containers=observed;else networks=observed}
  return {state:'OWNED',project:owner.project,down,containers,networks,complete:down.state==='OBSERVED'&&down.exitCode===0&&containers.remaining===0&&networks.remaining===0}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv[2],'--owned-cleanup')
  const evidence=resolve(process.argv[3]);let report
  try{report=cleanupOwnedPreview(evidence,process.argv[4])}catch(error){report={state:'OWNERSHIP_REJECTED',complete:false,errorClass:error.constructor.name}}
  writeFileSync(join(evidence,'java-project-cleanup.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'})
  if(!report.complete)process.exitCode=1
}
