// This function is serialized into the authenticated browser by page.evaluate.
// Errors contain only allowlisted metadata, never response bodies, headers or query values.
export async function platformFetch({path,method='GET',body}) {
  const route=value=>{
    const clean='/api/v0/'+value.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,':id')
    return /^\/api\/v0\/(auth\/csrf|applications(\/:id(\/versions(\/:id\/preview-credentials)?)?)?|tasks(\/:id)?|versions\/:id\/(files(\/content)?|snapshot))$/.test(clean)?clean:'/api/v0/REDACTED'
  }
  const read=async(response,phase,value,verb)=>{
    const type=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase()
    const json=type==='application/json'||/^application\/[a-z0-9.+-]+\+json$/.test(type)
    const metadata={phase,route:route(value),method:['GET','POST','PUT','PATCH','DELETE'].includes(verb)?verb:'REDACTED',
      status:response.status,contentType:json?'json':type==='text/html'?'html':type==='text/plain'?'text':'other'}
    if(!json)throw new Error('PLATFORM_HTTP_NON_JSON '+JSON.stringify(metadata))
    try{return await response.json()}catch{throw new Error('PLATFORM_HTTP_INVALID_JSON '+JSON.stringify(metadata))}
  }
  const csrfResponse=await fetch('/api/v0/auth/csrf')
  const csrf=await read(csrfResponse,'csrf','auth/csrf','GET')
  if(csrfResponse.status!==200||typeof csrf.token!=='string')throw new Error('PLATFORM_CSRF_REJECTED')
  const response=await fetch('/api/v0/'+path,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf.token},...(body?{body:JSON.stringify(body)}:{})})
  return {status:response.status,body:await read(response,'request',path,method)}
}
