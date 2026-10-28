// Explicit opt-in paid joint acceptance. Never imported by default CI; raw outputs stay private.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { request as httpRequest } from 'node:http'
import { randomUUID, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile, chmod, realpath, rm } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve, delimiter, dirname } from 'node:path'
import os from 'node:os'
import { chromium } from '@playwright/test'
import { root, environment, run, start, stop, maven } from '../../e2e/full/support.mjs'
import { tlsServer, closeServer } from '../../e2e/preview/fixtures.mjs'
import { startPreviewRuntime } from '../../../services/runner/src/preview/main.mjs'
import { hostingConfig } from '../../../infra/hosting/render.mjs'
import { awaitDeployment } from '../../e2e/full/deployment-terminal.mjs'
import { createBuildRunner } from '../../../services/runner/src/build/runner.mjs'
import { dockerAsync, waitForCPULoop, waitForOOM, sleep } from '../runner/support.mjs'
import { qualify } from './audit.mjs'

const command = process.argv[2], mode = process.env.CODELESS_JOINT_MODE
assert.ok(['prepare','run'].includes(command), 'Explicit prepare/run required')
assert.ok(['REAL','MOCK'].includes(mode), 'Explicit REAL/MOCK required')
assert.equal(process.platform, 'linux', 'Run on the designated Linux deployment host')
assert.equal(process.version, 'v24.22.1')
const out = resolve(process.env.CODELESS_JOINT_OUTPUT ?? '')
assert.ok(process.env.CODELESS_JOINT_OUTPUT && out.includes('/private/'), 'Protected absolute output root required')
const env = environment(), build = join(root, '.local-data/d22-joint/compiled')
const secret = mode === 'REAL' ? process.env.CODELESS_MODEL_API_KEY : undefined
delete process.env.CODELESS_MODEL_API_KEY
if (mode === 'REAL') {
  assert.equal(process.env.CODELESS_JOINT_APPROVAL, 'USER_APPROVED_NEW_BATCH_RMB_2')
  assert.ok(secret)
  assert.equal(process.env.CODELESS_MODEL_NAME, 'deepseek-flash')
}
const sha = b => 'sha256:' + createHash('sha256').update(b).digest('hex')
const ns = () => process.hrtime.bigint().toString()
const heading = mode === 'REAL' ? 'D22 Joint Ready' : 'Ada Lovelace'
const point = () => ({ monotonicNs: ns(), at: new Date().toISOString() })
const docker = args => run('docker', args, { env, timeout: 120000 })
if (command === 'prepare') {
  mkdirSync(build, { recursive: true })
  maven(['-DskipTests','package','dependency:build-classpath','-DincludeScope=runtime','-Dmdep.outputFile='+join(build,'classpath.txt')], env)
  const classpath = [join(root,'services/api/target/classes'),readFileSync(join(build,'classpath.txt'),'utf8').trim()].join(delimiter)
  run(join(env.JAVA_HOME,'bin/javac'),['-encoding','UTF-8','-cp',classpath,'-d',build,join(root,'tests/performance/joint/JointApplication.java'),join(root,'tests/performance/joint/GuardSelfTest.java')],{env})
  run(join(env.JAVA_HOME,'bin/java'),['-cp',[build,classpath].join(delimiter),'d22.joint.GuardSelfTest',join(build,'guard-selftest-'+randomUUID())],{env,stdio:'inherit'})
  docker(['image','inspect','codeless-vue-build:d05','--format','{{.Id}}'])
  console.log(JSON.stringify({prepared:true,paidRequests:0})); process.exit(0)
}
assert.ok(!existsSync(out), 'Never reuse a run output')
await mkdir(out,{recursive:true,mode:0o700})
await writeFile(join(out,'invocation.lock'),'one attempt; never auto-retry\n',{flag:'wx',mode:0o600})
const report={kind:'D22_REAL_AUTOMATIC_AB_JOINT',mode,status:'RUNNING',startedAt:new Date().toISOString(),automaticClaims:true,
  manualClaims:false,rewrittenModelReplies:false,retries:0,onlineCutover:false,publicInternetAcceptance:false,
  scope:'immutable A+B; production automatic PLAN/GENERATE/VERIFY/(REPAIR if encountered)/READY, real runner/browser; named loopback HTTPS publishing; explicit host failure control',
  commit:run('git',['rev-parse','HEAD']),startChanges:run('git',['status','--porcelain']),http:[],faults:[],tasks:[],clockCalibration:[],cleanupErrors:[],
  machine:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem(),node:process.version},
  repairCoverage:'NOT_ENCOUNTERED',financial:{authorizedRmb:2,actualDebitedRmb:null,timeoutUsage:null}}
