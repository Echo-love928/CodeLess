// Bounded, allowlisted diagnostics. Never persist headers, cookies, query values or raw errors.
export function previewDiagnostics({platformOrigin,previewOrigin,limit=256}) {
  const errorCode=value=>{const code=value?.match(/net::ERR_[A-Z_]+/)?.[0];return ['net::ERR_ABORTED','net::ERR_CONNECTION_REFUSED','net::ERR_CONNECTION_RESET','net::ERR_TIMED_OUT','net::ERR_NAME_NOT_RESOLVED','net::ERR_CERT_AUTHORITY_INVALID','net::ERR_BLOCKED_BY_RESPONSE','net::ERR_FAILED'].includes(code)?code:'REDACTED'}
  const platform=new URL(platformOrigin),preview=new URL(previewOrigin),events=[]
  let truncated=false
  const location=value=>{try {
    const url=new URL(value)
    if(url.origin===platform.origin) {
      const path=url.pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,':id')
      if(path.startsWith('/api/v0/')) return {site:'platform-api',path:/^\/api\/v0\/(auth\/(csrf|login|session|me)|applications(\/:id(\/versions\/:id\/preview-credentials)?)?|tasks(\/:id(\/(events|diagnostics))?)?)$/.test(path)?path:'/api/v0/REDACTED',queryPresent:Boolean(url.search)}
      return {site:'platform',path:'/document',queryPresent:Boolean(url.search)}
    }
    if(url.protocol===preview.protocol&&url.port===preview.port&&new RegExp('^v[0-9a-f]{32}\\.'+preview.hostname.replaceAll('.','\\.')+'$').test(url.hostname))
      return {site:'preview',path:url.pathname==='/__preview/start'?'/__preview/start':url.pathname==='/'?'/':'/resource',queryPresent:Boolean(url.search)}
  } catch {}
    return {site:'other',path:'REDACTED'}
  }
  const record=event=>{if(events.length===limit){events.shift();truncated=true}events.push({...event,elapsedMs:Date.now()-start})}
  const start=Date.now()
  return {location,record, snapshot:()=>({events,truncated}),
    attach(page) {
      page.on('request',request=>{const url=location(request.url());if(url.site==='preview'||url.site==='platform-api')record({kind:'request',...url,method:request.method()})})
      page.on('response',response=>{const url=location(response.url());if(url.site==='preview'||url.site==='platform-api')record({kind:'response',...url,status:response.status()})})
      page.on('requestfailed',request=>record({kind:'requestfailed',...location(request.url()),error:errorCode(request.failure()?.errorText)}))
      page.on('console',message=>{if(message.type()==='error'||message.type()==='warning')record({kind:'console',type:message.type(),error:errorCode(message.text())})})
      page.on('pageerror',()=>record({kind:'pageerror',error:'REDACTED'}))
      page.on('framenavigated',frame=>record({kind:'navigation',...location(frame.url())}))
    }
  }
}
