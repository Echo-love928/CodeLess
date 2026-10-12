// Developer-only, fixed credential-free probe. It does not start Java or generate apps.
// Real nginx/host-gateway/TLS; the host HTTP service is explicitly a fixture.
import {createServer,request as httpRequest} from 'node:http'
import {request as httpsRequest} from 'node:https'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {isIP} from 'node:net'
import {randomUUID} from 'node:crypto'
import {renderPreviewDeployment} from '../../../infra/preview/render.mjs'
import {tlsServer,closeServer} from '../preview/fixtures.mjs'

if(process.argv.length!==2)throw new Error('No command, target, port or URL arguments are accepted')
const root=fileURLToPath(new URL('../../../',import.meta.url)),runId=randomUUID()
const output=join(root,'.local-data/d11-b/network-probes',runId)
await mkdir(output,{recursive:true})
const scratch=await mkdtemp(join(await realpath(tmpdir()),'codeless-host-probe-'))
const project='codeless-host-probe-'+runId,execute=promisify(execFile)
const report={runId,platformApiFixture:true,signingFixture:true,modelRequests:0,paidRequests:0,
  scope:'credential-free fixture TCP/HTTP connectivity; not D11 panel acceptance',startedAt:new Date().toISOString(),
  dockerVersion:null,peers:[],samples:[],cleanup:null,status:'RUNNING'}
let server,tls,deployment,attempted=false,hostRequests=0
const safeEnv={...process.env}
for(const name of ['CODELESS_MODEL_API_KEY','CODELESS_MODEL_NAME','CODELESS_MODEL_PROVIDER'])delete safeEnv[name]
const docker=async args=>{try{return {...await execute('docker',args,{encoding:'utf8',timeout:20000,maxBuffer:65536,windowsHide:true,env:safeEnv}),exitCode:0}}
  catch(error){return {stdout:error.stdout??'',stderr:error.stderr??'',exitCode:Number.isInteger(error.code)?error.code:null,timedOut:Boolean(error.killed)}}}
