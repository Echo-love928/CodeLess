import {cp,mkdir,readFile,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {redoclyEnvironment} from '../../scripts/cli-environment.mjs'
const repo=fileURLToPath(new URL('../../',import.meta.url)),target=join(repo,'.local-data/d15-a/combined-contracts')
await mkdir(target,{recursive:true});await cp(join(repo,'contracts'),target,{recursive:true})
const doc=JSON.parse(await readFile(join(target,'openapi.v0.json'),'utf8'))
const patch=JSON.parse(await readFile(join(target,'deploy/openapi.patch.json'),'utf8'))
Object.assign(doc.paths,patch.paths)
await writeFile(join(target,'openapi.v0.json'),JSON.stringify(doc,null,2)+'\n')
for(const [command,args,env] of [
  [process.execPath,['--test','tests/deploy/contracts.test.mjs'],process.env],
  [process.platform==='win32'?(process.env.ComSpec??'cmd.exe'):'corepack',
    process.platform==='win32'?['/d','/c','corepack','pnpm','exec','redocly','lint',join(target,'openapi.v0.json')]:['pnpm','exec','redocly','lint',join(target,'openapi.v0.json')],redoclyEnvironment()],
]) {
  const r=spawnSync(command,args,{cwd:repo,env,stdio:'inherit'});if(r.error||r.status!==0)process.exit(r.status??1)
}
console.log('D15 deploy schemas and private combined OpenAPI passed; shared contract remains pending registration')
