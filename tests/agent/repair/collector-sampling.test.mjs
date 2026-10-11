import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync,readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {resolve,join} from 'node:path'
import {randomUUID} from 'node:crypto'
assert.equal(process.platform,'win32','Sampling fixture uses the native Windows collector')
const directory=resolve('.local-data/d10-a/collector-sampling-tests-'+randomUUID());mkdirSync(directory,{recursive:true})
for(const mode of ['absent','wrong-id','wrong-port','owned-with-foreign','foreign-project-result','truncated-list','truncated-cleanup'])test('sampling is bound to this child witness: '+mode,()=>{
  const output=join(directory,mode),args=['-NoProfile','-File','tests/agent/repair/fixtures/collector-sampling.ps1','-Mode',mode,'-Output',output]
  if(process.env.CODELESS_COLLECTOR_SAMPLING_SOURCE)args.push('-SourcePath',process.env.CODELESS_COLLECTOR_SAMPLING_SOURCE)
  const run=spawnSync('pwsh',args,{encoding:'utf8',windowsHide:true,timeout:25000});assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr)
  const report=JSON.parse(readFileSync(join(output,'observed.json'),'utf8'))
  const captured=['owned-with-foreign','truncated-cleanup'].includes(mode)
  assert.equal(report.networkCaptured,captured);assert.equal(report.collectorExit,mode==='owned-with-foreign'?0:1)
  assert.deepEqual(report.probePorts,captured?[12345]:[])
  if(mode==='truncated-cleanup'){assert.equal(report.lifecycle.cleanupFailed,true);for(const kind of ['containers','networks'])assert.equal(report.lifecycle.resources[kind].remaining,null)}
  console.log(JSON.stringify({mode,evidence:join(output,'observed.json'),probePorts:report.probePorts,networkCaptured:report.networkCaptured}))
})
