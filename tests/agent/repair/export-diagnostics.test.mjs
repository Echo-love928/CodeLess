import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'

const directory=resolve('.local-data/d10-a/export-diagnostics-tests-'+randomUUID())
mkdirSync(directory,{recursive:true})
for(const mode of ['all-timeout','mixed','non-401','tls-absent','non-direct','truncated','process-failure','success','immutable'])test('executable diagnostics exporter uses observed facts: '+mode,()=>{
  const input=join(directory,mode);mkdirSync(input,{recursive:true})
  const environment={kind:'environment',credentialsUsed:false,modelCalls:0,selectedProxy:mode==='non-direct'?'[HTTP @ /127.0.0.1:7897]':'[DIRECT]',defaultProxySelector:'explicit-fixture-selector'}
  const probes=['DEFAULT','EXPLICIT_LOOPBACK_PROXY'].flatMap(route=>['HTTP_1_1','HTTP_2'].map(requestedProtocol=>({kind:'transport',route,requestedProtocol,status:401,defaultTlsValidated:true,peerChain:[]})))
  if(mode==='all-timeout'||mode==='mixed')for(const [index,p]of probes.entries())if(mode==='all-timeout'||index===0){delete p.status;delete p.defaultTlsValidated;p.exceptionClasses=['java.net.http.HttpTimeoutException']}
  if(mode==='non-401')probes[0].status=403
  if(mode==='tls-absent')delete probes[0].defaultTlsValidated
  if(mode==='truncated')probes[0].truncated=true
  writeFileSync(join(input,'network-current.log'),[environment,...probes].map(p=>JSON.stringify(p)).join('\n')+'\n')
  writeFileSync(join(input,'network-current.exit'),mode==='process-failure'?'1':'0')
  writeFileSync(join(input,'network-current-environment.json'),JSON.stringify({fixture:true,credentialsUsed:false}))
  // Adapt only filesystem locations; execute the actual exporter and its actual projection module.
  const root=directory.replaceAll('\\','/'),source=readFileSync('tests/agent/repair/export-diagnostics.mjs','utf8')
    .replace("resolve('tests/agent/repair/evidence')",'resolve('+JSON.stringify(root)+')')
    .replaceAll("'.local-data/d10-a/","'"+input.replaceAll('\\','/')+'/')
    .replace("'./diagnostic-observations.mjs'",JSON.stringify(pathToFileURL(resolve('tests/agent/repair/diagnostic-observations.mjs')).href))
  const script=join(input,'exporter.mjs'),output=join(directory,mode+'-output');writeFileSync(script,source)
  const run=spawnSync(process.execPath,[script,output,input],{encoding:'utf8'});assert.equal(run.status,0,run.stderr)
  const bytes=readFileSync(join(output,'diagnostics.json')),report=JSON.parse(bytes)
  writeFileSync(join(input,'observed.json'),JSON.stringify({fixture:true,realModelCalls:0,exitCode:run.status,network:report.network},null,2))
  if(mode==='success'||mode==='non-direct'||mode==='immutable')assert.equal(report.network.summary?.allTlsAnd401,true)
  else {
    assert.notEqual(report.network.summary?.allTlsAnd401,true)
    assert.equal(report.network.conclusion.includes('Current four connections validated default TLS and returned 401.'),false)
  }
  if(mode==='non-direct')assert.equal(report.network.childEnvironment.defaultSelectedProxy,environment.selectedProxy)
  if(mode==='truncated'||mode==='tls-absent'||mode==='process-failure')assert.equal(report.network.summary.allTlsAnd401,null)
  if(mode==='immutable'){const again=spawnSync(process.execPath,[script,output,input]);assert.equal(again.status,1);assert.deepEqual(readFileSync(join(output,'diagnostics.json')),bytes)}
  console.log(JSON.stringify({mode,evidence:join(input,'observed.json'),allTlsAnd401:report.network.summary?.allTlsAnd401??null}))
})
