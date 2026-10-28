// Keep complete logs/raw replies private. Publish only the already whitelisted derivative and byte digests.
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,existsSync,statSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {connection} from './remote.mjs';
const state=JSON.parse(readFileSync(process.argv[2],'utf8')),runId=process.argv[3];
if(!/^codeless-d22-a-[a-f0-9-]+$/.test(state.id)||state.remote!=='/var/tmp/'+state.id||!/^(?:mock|real)-[a-f0-9-]+$/.test(runId))throw Error('Invalid owned run');
const local=resolve(process.env.CODELESS_CAPACITY_LOCAL_PRIVATE??'.local-data/d22-a-real'),out=join(local,state.id,runId);mkdirSync(out,{recursive:true,mode:0o700});
const archive=join(out,'raw-evidence.tar.gz'),fd=openSync(archive,'wx',0o600),err=openSync(join(out,'collection.log'),'wx',0o600);
const r=spawnSync('ssh',[...connection(process.env.CODELESS_CAPACITY_SSH_CONFIG_FILE),`cd '${state.remote}/private' && tar -czf - '${runId}' '${runId}-unit.log'`],{windowsHide:true,stdio:['ignore',fd,err],timeout:120000});closeSync(fd);closeSync(err);
if(r.status!==0)throw Error('Protected archive collection failed');
const names=spawnSync('tar',['-tzf',archive],{encoding:'utf8'});if(names.status!==0)throw Error('Invalid archive');
for(const path of names.stdout.trim().split(/\r?\n/))if(path.startsWith('/')||path.split('/').includes('..')||!(path===runId+'-unit.log'||path.startsWith(runId+'/')))throw Error('Archive path outside owned run');
const extraction=spawnSync('tar',['-xzf',archive,'-C',out],{windowsHide:true});if(extraction.status!==0)throw Error('Evidence extraction failed');
const raw=join(out,runId),report=join(raw,'anonymous-report.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const rawFiles={};function walk(path,rel=''){for(const name of readdirSync(path)){const p=join(path,name),k=rel?rel+'/'+name:name;if(statSync(p).isDirectory())walk(p,k);else rawFiles[k]=sha(readFileSync(p));}}walk(raw);
const dest=resolve('tests/performance/api/evidence/'+runId);mkdirSync(dest,{recursive:true});
const command=JSON.parse(readFileSync(join(raw,'command.json'),'utf8'));
const manifest={runId,mode:command.mode,nativeExit:command.exitCode,signal:command.signal,sourceRevision:state.sourceRevision,canonical:false,candidateArchiveSha256:state.archiveSha256,candidateManifestSha256:state.manifestSha256,
  privateArchiveSha256:sha(readFileSync(archive)),privateRawFileCount:Object.keys(rawFiles).length,rawFiles,
  rawArchivePublished:false,reportKind:'ANONYMIZED_DERIVATIVE; source-bound isolated candidate, not online service or merged commit'};
if(existsSync(report)){
  const bytes=readFileSync(report),text=bytes.toString('utf8');
  if((process.env.CODELESS_MODEL_API_KEY&&text.includes(process.env.CODELESS_MODEL_API_KEY))||/Bearer\s|BEGIN .*PRIVATE KEY|\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(text))throw Error('Sensitive content in derivative; publication blocked');
  writeFileSync(join(dest,'anonymous-report.json'),bytes,{flag:'wx'});manifest.publicReportSha256=sha(bytes);
}
writeFileSync(join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({collected:true,runId,nativeExit:manifest.nativeExit,rawFiles:manifest.privateRawFileCount,publicReport:existsSync(report)}));
