import { createServer, request as httpRequest } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createPreviewGateway } from './gateway.mjs'
import { createPreviewRegistry } from './registry.mjs'
import { signingKey,uuid } from './credentials.mjs'

export async function startPreviewRuntime(env=process.env) {
  const registryKey=env.CODELESS_PREVIEW_REGISTRY_KEY
  signingKey(registryKey)
  if(registryKey===env.CODELESS_PREVIEW_SIGNING_KEY) throw new Error('separate registry key required')
  const api=new URL(env.CODELESS_PREVIEW_API_INTERNAL_ORIGIN)
  if(api.protocol!=='http:' || api.hostname!=='127.0.0.1' || !api.port || api.pathname!=='/' || api.search || api.hash || api.username || api.password)
    throw new Error('fixed loopback API origin required')
  const port=(name,fallback)=>{const value=Number(env[name]??fallback);if(!Number.isInteger(value)||value<0||value>65535)throw new Error('invalid listen port');return value}
  const gatewayPort=port('CODELESS_PREVIEW_GATEWAY_PORT',8788),controlPort=port('CODELESS_PREVIEW_CONTROL_PORT',8789)
  const host=env.CODELESS_PREVIEW_GATEWAY_HOST??'127.0.0.1'
  if(!['127.0.0.1','0.0.0.0'].includes(host)) throw new Error('invalid gateway interface')
  let registry
  const gateway=createPreviewGateway({signingKeyHex:env.CODELESS_PREVIEW_SIGNING_KEY,previewOrigin:env.CODELESS_PREVIEW_ORIGIN,
    platformOrigin:env.CODELESS_PLATFORM_ORIGIN,isAvailable:()=>registry?.available()??false})
  // Native HTTP to a fixed loopback origin never consults environment proxy settings.
  const loadVersions=()=>new Promise((done,reject)=>{
    const request=httpRequest(api.origin+'/internal/preview/versions',{headers:{'X-Codeless-Preview-Registry-Key':registryKey}},response=>{
      if(response.statusCode!==200) {response.resume();return reject(new Error('catalogue unavailable'))}
      let length=0;const chunks=[]
      response.on('data',chunk=>{length+=chunk.length;if(length>1024*1024)request.destroy(new Error('catalogue too large'));else chunks.push(chunk)})
      response.on('error',reject)
      response.on('end',()=>{try {
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if(!body || Object.keys(body).join(',')!=='versions')throw new Error('invalid catalogue')
        done(body.versions)
      } catch(error) {reject(error)}})
    })
    const timer=setTimeout(()=>request.destroy(new Error('catalogue timeout')),1500)
    request.on('error',reject);request.on('close',()=>clearTimeout(timer));request.end()
  })
  registry=await createPreviewRegistry({gateway,privateRoot:env.CODELESS_AGENT_PRIVATE_ROOT,sourceRoot:env.CODELESS_FILE_WORKSPACE_ROOT,loadVersions})
  const control=createServer(async(request,response)=>{
    const supplied=request.headers['x-codeless-preview-registry-key']
    const auth=typeof supplied==='string' && /^[a-f0-9]{64}$/.test(supplied) && timingSafeEqual(Buffer.from(supplied),Buffer.from(registryKey))
    const send=(status,body)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(body))}
    if(request.method!=='GET' || !auth || request.socket.remoteAddress!=='127.0.0.1')return send(403,{ready:false})
    if(request.url==='/internal/preview/health')return send(registry.available()?200:503,registry.stats())
    const match=request.url?.match(/^\/internal\/preview\/ready\/([^/]+)\/([^/]+)$/)
    if(!match || !uuid.test(match[1]) || !uuid.test(match[2]))return send(404,{ready:false})
    // Wait for the next fixed catalogue reconciliation; this endpoint cannot register user input.
    const deadline=Date.now()+3000
    let ready=registry.ready(match[1],match[2])
    while(!ready && Date.now()<deadline && !response.destroyed) {
      await new Promise(done=>setTimeout(done,100));ready=registry.ready(match[1],match[2])
    }
    send(ready?200:503,ready??{ready:false})
  })
  control.requestTimeout=5000;control.headersTimeout=5000;control.maxConnections=32
  const listen=(server,value,address)=>new Promise((done,reject)=>{server.once('error',reject);server.listen(value,address,done)})
  let timer
  const closeServer=server=>new Promise(done=>{server.close(done);server.closeAllConnections()})
  const close=async()=>{clearInterval(timer);await registry.close();await closeServer(control);await gateway.close()}
  try {
    await listen(gateway.server,gatewayPort,host);await listen(control,controlPort,'127.0.0.1')
    await registry.sync();timer=setInterval(()=>{void registry.sync()},1000)
    return {gateway,registry,control,close}
  } catch(error) {await close().catch(()=>{});throw error}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const runtime=await startPreviewRuntime()
    console.log(JSON.stringify({event:'preview_started',gatewayPort:runtime.gateway.server.address().port,controlPort:runtime.control.address().port}))
    let stopping=false
    for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(stopping)return;stopping=true;void runtime.close().then(()=>process.exit(0),()=>process.exit(1))})
  } catch {console.error('preview runtime configuration/startup failed');process.exitCode=1}
}
