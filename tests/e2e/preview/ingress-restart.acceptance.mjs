import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createServer} from 'node:http'
import {request} from 'node:https'
import {spawnSync} from 'node:child_process'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {tlsServer,closeServer} from './fixtures.mjs'
import {renderPreviewDeployment} from '../../../infra/preview/render.mjs'

const root=fileURLToPath(new URL('../../../',import.meta.url))
// Only the upstream is a fixture. Real Docker/nginx/TLS exercise the production
// rendered profile. Two aliases make the fault deterministic on single-IP hosts.
async function restart(legacy) {
  const scratch=await mkdtemp(join(tmpdir(),'codeless-ingress-restart-'))
  const project='codeless-ingress-restart-'+randomUUID()
  let server,tls,deployment,started=false
  const listen=port=>new Promise((done,reject)=>{
    server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('gateway-fixture-ready')})
    server.once('error',reject);server.listen(port,'0.0.0.0',()=>done(server.address().port))
  })
  const compose=args=>spawnSync('docker',['compose','--project-name',project,'--file',join(root,'infra/preview/compose.yml'),'--env-file',deployment.envFile,...args],{encoding:'utf8',windowsHide:true,timeout:60000})
  try {
    const port=await listen(0)
    await mkdir(join(scratch,'dist'));await writeFile(join(scratch,'dist/index.html'),'Platform fixture')
    tls=await tlsServer(join(scratch,'tls'),()=>{});const tlsPort=tls.address().port
    await closeServer(tls);tls=null
    deployment=await renderPreviewDeployment({...process.env,CODELESS_PREVIEW_ORIGIN:'https://preview.codeless-preview.test:'+tlsPort,CODELESS_PLATFORM_ORIGIN:'https://platform.codeless.test:'+tlsPort,
      CODELESS_PREVIEW_DEPLOY_ROOT:join(scratch,'ingress'),CODELESS_TLS_CERT:join(scratch,'tls/test-cert.pem'),CODELESS_TLS_KEY:join(scratch,'tls/test-key.pem'),CODELESS_WEB_DIST:join(scratch,'dist'),CODELESS_API_PORT:String(port),CODELESS_PREVIEW_GATEWAY_PORT:String(port)})
    let config=await readFile(deployment.configPath,'utf8')
    const peer=/([ \t]*server host\.docker\.internal:\d+[^\r\n]*;\r?\n)/
    assert.ok(peer.test(config),'Rendered gateway upstream is required by the two-address fixture')
    config=config.replace(peer,'$1$1')
    if(legacy)config=config.replaceAll(' max_fails=0','')
    await writeFile(deployment.configPath,config)
    const up=compose(['up','-d']);assert.equal(up.status,0,up.stderr);started=true
    const syntax=compose(['exec','-T','ingress','nginx','-t']);assert.equal(syntax.status,0,syntax.stderr)
    const get=()=>new Promise((done,reject)=>{
      const req=request('https://127.0.0.1:'+tlsPort+'/restart-probe',{rejectUnauthorized:false,headers:{Host:'v'+'1'.repeat(32)+'.preview.codeless-preview.test:'+tlsPort}},res=>{
        let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>done({status:res.statusCode,fixtureReached:text==='gateway-fixture-ready',nginx502:text.includes('502 Bad Gateway')}))
      });req.setTimeout(5000,()=>req.destroy(new Error('Credential-free ingress probe timeout')));req.on('error',reject);req.end()
    })
    const deadline=Date.now()+15000
    let initial
    while(true){try{initial=await get();if(initial.status===200)break}catch{}
      assert.ok(Date.now()<deadline,'Initial TLS ingress unavailable');await new Promise(done=>setTimeout(done,100))}
    await closeServer(server);server=null
    const stopped=await get()
    await listen(port)
    const restartedAt=Date.now(),firstAfterRestart=await get(),elapsedMs=Date.now()-restartedAt
    return {initial,stopped,firstAfterRestart,elapsedMs,upstreamFixture:true,modelQualityAccepted:false,syntheticPeerAliases:2}
  } finally {
    if(server)await closeServer(server);if(tls)await closeServer(tls)
    if(started){const down=compose(['down','--remove-orphans']);assert.equal(down.status,0,down.stderr)}
    assert.equal(dirname(scratch),resolve(tmpdir()));await rm(scratch,{recursive:true,force:true})
  }
}
test('real nginx does not quarantine the restarted preview gateway after a stopped-upstream probe',{timeout:120000},async()=>{
  const legacy=await restart(true),fixed=await restart(false)
  for(const run of [legacy,fixed]) {
    assert.equal(run.initial.status,200);assert.equal(run.initial.fixtureReached,true)
    assert.equal(run.stopped.status,502);assert.equal(run.stopped.nginx502,true)
    assert.ok(run.elapsedMs<5000,'The first post-restart request must run before the legacy 10s cooldown')
  }
  assert.equal(legacy.firstAfterRestart.status,502)
  assert.equal(legacy.firstAfterRestart.nginx502,true)
  assert.equal(fixed.firstAfterRestart.status,200)
  assert.equal(fixed.firstAfterRestart.fixtureReached,true)
  const report={legacy,fixed,modelQualityAccepted:false,platformApiFixture:true,signingFixture:true,postRestartRetries:0}
  if(process.env.CODELESS_PREVIEW_RESTART_EVIDENCE_DIR){await mkdir(process.env.CODELESS_PREVIEW_RESTART_EVIDENCE_DIR,{recursive:true});await writeFile(join(process.env.CODELESS_PREVIEW_RESTART_EVIDENCE_DIR,'ingress-restart.json'),JSON.stringify(report,null,2))}
  console.log('Ingress restart regression: '+JSON.stringify(report))
})
