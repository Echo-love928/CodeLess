// Explicit unpaid EISDIR fault; generation, browser, ingress and compose cleanup remain real.
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import {syncBuiltinESMExports} from 'node:module'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
assert.equal(process.env.CODELESS_PREVIEW_ACCEPTANCE_MODEL,'deterministic-mock')
const evidence=resolve(process.env.CODELESS_PREVIEW_EVIDENCE_DIR),original=childProcess.spawnSync
mkdirSync(join(evidence,'ingress-api-timings.json'))
childProcess.spawnSync=function(command,args,options){
  const result=original(command,args,options)
  if(command==='docker'&&args?.[0]==='compose'&&args.includes('down')){
    const project=args[args.indexOf('--project-name')+1]
    assert.match(project,/^codeless-preview-test-[0-9a-f-]{36}$/)
    const inspect=kind=>{
      const result=original('docker',[kind,'ls','--filter','label=com.docker.compose.project='+project,'--format','{{.ID}}'],{encoding:'utf8',windowsHide:true,timeout:10000})
      return {exitCode:result.status??null,remaining:result.status===0?(result.stdout??'').trim().split(/\r?\n/).filter(Boolean).length:null}
    }
    writeFileSync(join(evidence,'cleanup-observed.json'),JSON.stringify({diagnosticFault:'EISDIR',downExitCode:result.status??null,
      containers:inspect('container'),networks:inspect('network'),realDocker:true},null,2)+'\n')
  }
  return result
}
syncBuiltinESMExports()
await import('./preview-platform-http-diagnostics.acceptance.mjs')
