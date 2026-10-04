import assert from 'node:assert/strict'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { chromium,expect } from '@playwright/test'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { randomUUID } from 'node:crypto'
import { renderPreviewDeployment } from '../../../infra/preview/render.mjs'
import { spawnSync } from 'node:child_process'
import { mkdir,writeFile,rm,readFile } from 'node:fs/promises'
import { resolve,join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startPreviewRuntime } from '../../../services/runner/src/preview/main.mjs'
import { readSnapshot,digest } from '../../../services/runner/src/artifacts/snapshot.mjs'
import { tlsServer,closeServer } from './fixtures.mjs'

// Real HTTP/SQL/auth/issuer/runner/gateway; mock model output is explicitly separate from model quality.
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)))
const evidence=resolve(process.env.CODELESS_PREVIEW_EVIDENCE_DIR)
await mkdir(evidence,{recursive:true})
const platformOrigin=process.env.CODELESS_PLATFORM_ORIGIN,previewOrigin=process.env.CODELESS_PREVIEW_ORIGIN
const apiOrigin=process.env.CODELESS_PREVIEW_API_INTERNAL_ORIGIN
let runtime,browser,tls,deployment
const project='codeless-preview-test-'+randomUUID()
const compose=(args)=>spawnSync('docker',['compose','--project-name',project,'--file',join(root,'infra/preview/compose.yml'),'--env-file',deployment.envFile,...args],{encoding:'utf8',windowsHide:true,timeout:60000})
const observed=[]
try {
  runtime=await startPreviewRuntime({...process.env,CODELESS_PREVIEW_GATEWAY_HOST:'0.0.0.0'})
  const dist=join(evidence,'platform-dist')
  const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir',dist],{cwd:join(root,'apps/web'),encoding:'utf8',timeout:30000,windowsHide:true,env:{...process.env,VITE_CODELESS_PREVIEW_ORIGIN:previewOrigin}})
  assert.equal(build.status,0,build.stdout+build.stderr)
  tls=await tlsServer(join(evidence,'tls'),()=>{});await closeServer(tls);tls=null
  deployment=await renderPreviewDeployment({...process.env,CODELESS_PREVIEW_DEPLOY_ROOT:join(evidence,'ingress'),CODELESS_TLS_CERT:join(evidence,'tls/test-cert.pem'),CODELESS_TLS_KEY:join(evidence,'tls/test-key.pem'),CODELESS_WEB_DIST:dist,CODELESS_API_PORT:new URL(apiOrigin).port,CODELESS_PREVIEW_GATEWAY_PORT:String(runtime.gateway.server.address().port)})
  const up=compose(['up','-d']);assert.equal(up.status,0,up.stdout+up.stderr)
  const syntax=compose(['exec','-T','ingress','nginx','-t']);assert.equal(syntax.status,0,syntax.stdout+syntax.stderr)
  const reachable=()=>new Promise(done=>{const req=httpsRequest('https://127.0.0.1:'+new URL(platformOrigin).port,{rejectUnauthorized:false,headers:{Host:new URL(platformOrigin).host}},res=>{res.resume();res.on('end',()=>done(res.statusCode===200))});req.setTimeout(1000,()=>req.destroy());req.on('error',()=>done(false));req.end()})
  const deadline=Date.now()+15000;while(!await reachable()){if(Date.now()>deadline)throw new Error('TLS ingress unavailable');await new Promise(done=>setTimeout(done,100))}
  runtime.gateway.server.on('request',request=>observed.push({platformCookie:(request.headers.cookie??'').includes('JSESSIONID='),authorization:Boolean(request.headers.authorization)}))
  browser=await chromium.launch({args:['--host-resolver-rules=MAP *.codeless.test 127.0.0.1, MAP *.codeless-preview.test 127.0.0.1','--no-proxy-server']})
  const context=await browser.newContext({baseURL:platformOrigin,ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},proxy:{server:'http://127.0.0.1:9',bypass:'*.codeless.test,*.codeless-preview.test,127.0.0.1'}})
  const page=await context.newPage()
  await page.goto('/login');await page.getByLabel('邮箱').fill('demo@codeless.local');await page.getByLabel('密码').fill('demo-password-for-test-only');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page).toHaveURL(/\/apps$/)
  const call=async(path,method='GET',body)=>page.evaluate(async({path,method,body})=>{
    const csrf=await (await fetch('/api/v0/auth/csrf')).json()
    const response=await fetch('/api/v0/'+path,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf.token},...(body?{body:JSON.stringify(body)}:{})})
    return {status:response.status,body:await response.json()}
  },{path,method,body})
  const created=await call('applications','POST',{name:'真实鉴权预览联调',dataMode:'STATIC',template:'VUE'})
  assert.equal(created.status,201);const app=created.body.id
  await page.evaluate(()=>{localStorage.setItem('platform-secret','private-platform-value');sessionStorage.setItem('platform-secret','private-platform-session')})
  await page.goto('/workbench/'+app)
  await page.getByLabel('需求描述').fill('生成静态个人展示页，使用两个 Vue 文件展示 Ada Lovelace 与作品列表')
  const started=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v0/tasks'&&r.request().method()==='POST')
  await page.getByRole('button',{name:'开始生成',exact:true}).click()
  const task=(await (await started).json()).id
  const iframe=page.locator('iframe'),frame=page.frameLocator('iframe')
  await expect(frame.getByTestId('profile-name')).toHaveText('Ada Lovelace',{timeout:90000})
  const appState=await call('applications/'+app);const version=appState.body.latestReadyVersionId
  assert.ok(version);await expect(iframe).toHaveAttribute('src',new RegExp(version.replaceAll('-','')))
  const isolation=await frame.locator('#app').evaluate(()=>{
    const errors=[];for(const read of [()=>parent.localStorage.getItem('platform-secret'),()=>parent.sessionStorage.getItem('platform-secret'),()=>parent.document.cookie])try{read()}catch(error){errors.push(error.name)}
    localStorage.setItem('preview-only','retained-preview-value')
    return {errors,cookie:document.cookie,platform:localStorage.getItem('platform-secret')}
  })
  assert.deepEqual(isolation.errors,['SecurityError','SecurityError','SecurityError']);assert.equal(isolation.platform,null);assert.ok(!isolation.cookie.includes('JSESSIONID'))
  assert.ok((await context.cookies()).some(c=>c.name==='JSESSIONID'&&c.domain==='platform.codeless.test'&&c.httpOnly))
  assert.ok(observed.length>0&&observed.every(v=>!v.platformCookie&&!v.authorization))
  await page.screenshot({path:join(evidence,'authenticated-platform-preview.png'),fullPage:true})
  const issued=await call('applications/'+app+'/versions/'+version+'/preview-credentials','POST');assert.equal(issued.status,200)
  const ajv=new Ajv2020({strict:true});addFormats(ajv);const validate=ajv.compile(JSON.parse(await readFile(join(root,'contracts/schemas/v0/preview-credential.schema.json'),'utf8')));assert.ok(validate(issued.body),ajv.errorsText(validate.errors))
  const url=new URL(issued.body.url),token=url.searchParams.get('credential')
  const gatewayGet=(path,cookie)=>new Promise((done,reject)=>{const req=httpRequest('http://127.0.0.1:'+runtime.gateway.server.address().port,{path,headers:{Host:url.host,...(cookie?{Cookie:cookie}:{})}},res=>{res.resume();res.on('end',()=>done(res.statusCode))});req.on('error',reject);req.end()})
  assert.equal(await gatewayGet('/'),403);assert.equal(await gatewayGet('/__preview/start?credential='+token.slice(0,-1)+'!'),403)
  const catalogue=await fetch(apiOrigin+'/internal/preview/versions',{headers:{'X-Codeless-Preview-Registry-Key':process.env.CODELESS_PREVIEW_REGISTRY_KEY}})
  assert.equal(catalogue.status,200);const binding=(await catalogue.json()).versions.find(v=>v.versionId===version);assert.ok(binding)
  assert.equal((await fetch(apiOrigin+'/internal/preview/versions')).status,403)
  const publicInternal=await page.evaluate(async()=> (await fetch('/internal/preview/versions')).status);assert.equal(publicInternal,404)
  const firstStats=runtime.registry.stats();assert.equal(firstStats.mapped,1)
  const gatewayPort=runtime.gateway.server.address().port;await runtime.close();runtime=await startPreviewRuntime({...process.env,CODELESS_PREVIEW_GATEWAY_HOST:'0.0.0.0',CODELESS_PREVIEW_GATEWAY_PORT:String(gatewayPort)});assert.equal(runtime.registry.stats().mapped,1)
  const refreshed=page.waitForResponse(r=>r.url().includes('/preview-credentials')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'刷新预览',exact:true}).click();assert.equal((await refreshed).status(),200);await expect(frame.getByTestId('profile-name')).toHaveText('Ada Lovelace')
  assert.equal(await frame.locator('#app').evaluate(()=>localStorage.getItem('preview-only')),'retained-preview-value')
  await page.reload();await expect(frame.getByTestId('profile-name')).toHaveText('Ada Lovelace')
  const journal=(await readSnapshot(join(process.env.CODELESS_AGENT_PRIVATE_ROOT,'journal',task))).buffers
  const events=[...journal.values()].map(b=>JSON.parse(b.toString('utf8'))),draft=events.findLast(v=>v.kind==='draft').payload,result=events.findLast(v=>v.kind==='runner.result').payload
  assert.equal(draft.files.length,2);assert.equal(result.build.status,'SUCCEEDED');assert.equal(result.verification.status,'PASSED')
  const retainedReceipt=join(process.env.CODELESS_AGENT_PRIVATE_ROOT,'receipts',result.executionId+'.json')
  await rm(retainedReceipt);await runtime.registry.sync();assert.equal(runtime.registry.stats().mapped,0)
  assert.equal(await gatewayGet('/','__Host-codeless-preview='+token),404)
  assert.equal((await call('applications/'+app+'/versions/'+version+'/preview-credentials','POST')).status,503)
  // Restore host evidence after the retention test so the complete receipt is available for review.
  await writeFile(retainedReceipt,JSON.stringify(result),{flag:'wx'});await runtime.registry.sync();assert.equal(runtime.registry.stats().mapped,1)
  const screenshot=await readFile(join(evidence,'authenticated-platform-preview.png'))
  await writeFile(join(evidence,'acceptance.json'),JSON.stringify({applicationId:app,taskId:task,versionId:version,buildId:binding.buildId,sourceDigest:binding.sourceDigest,artifactDigest:binding.artifactDigest,sourceFiles:draft.files.length,
    deploymentIngress:'nginx:1.27.5-alpine',modelProvider:'deterministic-mock',modelQualityAccepted:false,platformApiFixture:false,signingFixture:false,realDockerBuild:true,realBrowserVerification:true,residentRestartPassed:true,retentionRevocationPassed:true,publicInternalDenied:true,isolation,
    screenshot:{path:'authenticated-platform-preview.png',digest:digest(screenshot),bytes:screenshot.length}},null,2))
  console.log('Authenticated platform preview, restart and retention acceptance passed (model: deterministic-mock).')
} finally {await browser?.close();if(tls)await closeServer(tls);await runtime?.close();if(deployment){const down=compose(['down','--remove-orphans']);assert.equal(down.status,0,down.stdout+down.stderr)}}
