import {mkdir,readFile,writeFile,stat} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {previewOrigins} from '../../services/runner/src/preview/credentials.mjs'

export async function renderPreviewDeployment(env=process.env) {
  const {platform,preview}=previewOrigins(env.CODELESS_PREVIEW_ORIGIN,env.CODELESS_PLATFORM_ORIGIN)
  const tlsPort=Number(platform.port||443)
  if(tlsPort!==Number(preview.port||443))throw new Error('this ingress requires a shared TLS port')
  const port=name=>{const value=Number(env[name]);if(!Number.isInteger(value)||value<1||value>65535)throw new Error('invalid fixed upstream port');return String(value)}
  const uid=process.getuid?.()??101,gid=process.getgid?.()??101
  if(uid<1||gid<1)throw new Error('render as an unprivileged service account')
  const output=resolve(env.CODELESS_PREVIEW_DEPLOY_ROOT)
  if(/[\r\n']/u.test(output))throw new Error('invalid output path')
  const paths={CODELESS_TLS_CERT:resolve(env.CODELESS_TLS_CERT),CODELESS_TLS_KEY:resolve(env.CODELESS_TLS_KEY),CODELESS_WEB_DIST:resolve(env.CODELESS_WEB_DIST)}
  for(const [key,path] of Object.entries(paths)) {
    if(/[\r\n']/u.test(path))throw new Error('invalid deployment path')
    const value=await stat(path);if(key==='CODELESS_WEB_DIST'?!value.isDirectory():!value.isFile())throw new Error('missing deployment input')
  }
  await stat(join(paths.CODELESS_WEB_DIST,'index.html'));await mkdir(output,{recursive:true,mode:0o700})
  const values={CODELESS_PLATFORM_HOST:platform.hostname,CODELESS_PREVIEW_HOST:preview.hostname,CODELESS_API_PORT:port('CODELESS_API_PORT'),CODELESS_PREVIEW_GATEWAY_PORT:port('CODELESS_PREVIEW_GATEWAY_PORT')}
  const template=await readFile(new URL('./nginx.conf.template',import.meta.url),'utf8')
  const config=template.replace(/\u0024\{(CODELESS_[A-Z_]+)\}/g,(_,name)=>{if(!values[name])throw new Error('unknown template field');return values[name]})
  if(config.includes('CODELESS_'))throw new Error('unrendered deployment field')
  const configPath=join(output,'nginx.conf'),envFile=join(output,'compose.env')
  await writeFile(configPath,config,{mode:0o600})
  const compose={CODELESS_INGRESS_UID:String(uid),CODELESS_INGRESS_GID:String(gid),CODELESS_TLS_PORT:String(tlsPort),CODELESS_PREVIEW_INGRESS_CONFIG:configPath,...paths}
  await writeFile(envFile,Object.entries(compose).map(([key,value])=>key+"='"+value.replaceAll('\\','/')+"'").join('\n')+'\n',{mode:0o600})
  return {configPath,envFile}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  await renderPreviewDeployment();console.log('Preview TLS ingress configuration rendered.')
}