assert.equal(report.startChanges,'','Immutable tracked checkout required')
const sourcePaths=run('git',['ls-files','-z']).split('\0').filter(p=>p&&!p.includes('/evidence/'))
report.sources=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,sha(await readFile(join(root,p)))])))
report.composition=JSON.parse(await readFile(join(dirname(root),'composition.json'),'utf8'))
const save=()=>writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
await save()
const classpath=[build,join(root,'services/api/target/classes'),readFileSync(join(build,'classpath.txt'),'utf8').trim()].join(delimiter)
let database,api,tls,runtime,hosting,browser,collector,scratch,activeFault
const tag='codeless-d22-joint:'+randomUUID()
const containerFile=join(out,'container-ids'), collectorStop=join(out,'collector-stop')
const freePort=async()=>{const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(d=>s.close(d));return p}
const jsonLines=async path=>{try{return (await readFile(path,'utf8')).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x))}catch(e){if(e.code==='ENOENT')return [];throw e}}
const providerEvents=()=>jsonLines(join(out,'provider-events.jsonl'))
async function wait(check,timeout=10000,label='bounded observation') { const end=Date.now()+timeout;while(Date.now()<end){const x=await check();if(x)return x;await sleep(30)}throw Error(label+' deadline') }
try {
  report.imageBefore=docker(['image','inspect','codeless-vue-build:d05','--format','{{.Id}}'])
  report.baselineContainerIds=docker(['ps','-aq','--no-trunc']).split('\n').filter(Boolean)
  report.cgroup={path:await readFile('/proc/self/cgroup','utf8')}
  const group='/sys/fs/cgroup'+report.cgroup.path.trim().split(':').at(-1)
  report.cgroup={memoryMax:await readFile(group+'/memory.max','utf8'),cpuMax:await readFile(group+'/cpu.max','utf8'),swapMax:await readFile(group+'/memory.swap.max','utf8')}
  assert.equal(Number(report.cgroup.memoryMax.trim()),1610612736);assert.equal(Number(report.cgroup.swapMax.trim()),0)
  assert.equal(report.cgroup.cpuMax.trim().split(' ').map(Number).reduce((a,b)=>a/b),1)
  docker(['build','-f','tests/performance/runner/fixtures/Dockerfile','-t',tag,'.'])
  const faultImage=docker(['image','inspect',tag,'--format','{{.Id}}'])
  const apiPort=await freePort(),controlPort=await freePort(),hostingPort=await freePort()
  let platformOrigin
  tls=await tlsServer(join(out,'tls'),(req,res)=>{
    if(req.headers.host!==new URL(platformOrigin).host){if(runtime)return runtime.gateway.server.emit('request',req,res);res.writeHead(404);return res.end()}
    if(req.url.startsWith('/api/')){const u=httpRequest({host:'127.0.0.1',port:apiPort,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});u.setTimeout(15000,()=>u.destroy());u.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.pipe(u);return}
    res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><body>Explicit D22 isolated platform fixture</body></html>')
  })
  platformOrigin='https://platform.codeless.test:'+tls.address().port
  const previewOrigin='https://preview.codeless-preview.test:'+tls.address().port,publicOrigin='https://sites.codeless-public.test:'+hostingPort
  Object.assign(env,{CODELESS_DATABASE_USER:'d22_joint',CODELESS_DATABASE_PASSWORD:'fixture-only-d22-joint',CODELESS_COOKIE_SECURE:'false',
    CODELESS_DEMO_PASSWORD:'demo-password-for-test-only',CODELESS_ADMIN_PASSWORD:'admin-password-for-test-only',
    CODELESS_MODEL_PROVIDER:mode==='REAL'?'deepseek':'deterministic-mock',CODELESS_MODEL_NAME:'deepseek-flash',
    CODELESS_PLATFORM_ORIGIN:platformOrigin,CODELESS_PREVIEW_ORIGIN:previewOrigin,CODELESS_PUBLICATION_ORIGIN:publicOrigin,
    CODELESS_PREVIEW_SIGNING_KEY:'11'.repeat(32),CODELESS_PREVIEW_REGISTRY_KEY:'44'.repeat(32),
    CODELESS_AGENT_PRIVATE_ROOT:join(out,'agent'),CODELESS_FILE_WORKSPACE_ROOT:join(out,'workspaces'),CODELESS_FILE_AUDIT_ROOT:join(out,'file-audit'),
    CODELESS_MODEL_AUDIT_ROOT:join(out,'model-audit'),CODELESS_ADMIN_AUDIT_ROOT:join(out,'admin-audit'),CODELESS_HOSTING_ROOT:join(out,'sites'),
    CODELESS_PREVIEW_API_INTERNAL_ORIGIN:'http://127.0.0.1:'+apiPort,CODELESS_PREVIEW_CONTROL_PORT:String(controlPort),CODELESS_PREVIEW_GATEWAY_PORT:'0',
    CODELESS_JOINT_MODE:mode,CODELESS_JOINT_OUTPUT:out,CODELESS_JOINT_BUDGET_LEDGER:resolve(process.env.CODELESS_JOINT_BUDGET_LEDGER),
    CODELESS_JOINT_APPROVAL:process.env.CODELESS_JOINT_APPROVAL??'MOCK_NO_PAID_CALLS'})
  for(const path of [env.CODELESS_HOSTING_ROOT,env.CODELESS_AGENT_PRIVATE_ROOT,env.CODELESS_FILE_WORKSPACE_ROOT])await mkdir(path,{recursive:true,mode:0o700})
  database=docker(['run','-d','--name','codeless-d22-joint-db-'+randomUUID(),'--label','codeless.test=d22-joint','--memory','384m','--memory-swap','384m','--cpus','0.5',
    '-p','127.0.0.1::5432','-e','POSTGRES_USER=d22_joint','-e','POSTGRES_PASSWORD=fixture-only-d22-joint','-e','POSTGRES_DB=d22_joint',
    'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94'])
  const dbPort=JSON.parse(docker(['inspect',database,'--format','{{json .NetworkSettings.Ports}}']))['5432/tcp'][0].HostPort
  env.CODELESS_DATABASE_URL=`jdbc:postgresql://127.0.0.1:${dbPort}/d22_joint`
  await wait(async()=>{try{await dockerAsync(['exec',database,'pg_isready','-U','d22_joint','-d','d22_joint']);return true}catch{return false}},15000,'PostgreSQL startup')
  api=start(join(env.JAVA_HOME,'bin/java'),['-Xmx384m','-cp',classpath,'d22.joint.JointApplication',
    '--server.address=127.0.0.1','--server.port='+apiPort,'--codeless.agent.enabled=true','--codeless.agent.repair.enabled=true',
    '--codeless.agent.repository-root='+root,'--codeless.agent.private-root='+env.CODELESS_AGENT_PRIVATE_ROOT,'--codeless.agent.node='+process.execPath,
    '--codeless.tasks.poll-ms=100','--codeless.deploy.poll-ms=100','--CODELESS_PREVIEW_GATEWAY_INTERNAL_ORIGIN=http://127.0.0.1:'+controlPort],
    {...env,...(secret?{CODELESS_MODEL_API_KEY:secret}:{})},join(out,'api.log'))
  const origin='http://127.0.0.1:'+apiPort
  await wait(async()=>{assert.equal(api.exitCode,null,'API exited');try{return (await fetch(origin+'/api/v0/auth/csrf',{signal:AbortSignal.timeout(1000)})).status===200}catch{return false}},60000,'API startup')
  runtime=await startPreviewRuntime(env)
  await writeFile(join(out,'nginx.conf'),await hostingConfig({publicOrigin,platformOrigin,previewOrigin}))
  await chmod(join(out,'tls/test-key.pem'),0o644) // disposable loopback fixture certificate only
  // Hosting container uses uid 101; only the disposable hosting/TLS parents are traversable.
  await chmod(join(out,'sites'),0o755);await chmod(join(out,'tls'),0o755)
  hosting=docker(['run','-d','--name','codeless-d22-joint-host-'+randomUUID(),'--label','codeless.test=d22-joint','--read-only','--user','101:101',
    '--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--memory','128m','--cpus','0.5',
    '--tmpfs','/var/cache/nginx:uid=101,gid=101,mode=0700','--tmpfs','/var/run:uid=101,gid=101,mode=0700','-p',`127.0.0.1:${hostingPort}:8443`,
    '--mount',`type=bind,source=${env.CODELESS_HOSTING_ROOT},target=/sites,readonly`,'--mount',`type=bind,source=${join(out,'nginx.conf')},target=/etc/nginx/conf.d/default.conf,readonly`,
    '--mount',`type=bind,source=${join(out,'tls/test-cert.pem')},target=/certs/server.pem,readonly`,'--mount',`type=bind,source=${join(out,'tls/test-key.pem')},target=/certs/server.key,readonly`,'nginx:1.27.5-alpine'])
  docker(['exec',hosting,'nginx','-t'])
  const sql=text=>JSON.parse(docker(['exec',database,'psql','-U','d22_joint','-d','d22_joint','-At','-v','ON_ERROR_STOP=1','-c',text]))
  report.emptyDatabase=sql("SELECT json_build_object('tasks',(SELECT count(*) FROM generation_tasks),'versions',(SELECT count(*) FROM application_versions),'publications',(SELECT count(*) FROM publications))")
  assert.deepEqual(report.emptyDatabase,{tasks:0,versions:0,publications:0})
  async function actor(email){
    let cookie='',csrf
    async function call(path,method='GET',body,extra={}){
      const headers={Cookie:cookie,...extra};if(body)headers['Content-Type']='application/json';if(method!=='GET')headers['X-CSRF-Token']=csrf
      const begin=point(),r=await fetch(origin+'/api/v0/'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)})
      const text=await r.text(),end=point();const value={status:r.status,body:JSON.parse(text),begin,end}
      for(const c of r.headers.getSetCookie())cookie=c.split(';')[0]
      return value
    }
    let r=await call('auth/csrf');assert.equal(r.status,200);csrf=r.body.token
    r=await call('auth/login','POST',{email,password:'demo-password-for-test-only'});assert.equal(r.status,200)
    // Fetch a fresh token after authentication/session rotation.
    r=await call('auth/csrf');csrf=r.body.token
    const created=await call('applications','POST',{name:'D22 joint '+email.split('@')[0],dataMode:'STATIC',template:'VUE'});assert.equal(created.status,201)
    return {call,app:created.body.id,cookie:()=>cookie}
  }
  const a=await actor('demo@codeless.local'),b=await actor('second@codeless.local')
  for(let i=0;i<10;i++){const begin=ns(),r=await a.call('d22-joint-clock'),end=ns();assert.equal(r.status,200);assert.ok(BigInt(begin)<=BigInt(r.body.monotonicNs)&&BigInt(r.body.monotonicNs)<=BigInt(end),'Java and Node CLOCK_MONOTONIC must align');report.clockCalibration.push({begin,end,java:r.body.monotonicNs})}
  collector=start('python3',['tests/performance/runner/resource-monitor.py','--pid',String(api.pid),'--pid',String(process.pid),
    '--out',join(out,'resources'),'--interval','0.5','--duration','1500','--containers-file',containerFile,'--stop-file',collectorStop],env,join(out,'collector.log'))
  await wait(()=>existsSync(join(out,'resources/ready.json')),10000,'Resource sampler readiness')
  async function query(phase,barrier=null){for(let i=0;i<10;i++){const r=await a.call(i%2?'applications':'auth/me');report.http.push({phase,status:r.status,begin:r.begin,end:r.end,barrier});assert.equal(r.status,200);assert.ok(Number(BigInt(r.end.monotonicNs)-BigInt(r.begin.monotonicNs))/1e6<2000,'Ordinary query deadline');if(barrier)assert.ok(BigInt(r.begin.monotonicNs)>=BigInt(barrier.monotonicNs))}}
  const prompt=marker=>`D22_JOINT_${marker}：生成一个 STATIC 静态展示页。页面 h1 必须显示 D22 Joint Ready，正文显示 Ada Lovelace。恰好一个文件 src/pages/HomePage.vue，保持 Vue 单文件组件语法正确。无网络、图片、表单或额外依赖。验收动作检查该 h1 的实际文本。`
  async function submit(who,marker){const r=await who.call('tasks','POST',{applicationId:who.app,prompt:prompt(marker)},{'Idempotency-Key':randomUUID()});assert.equal(r.status,202);report.tasks.push({marker,id:r.body.id,app:who.app,submitted:r.begin});await save();return r.body.id}
  const state=id=>a.call('tasks/'+id)
  const currentCalls=async()=>{const es=await providerEvents();return es.filter(x=>x.kind==='START'&&!es.some(e=>e.kind==='END'&&e.attempt===x.attempt))}
  async function awaitProvider(marker){return wait(async()=>(await currentCalls()).find(x=>x.marker===marker),15000,'Actual provider envelope '+marker)}
  async function sse(who,id,cursor){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);let text=''
    try{const r=await fetch(origin+'/api/v0/tasks/'+id+'/events',{headers:{Cookie:who.cookie(),Accept:'text/event-stream','Last-Event-ID':String(cursor)},signal:controller.signal});assert.equal(r.status,200);const reader=r.body.getReader();while(true){const x=await reader.read();if(x.done)break;text+=new TextDecoder().decode(x.value);if(/id:\s*\d+[\s\S]*?\n\n/.test(text)){await reader.cancel();break}}}finally{clearTimeout(timer)}
    const sequences=[...text.matchAll(/^id:\s*(\d+)\r?$/gm)].map(x=>Number(x[1]));assert.ok(sequences.length&&sequences.every(x=>x>cursor));return {cursor,sequences,raw:text,...point()}
  }
  async function terminal(who,id,expected='READY'){
    const samples=[];const result=await wait(async()=>{const r=await who.call('tasks/'+id);assert.equal(r.status,200);samples.push({status:r.body.status,repairAttempts:r.body.repairAttempts,...r.end});if(['READY','FAILED'].includes(r.body.status))return r.body},720000,'Original task 12 minute deadline')
    const task=report.tasks.find(t=>t.id===id);Object.assign(task,{terminal:result.status,failureCode:result.failureCode,repairAttempts:result.repairAttempts,observations:samples});await save();assert.equal(result.status,expected,'Task terminal '+id+' / '+result.failureCode);return result
  }
  await query('baseline')
  scratch=join(out,'fault-scratch');await mkdir(scratch)
  async function pressure(mode,action){
    let observation
    const runner=await createBuildRunner({workRoot:join(scratch,'work'),artifactRoot:join(scratch,'artifacts'),imageId:faultImage,
      limits:mode==='timeout'?{timeoutMs:8000}:{memoryMiB:96,timeoutMs:15000},onContainerCreated(id){
        activeFault=id
        observation=(async()=>{
          await writeFile(containerFile,id+'\n');await wait(async()=>JSON.parse(await dockerAsync(['inspect',id,'--format','{{json .State}}'])).Running,5000,'Fault startup')
          let barrier
          const cg=async file=>JSON.parse(await dockerAsync(['exec',id,'node','-e',`console.log(JSON.stringify(require('node:fs').readFileSync('/sys/fs/cgroup/${file}','utf8')))`]))
          if(mode==='timeout'){
            await waitForCPULoop(()=>dockerAsync(['top',id,'-eo','pid,ppid,args']))
            const before=await cg('cpu.stat');await sleep(250);const after=await cg('cpu.stat')
            const v=t=>Number(t.match(/^usage_usec (\d+)$/m)[1]);assert.ok(v(after)-v(before)>100000)
            barrier={kind:'CPU_LOOP_AND_USAGE_GROWTH',before,after,...point()}
          }else{
            const mounts=JSON.parse(await dockerAsync(['inspect',id,'--format','{{json .Mounts}}'])),mount=mounts.find(m=>m.Destination==='/output'&&m.RW)
            const dir=await realpath(mount.Source);assert.equal(dirname(dirname(dir)),await realpath(join(scratch,'work')))
            await wait(()=>existsSync(join(dir,'armed.json')),5000,'Delayed pressure arm')
            await query('pre-pressure-negative-control');assert.equal(JSON.parse(await dockerAsync(['inspect',id,'--format','{{json .State}}'])).OOMKilled,false)
            await writeFile(join(dir,'release-pressure'),'explicit host release',{flag:'wx'})
            await waitForOOM(id);const events=await cg('memory.events'),max=await cg('memory.max');assert.ok(Number(events.match(/^oom_kill (\d+)$/m)[1])>0);assert.equal(Number(max),96*1024*1024)
            barrier={kind:'DOCKER_OOMKILLED_AND_CGROUP_OOM_KILL',events,memoryMax:Number(max),...point()}
          }
          await action(barrier)
          const endState=JSON.parse(await dockerAsync(['inspect',id,'--format','{{json .State}}']));assert.equal(endState.Running,true)
          if(mode==='memory'){assert.equal(endState.OOMKilled,true);await dockerAsync(['kill','--signal','USR2',id])}
          return {barrier,release:point(),endState}
        })().then(value=>({value}),error=>({error:error.stack}))
      }})
    const result=await runner(join(root,'tests/runner/build/fixtures',mode))
    const observed=await observation;report.faults.push({mode,result,observed});await save()
    assert.ok(observed&&!observed.error,observed?.error);assert.equal(result.failure,mode==='timeout'?'TIMEOUT':'OOM');assert.equal(result.exitCode,137)
    assert.deepEqual(result.cleanup,{containerRemoved:true,workspaceRemoved:true,errors:[]});activeFault=null
    await query(mode+'-after-cleanup')
  }
  let first,second
  await pressure('timeout',async barrier=>{first=await submit(a,'FIRST');await awaitProvider('FIRST');await query('cpu-with-real-provider',barrier);report.sse=[await sse(a,first,0)];report.sse.push(await sse(a,first,report.sse[0].sequences[0]))})
  // Preserve the production single automatic task worker; do not add a test worker to bypass its queue.
  await terminal(a,first)
  await pressure('memory',async barrier=>{second=await submit(b,'SECOND');await awaitProvider('SECOND');await query('oom-confirmed-with-real-provider',barrier)})
  await terminal(b,second)
  for(const who of [a,b]){const app=await who.call('applications/'+who.app);assert.equal(app.status,200);who.ready=app.body.latestReadyVersionId;assert.ok(who.ready)}
  report.crossUser=[(await a.call('tasks/'+second)).status,(await b.call('tasks/'+first)).status];assert.deepEqual(report.crossUser,[404,404])
  const allEvents=await a.call('tasks/'+first+'/events');assert.equal(allEvents.status,200);report.firstTaskEvents=allEvents.body
  const doneFrames=await sse(a,first,1);report.sse.push(doneFrames);assert.ok(doneFrames.sequences.every(x=>allEvents.body.some(e=>e.sequence===x)))
  // A user-triggered isolated publication; real immutable writer/probe and Chromium readback.
  report.publications=[];browser=await chromium.launch({args:['--host-resolver-rules=MAP *.test 127.0.0.1','--no-proxy-server']})
  for(const who of [a,b]){
    const version=await who.call('versions/'+who.ready);assert.equal(version.status,200)
    const appVersions=await who.call('applications/'+who.app+'/versions');assert.equal(appVersions.status,200)
    const row=appVersions.body.items.find(v=>v.id===who.ready),buildId=row.buildId??version.body.buildId
    const buildResponse=await who.call('builds/'+buildId);assert.equal(buildResponse.status,200)
    const publication=await who.call('publications','POST',{applicationId:who.app,versionId:who.ready,artifactDigest:buildResponse.body.artifactDigest},{'Idempotency-Key':randomUUID()});assert.equal(publication.status,202)
    const observations=[];const deployed=await awaitDeployment(async()=>{const r=await who.call('publications/'+publication.body.id+'/deployment');assert.equal(r.status,200);return r.body},publication.body.id,observations)
    const record=await who.call('publications/'+publication.body.id);assert.equal(record.status,200)
    const context=await browser.newContext({ignoreHTTPSErrors:true});const page=await context.newPage();assert.equal((await page.goto(record.body.url)).status(),200)
    await page.getByRole('heading',{name:heading,exact:true}).waitFor({timeout:15000});await page.screenshot({path:join(out,'published-'+report.publications.length+'.png'),fullPage:true})
    await context.close();who.publication=record.body.id
    report.publications.push({id:record.body.id,versionId:who.ready,phase:deployed.phase,observations,browserReadback:true})
  }
  const cancel=await submit(a,'CANCEL');const active=await awaitProvider('CANCEL'),cancelled=await a.call('tasks/'+cancel+'/cancel','POST');assert.equal(cancelled.status,200);assert.equal(cancelled.body.failureCode,'CANCELLED')
  report.cancellation={taskId:cancel,providerAttempt:active.attempt,requested:cancelled.begin,completed:cancelled.end}
  await wait(async()=>(await providerEvents()).some(x=>x.kind==='END'&&x.attempt===active.attempt),65000,'Cancelled call completion');await terminal(a,cancel,'FAILED')
  assert.equal((await state(cancel)).body.failureCode,'CANCELLED');assert.equal((await a.call('applications/'+a.app)).body.latestReadyVersionId,a.ready)
  // Explicit host infrastructure failure: never substitute a model reply or forge a runner receipt.
  const edit=await a.call('applications/'+a.app+'/edits','POST',{baseVersionId:a.ready,prompt:prompt('FAIL'),source:{type:'CHAT'}},{'Idempotency-Key':randomUUID()});assert.equal(edit.status,202)
  const failId=edit.body.task.id;report.tasks.push({marker:'FAIL',id:failId,app:a.app,submitted:edit.begin});await writeFile(join(out,'fail-task'),failId,{flag:'wx'})
  const failed=await terminal(a,failId,'FAILED');assert.equal(failed.failureCode,'AGENT_RUNNER_UNAVAILABLE');assert.ok(existsSync(join(out,'host-fault.json')))
  assert.equal((await a.call('applications/'+a.app)).body.latestReadyVersionId,a.ready)
  assert.equal((await a.call('applications/'+a.app+'/publications')).body.latestSuccessful.id,a.publication)
  report.retained={versionId:a.ready,publicationId:a.publication,failureTaskId:failId,explicitHostFault:true}
  const download=await fetch(origin+'/api/v0/versions/'+a.ready+'/export',{headers:{Cookie:a.cookie()},signal:AbortSignal.timeout(10000)});assert.equal(download.status,200)
  const bytes=Buffer.from(await download.arrayBuffer());report.retained.exportSha256=sha(bytes);assert.equal(download.headers.get('x-codeless-version-id'),a.ready)
  const pub=await a.call('publications/'+a.publication);const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage();assert.equal((await page.goto(pub.body.url)).status(),200);await page.getByRole('heading',{name:heading,exact:true}).waitFor();await page.screenshot({path:join(out,'retained-after-failure.png'),fullPage:true});await context.close()
  report.retained.browserReadback=true
  await query('final-after-faults')
  report.sql=sql("SELECT json_build_object('tasks',(SELECT json_agg(json_build_object('id',id,'status',status,'failureCode',failure_code,'repairAttempts',repair_attempts)) FROM generation_tasks),'models',(SELECT json_agg(json_build_object('taskId',task_id,'stage',stage,'provider',provider,'model',model,'status',status,'inputTokens',input_tokens,'outputTokens',output_tokens,'errorCode',error_code)) FROM model_calls),'builds',(SELECT json_agg(json_build_object('id',id,'taskId',task_id,'versionId',version_id,'status',status,'exitCode',exit_code,'artifactDigest',artifact_digest)) FROM builds))")
  assert.equal(report.sql.tasks.length,4);assert.equal(report.sql.tasks.filter(t=>t.status==='READY').length,2)
  assert.ok(report.sql.models.length&&report.sql.models.every(x=>x.provider===(mode==='REAL'?'deepseek':'deterministic-mock')))
  report.repairCoverage=report.sql.models.some(x=>x.stage==='REPAIR')?'ACTUAL_REAL_MODEL_REPAIR':'NOT_ENCOUNTERED'
  report.status='PASSED'
}catch(error){report.status='FAILED';report.error=error.stack;console.error(error)}
finally{
  // Resource collection stops before its observed processes. Cleanup failures fail the business result.
  if(collector){await writeFile(collectorStop,'stop');try{const closed=collector.exitCode===null?await once(collector,'close'):[collector.exitCode,collector.signalCode];report.collectorExitCode=closed[0];assert.equal(closed[0],0)}catch(e){report.cleanupErrors.push({resource:'collector',error:e.message})}}
  for(const [name,fn] of [['browser',()=>browser?.close()],['api',()=>stop(api)],['runtime',()=>runtime?.close()],['tls',()=>tls&&closeServer(tls)]])try{await fn()}catch(e){report.cleanupErrors.push({resource:name,error:e.message})}
  if(activeFault)try{const info=JSON.parse(docker(['inspect',activeFault,'--format','{{json .State}}']));if(info.Running)docker(['kill',activeFault])}catch(e){report.cleanupErrors.push({resource:'active-fault',error:e.message})}
  for(const [name,id] of [['hosting',hosting],['database',database]])if(id)try{assert.equal(docker(['inspect',id,'--format','{{index .Config.Labels "codeless.test"}}']),'d22-joint');docker(['rm','-f',id]);report[name+'Removed']=true}catch(e){report.cleanupErrors.push({resource:name,error:e.message})}
  try{docker(['image','rm',tag]);report.faultImageAliasRemoved=true}catch(e){report.cleanupErrors.push({resource:'fault-image',error:e.message})}
  if(scratch)try{assert.equal(dirname(scratch),out);await rm(scratch,{recursive:true,force:true});report.faultScratchRemoved=true}catch(e){report.cleanupErrors.push({resource:'fault-scratch',error:e.message})}
  report.providerEvents=await providerEvents();report.budgetReservations=await jsonLines(resolve(process.env.CODELESS_JOINT_BUDGET_LEDGER));report.financial.reservedUpperRmb=report.budgetReservations.reduce((s,x)=>s+x.reservedMicroRmb,0)/1e6
  report.endChanges=run('git',['status','--porcelain']);report.changedSources=[]
  for(const [p,d]of Object.entries(report.sources))if(sha(await readFile(join(root,p)))!==d)report.changedSources.push(p)
  report.imageAfter=docker(['image','inspect','codeless-vue-build:d05','--format','{{.Id}}']);report.canonical=report.endChanges===''&&!report.changedSources.length&&run('git',['rev-parse','HEAD'])===report.commit
  report.endedContainerIds=docker(['ps','-aq','--no-trunc']).split('\n').filter(Boolean);report.newRemainingContainers=report.endedContainerIds.filter(x=>!report.baselineContainerIds?.includes(x))
  if(report.cleanupErrors.length||!report.canonical||report.imageBefore!==report.imageAfter||report.newRemainingContainers.length)report.status='FAILED'
  report.completedAt=new Date().toISOString();await save()
  if(report.status==='PASSED')try{qualify(report)}catch(e){report.status='FAILED';report.auditError=e.message;await save()}
  console.log(JSON.stringify({status:report.status,mode,paidAttemptUpperBound:mode==='REAL'?report.budgetReservations.length:0,reservedUpperRmb:report.financial.reservedUpperRmb,error:report.error?.split('\n')[0],auditError:report.auditError}))
  process.exitCode=report.status==='PASSED'?0:1
}