const compose=args=>docker(['compose','--project-name',project,'--file',join(root,'infra/preview/compose.yml'),'--env-file',deployment.envFile,...args])
const get=(secure,port,host)=>new Promise(done=>{
  const start=Date.now(),finish=value=>done({...value,elapsedMs:Date.now()-start})
  const req=(secure?httpsRequest:httpRequest)({host:'127.0.0.1',port,path:'/api/v0/auth/csrf',agent:false,
    ...(secure?{rejectUnauthorized:false,headers:{Host:host}}:{})},res=>{res.resume();res.on('end',()=>finish({status:res.statusCode,error:null}))})
  const deadline=setTimeout(()=>req.destroy(Object.assign(new Error('probe deadline'),{code:'ETIMEDOUT'})),4000)
  req.on('close',()=>clearTimeout(deadline))
  req.on('error',error=>finish({status:null,error:['ETIMEDOUT','ECONNREFUSED','ECONNRESET'].includes(error.code)?error.code:'UNKNOWN'}));req.end()
})
try {
  const version=await docker(['version','--format','{{.Server.Version}}'])
  if(version.exitCode!==0)throw new Error('DOCKER_VERSION_UNAVAILABLE')
  report.dockerVersion=/^\d+\.\d+\.\d+$/.test(version.stdout.trim())?version.stdout.trim():'UNKNOWN'
  server=createServer((req,res)=>{hostRequests++;res.writeHead(req.url==='/api/v0/auth/csrf'?200:404,{'Content-Type':'application/json'});res.end('{"fixture":true}')})
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'0.0.0.0',done)})
  const port=server.address().port
  await mkdir(join(scratch,'dist'));await writeFile(join(scratch,'dist/index.html'),'Connectivity fixture')
  tls=await tlsServer(join(scratch,'tls'),()=>{});const tlsPort=tls.address().port;await closeServer(tls);tls=null
  const host='platform.codeless.test:'+tlsPort
  deployment=await renderPreviewDeployment({CODELESS_PREVIEW_ORIGIN:'https://preview.codeless-preview.test:'+tlsPort,CODELESS_PLATFORM_ORIGIN:'https://'+host,
    CODELESS_PREVIEW_DEPLOY_ROOT:join(scratch,'ingress'),CODELESS_TLS_CERT:join(scratch,'tls/test-cert.pem'),CODELESS_TLS_KEY:join(scratch,'tls/test-key.pem'),
    CODELESS_WEB_DIST:join(scratch,'dist'),CODELESS_API_PORT:String(port),CODELESS_PREVIEW_GATEWAY_PORT:String(port)})
  attempted=true
  if((await compose(['up','-d'])).exitCode!==0)throw new Error('COMPOSE_UP_FAILED')
  if((await compose(['exec','-T','ingress','nginx','-t'])).exitCode!==0)throw new Error('NGINX_CONFIG_FAILED')
  const hosts=await compose(['exec','-T','ingress','cat','/etc/hosts'])
  if(hosts.exitCode!==0)throw new Error('HOSTS_UNAVAILABLE')
  const peers=[...new Set(hosts.stdout.split(/\r?\n/).filter(line=>line.trim().split(/\s+/).slice(1).includes('host.docker.internal'))
    .map(line=>line.trim().split(/\s+/)[0]).filter(value=>isIP(value)))].slice(0,2)
  if(!peers.length)throw new Error('NO_HOST_GATEWAY_PEERS')
  report.peers=peers.map(address=>({address,family:isIP(address)}))
  // 24 rounds, four fresh nginx connections per round. No failed request is retried.
  // TLS startup readiness only; requests do not touch a real API or model.
  await new Promise(done=>setTimeout(done,1000))
  for(let round=0;round<24;round++) {
    const direct=await get(false,port)
    const ingress=await Promise.all(Array.from({length:4},()=>get(true,tlsPort,host)))
    const raw=[]
    if(round===0||round===23||direct.status!==200||ingress.some(value=>value.status!==200)) {
      for(const address of peers) {
        const start=Date.now(),target=isIP(address)===6?'['+address+']':address
        const value=await compose(['exec','-T','ingress','wget','-S','-O','/dev/null','-T','3','http://'+target+':'+port+'/api/v0/auth/csrf'])
        const status=Number((value.stderr+'\n'+value.stdout).match(/HTTP\/\d(?:\.\d)? (\d{3})/)?.[1])||null
        raw.push({family:isIP(address),address,status,exitCode:value.exitCode,elapsedMs:Date.now()-start,
          error:status?null:value.timedOut||/timed out/i.test(value.stderr)?'TIMEOUT':/refused/i.test(value.stderr)?'CONNECTION_REFUSED':/unreachable/i.test(value.stderr)?'NETWORK_UNREACHABLE':'UNKNOWN'})
      }
    }
    report.samples.push({round,direct,ingress,raw})
    if(direct.status!==200||ingress.some(value=>value.status!==200))throw new Error('CONNECTIVITY_PROBE_FAILED')
  }
  report.status='PASSED'
} catch(error) {report.status='FAILED';report.failure=/^[A-Z_]+$/.test(error.message)?error.message:'PROBE_SETUP_OR_RUNTIME_FAILED';process.exitCode=1}
finally {
  const failures=[]
  if(attempted){const down=await compose(['down','--remove-orphans']);if(down.exitCode!==0)failures.push('COMPOSE_DOWN_FAILED')}
  try{if(server)await closeServer(server);if(tls)await closeServer(tls)}catch{failures.push('SERVER_CLOSE_FAILED')}
  try{if(dirname(await realpath(scratch))!==await realpath(tmpdir()))throw new Error('SCRATCH_PARENT_MISMATCH')
    await rm(scratch,{recursive:true,force:true})}catch{failures.push('SCRATCH_CLEANUP_FAILED')}
  report.cleanup={failures,success:failures.length===0};report.hostRequests=hostRequests;report.completedAt=new Date().toISOString()
  if(failures.length){report.status='FAILED';process.exitCode=1}
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'})
  console.log(JSON.stringify({status:report.status,rounds:report.samples.length,peers:report.peers,cleanup:report.cleanup,report:resolve(output,'report.json')}))
}
