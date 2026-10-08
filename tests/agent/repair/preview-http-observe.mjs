import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

const uuid='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const digest=value=>'sha256:'+createHash('sha256').update(value).digest('hex')

// Test-private rendered configuration only. Timeouts, upstreams, routes and credential isolation stay unchanged.
export function instrumentConfig(config) {
  assert.equal(config.split('upstream codeless_preview_gateway {').length,2)
  assert.equal([...config.matchAll(/access_log off;\r?\n    root /g)].length,1)
  const format=`log_format d10_api_timing escape=json '{"kind":"ingress.api","route":"$d10_api_route","at":"$time_iso8601","id":"$upstream_http_x_codeless_diagnostic_id","status":$status,"upstream":"$upstream_addr","requestSeconds":"$request_time","connectSeconds":"$upstream_connect_time","headerSeconds":"$upstream_header_time","responseSeconds":"$upstream_response_time","upstreamStatus":"$upstream_status"}';
map "$request_method:$uri" $d10_api_route {
    default 0;
    "GET:/api/v0/auth/csrf" csrf;
    "~^GET:/api/v0/applications/${uuid}$" application;
    "~^GET:/api/v0/tasks/${uuid}$" task;
}
`
  return config.replace('upstream codeless_preview_gateway {',format+'upstream codeless_preview_gateway {')
    .replace(/access_log off;(\r?\n)    root /,'access_log /dev/stdout d10_api_timing if=$d10_api_route;$1    root ')
}

// Persist an allowlist, never raw nginx error lines (which may include credential-bearing URIs).
export function parseIngressLogs(raw) {
  const entries=[]
  const numeric=value=>/^(?:-|\d+(?:\.\d+)?)(?:, ?(?:-|\d+(?:\.\d+)?))*$/.test(value??'')&&value!=='-'?value:null
  const addresses=value=>/^(?:[0-9.]+|\[[a-fA-F0-9:]+\]):\d+(?:, ?(?:[0-9.]+|\[[a-fA-F0-9:]+\]):\d+)*$/.test(value??'')?value:null
  for(const line of raw.split(/\r?\n/)) {
    const offset=line.indexOf('{"kind":"ingress.api"')
    if(offset>=0) {
      const item=JSON.parse(line.slice(offset));assert.ok(['csrf','application','task'].includes(item.route))
      entries.push({kind:'ingress.api',route:item.route,at:/^\d{4}-\d\d-\d\dT[0-9:+-]+$/.test(item.at??'')?item.at:null,
        id:new RegExp('^'+uuid+'$').test(item.id??'')?item.id:null,status:Number.isInteger(item.status)&&item.status>=100&&item.status<=599?item.status:null,
        upstream:addresses(item.upstream),requestSeconds:numeric(item.requestSeconds),connectSeconds:numeric(item.connectSeconds),
        headerSeconds:numeric(item.headerSeconds),responseSeconds:numeric(item.responseSeconds),upstreamStatus:numeric(item.upstreamStatus)})
    } else if(/\[error\]/.test(line) && /request: "GET \/api\/v0\/(auth\/csrf|(?:applications|tasks)\/[0-9a-f-]{36})(?:[? ]|$)/.test(line)) {
      entries.push({kind:'ingress.error',route:line.includes('GET /api/v0/auth/csrf')?'csrf':line.includes('GET /api/v0/tasks/')?'task':'application',
        phase:line.includes('while connecting to upstream')?'CONNECT':line.includes('while reading response header from upstream')?'READ_HEADER':'UNKNOWN',
        errorClass:line.includes('Connection refused')?'CONNECTION_REFUSED':line.includes('Network is unreachable')?'NETWORK_UNREACHABLE':line.includes('upstream timed out')?'TIMEOUT':'UNKNOWN',
        errno:line.match(/connect\(\) failed \((\d+):/)?.[1]??null,
        timedOut:line.includes('upstream timed out'),upstream:addresses(line.match(/upstream: "http:\/\/([^/]+)\//)?.[1])})
    }
  }
  return {entries:entries.slice(-256),truncated:entries.length>256}
}

if(process.env.CODELESS_REPAIR_HTTP_DIAGNOSTICS==='1') {
  assert.equal(process.env.CODELESS_PREVIEW_ACCEPTANCE_MODEL,'deterministic-mock','Diagnostic wrapper cannot start paid evaluation')
  const evidence=resolve(process.env.CODELESS_PREVIEW_EVIDENCE_DIR),original=childProcess.spawnSync
  let instrumented=false,configDigest=null
  childProcess.spawnSync=function(command,args,options) {
    if(command==='docker' && args?.[0]==='compose' && args[1]==='--project-name' && /^codeless-preview-test-[0-9a-f-]{36}$/.test(args[2]??'')) {
      const envIndex=args.indexOf('--env-file')
      const validateEnvironment=()=>{
        assert.ok(envIndex>0)
        assert.equal(resolve(args[envIndex+1]),join(evidence,'ingress/compose.env'))
      }
      if(args.includes('down')) {
        const fail=()=>{if(!process.exitCode)process.exitCode=1}
        let down
        try {
          validateEnvironment()
          const logs=original(command,[...args.slice(0,envIndex+2),'logs','--no-color','ingress'],{...options,timeout:10000})
          let report={captureExitCode:logs.status??null,instrumented,configDigest,entries:[],truncated:false}
          try {report={...report,...parseIngressLogs((logs.stdout??'')+'\n'+(logs.stderr??''))}}
          catch {report.parseFailure='INGRESS_DIAGNOSTIC_INVALID';fail()}
          if(logs.status!==0)fail()
          writeFileSync(join(evidence,'ingress-api-timings.json'),JSON.stringify(report,null,2)+'\n')
        } catch {
          fail();console.error('Ingress diagnostics could not be captured or persisted.')
        } finally {
          // Diagnostics must never bypass the caller's cleanup or change its arguments/result.
          down=original(command,args,options)
        }
        return down
      }
      validateEnvironment()
      if(args.includes('up')) {
        assert.equal(instrumented,false)
        const path=join(evidence,'ingress/nginx.conf'),config=instrumentConfig(readFileSync(path,'utf8'))
        writeFileSync(path,config);configDigest=digest(config);instrumented=true
      }
    }
    return original(command,args,options)
  }
  syncBuiltinESMExports()
}
