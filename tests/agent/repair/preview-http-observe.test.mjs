import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {instrumentConfig,parseIngressLogs} from './preview-http-observe.mjs'

test('test-only nginx logging excludes credential/query/header fields and preserves upstream/timeouts',async()=>{
  const source=await readFile(new URL('../../../infra/preview/nginx.conf.template',import.meta.url),'utf8')
  const instrumented=instrumentConfig(source),format=instrumented.split('\n').find(line=>line.startsWith('log_format'))
  for(const forbidden of ['$request_uri','$args','$http_cookie','$http_authorization','$request_body'])assert.ok(!format.includes(forbidden))
  assert.ok(instrumented.includes('default 0;'))
  assert.ok(instrumented.includes('GET:/api/v0/tasks/'))
  for(const original of ['proxy_read_timeout 600s;','proxy_read_timeout 5s;','max_fails=0;','error_log /dev/null;','proxy_set_header Authorization "";'])assert.ok(instrumented.includes(original))
})

test('nginx connect/read evidence and missing timings stay distinct without persisting secrets',()=>{
  const id='11111111-1111-1111-1111-111111111111',secret='PRIVATE_COOKIE_QUERY_OR_HEADER'
  const access=JSON.stringify({kind:'ingress.api',route:'application',at:'2026-10-08T03:30:00+00:00',id,status:499,
    upstream:'[fd00::1]:1234',requestSeconds:'30.003',connectSeconds:'-',headerSeconds:'-',responseSeconds:'-',upstreamStatus:'-',cookie:secret})
  const line=phase=>`[error] upstream timed out ${phase}, request: "GET /api/v0/applications/${id}?private=${secret} HTTP/1.1", upstream: "http://[fd00::1]:1234/path?private=${secret}"`
  const report=parseIngressLogs(access+'\n'+line('while connecting to upstream')+'\n'+line('while reading response header from upstream'))
  assert.equal(report.entries[0].status,499);assert.equal(report.entries[0].connectSeconds,null)
  assert.deepEqual(report.entries.slice(1).map(item=>item.phase),['CONNECT','READ_HEADER'])
  assert.ok(!JSON.stringify(report).includes(secret));assert.equal(report.truncated,false)
  const partial=parseIngressLogs(JSON.stringify({...JSON.parse(access),connectSeconds:'-, 0.001',upstreamStatus:'502, 200'})+'\n'+
    `[error] connect() failed (111: Connection refused) while connecting to upstream, request: "GET /api/v0/applications/${id} HTTP/1.1", upstream: "http://[fd00::1]:1234/path"`)
  assert.equal(partial.entries[0].connectSeconds,'-, 0.001');assert.equal(partial.entries[0].upstreamStatus,'502, 200')
  assert.equal(partial.entries[1].errorClass,'CONNECTION_REFUSED');assert.equal(partial.entries[1].errno,'111')
  const task=parseIngressLogs(JSON.stringify({...JSON.parse(access),route:'task'})+'\n'+line('while connecting to upstream').replace('applications/','tasks/'))
  assert.deepEqual(task.entries.map(item=>item.route),['task','task'])
  assert.equal(parseIngressLogs(line('while connecting to upstream').replace('applications/','tasks/').replace('?private=', '/events?private=')).entries.length,0)
})

test('bounded capture records truncation explicitly',()=>{
  const raw=Array.from({length:257},()=>'{"kind":"ingress.api","route":"csrf","status":200}').join('\n')
  const report=parseIngressLogs(raw);assert.equal(report.entries.length,256);assert.equal(report.truncated,true)
})

test('auth reload timings distinguish pre-API connection failure without retaining credentials',()=>{
  const raw='[error] upstream timed out while connecting to upstream, request: "GET /api/v0/auth/me?secret=PRIVATE_AUTH_DATA HTTP/1.1", upstream: "http://[fd00::1]:1234/auth/me"';
  const report=parseIngressLogs(raw+'\n'+JSON.stringify({kind:'ingress.api',route:'auth',status:499,connectSeconds:'-',headerSeconds:'-',upstreamStatus:'-'}));
  assert.deepEqual(report.entries.map(e=>e.route),['auth','auth']);assert.equal(report.entries[0].phase,'CONNECT');assert.equal(report.entries[1].connectSeconds,null);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_AUTH_DATA'));
});
