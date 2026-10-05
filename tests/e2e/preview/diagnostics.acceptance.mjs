import assert from 'node:assert/strict'
import {test} from 'node:test'
import {EventEmitter} from 'node:events'
import {previewDiagnostics} from './platform-diagnostics.mjs'
const platformOrigin='https://platform.codeless.test:4443',previewOrigin='https://preview.codeless-preview.test:4443'
test('diagnostics never serialize credential/query or untrusted path values',()=>{
  const log=previewDiagnostics({platformOrigin,previewOrigin}),secret='SYNTHETIC_SECRET_MARKER'
  const host='v'+'a'.repeat(32)+'.preview.codeless-preview.test:4443'
  const values=[`https://${host}/__preview/start?credential=${secret}`,`${platformOrigin}/api/v0/${secret}?token=${secret}`,`https://attacker.test/${secret}`,`https://${host}/assets/${secret}.js`,`${platformOrigin}/api/v0/auth/session?private=${secret}`]
  for(const value of values)log.record({kind:'probe',...log.location(value)})
  assert.ok(!JSON.stringify(log.snapshot()).includes(secret))
  assert.equal(log.snapshot().events[0].path,'/__preview/start')
  assert.equal(log.snapshot().events[1].path,'/api/v0/REDACTED')
  assert.equal(log.snapshot().events[4].path,'/api/v0/auth/session')
})
test('bounded diagnostics retain the final failure when long generation fills the buffer',()=>{
  const log=previewDiagnostics({platformOrigin,previewOrigin,limit:2})
  for(let status=200;status<=203;status++)log.record({kind:'response',status})
  assert.deepEqual(log.snapshot().events.map(v=>v.status),[202,203]);assert.equal(log.snapshot().truncated,true)
})

test('console and request failures export only enumerated error codes',()=>{
  const log=previewDiagnostics({platformOrigin,previewOrigin}),page=new EventEmitter();log.attach(page)
  page.emit('console',{type:()=> 'error',text:()=> 'net::ERR_SYNTHETIC_SECRET_ERROR'})
  page.emit('requestfailed',{url:()=>platformOrigin+'/api/v0/tasks',failure:()=>({errorText:'net::ERR_SYNTHETIC_SECRET_ERROR'})})
  page.emit('console',{type:()=> 'error',text:()=> 'failed net::ERR_CONNECTION_REFUSED credential=SECRET'})
  assert.deepEqual(log.snapshot().events.map(v=>v.error),['REDACTED','REDACTED','net::ERR_CONNECTION_REFUSED'])
  assert.ok(!JSON.stringify(log.snapshot()).includes('SECRET'))
})
