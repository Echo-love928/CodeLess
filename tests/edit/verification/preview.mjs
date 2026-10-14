// Real issuer + immutable registry + TLS + browser after explicit restore. Only loopback test hosts are routed.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {request} from 'node:http'
import {join} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {startPreviewRuntime} from '../../../services/runner/src/preview/main.mjs'
import {tlsServer,closeServer} from '../../e2e/preview/fixtures.mjs'
import {digest} from '../../../services/runner/src/artifacts/snapshot.mjs'
const input=JSON.parse(await readFile(process.argv[2],'utf8'))
assert.equal(new URL(input.apiOrigin).hostname,'127.0.0.1')
const previewOrigin=`https://preview.codeless-preview.test:${input.tlsPort}`
let runtime,tls,browser,primary
try {
  runtime=await startPreviewRuntime({CODELESS_PREVIEW_API_INTERNAL_ORIGIN:input.apiOrigin,
    CODELESS_PREVIEW_SIGNING_KEY:'11'.repeat(32),CODELESS_PREVIEW_REGISTRY_KEY:'44'.repeat(32),
    CODELESS_PREVIEW_ORIGIN:previewOrigin,CODELESS_PLATFORM_ORIGIN:`https://platform.codeless.test:${input.tlsPort}`,
    CODELESS_AGENT_PRIVATE_ROOT:input.privateRoot,CODELESS_FILE_WORKSPACE_ROOT:input.sourceRoot,
    CODELESS_PREVIEW_CONTROL_PORT:String(input.controlPort),CODELESS_PREVIEW_GATEWAY_PORT:'0'})
  tls=await tlsServer(join(input.evidence,'tls'),(incoming,outgoing)=>{
    if(!/^v[a-f0-9]{32}\.preview\.codeless-preview\.test:\d+$/.test(incoming.headers.host??'')) {
      outgoing.writeHead(403);outgoing.end();return
    }
    const upstream=request({host:'127.0.0.1',port:runtime.gateway.server.address().port,path:incoming.url,method:incoming.method,
      headers:{host:incoming.headers.host,cookie:incoming.headers.cookie??'','sec-fetch-dest':incoming.headers['sec-fetch-dest']??'document'}},response=>{
      outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing)
    })
    upstream.setTimeout(5000,()=>upstream.destroy());upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end()});upstream.end()
  },input.tlsPort)
  browser=await chromium.launch({args:['--host-resolver-rules=MAP *.codeless-preview.test 127.0.0.1','--no-proxy-server']})
  const context=await browser.newContext({ignoreHTTPSErrors:true,proxy:{server:'http://127.0.0.1:9',bypass:'*.codeless-preview.test'}})
  const reads=[]
  for(const [index,version] of input.versions.entries()) {
    const response=await fetch(`${input.apiOrigin}/api/v0/applications/${input.app}/versions/${version}/preview-credentials`,{
      method:'POST',headers:{Cookie:input.cookie,'X-CSRF-Token':input.csrf}})
    assert.equal(response.status,200);const credential=await response.json();assert.equal(credential.versionId,version)
    const page=await context.newPage()
    page.on('request',req=>assert.ok(new URL(req.url()).hostname.endsWith('.codeless-preview.test')))
    await page.goto(credential.url)
    const text=index===0?'Ada Lovelace':'Hedy Lamarr'
    await expect(page.getByTestId('profile-name')).toHaveText(text)
    if(index===1) await expect(page.locator('[data-ai-component=profile-card]')).toHaveCSS('color','rgb(51, 68, 170)')
    const file=`restore-original-${index}.png`,bytes=await page.screenshot({path:join(input.evidence,file)})
    reads.push({versionId:version,credentialHttpStatus:response.status,actualBrowserText:text,
      screenshot:{path:file,bytes:bytes.length,digest:digest(bytes)}})
    await page.close()
  }
  await writeFile(join(input.evidence,'preview.json'),JSON.stringify({realIssuer:true,realRegistry:true,realTLS:true,realChromium:true,
    signingFixture:false,versions:reads},null,2)+'\n')
} catch(error) {primary=error;throw error} finally {
  const failures=[]
  for(const close of [()=>browser?.close(),()=>tls&&closeServer(tls),()=>runtime?.close()]) try {await close()}catch(error){failures.push(error)}
  if(failures.length){if(primary)primary.cleanupFailures=failures;else throw new AggregateError(failures,'Preview cleanup failed')}
}
