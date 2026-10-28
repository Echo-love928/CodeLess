// Upload a source-bound, opt-in measurement candidate. No online service/configuration is touched.
import {cpSync,mkdirSync,readFileSync,writeFileSync,readdirSync,statSync,openSync,closeSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {connection} from './remote.mjs';
const local=resolve(process.env.CODELESS_CAPACITY_LOCAL_PRIVATE??'.local-data/d22-a-real');
const id='codeless-d22-a-'+randomUUID(), remote='/var/tmp/'+id, root=resolve(import.meta.dirname,'../../..'), stage=join(local,id,'package');
mkdirSync(stage,{recursive:true,mode:0o700});
for(const path of ['services/api/pom.xml','services/api/mvnw','services/api/.mvn','services/api/target/classes','services/api/target/test-classes',
  'services/api/src/main','services/api/src/test/java/dev/codeless/api/performance/RealModelCapacityIT.java','tests/performance/api/run-capacity.mjs','tests/performance/api/capacity-report.mjs']){
  const dest=join(stage,path);mkdirSync(dirname(dest),{recursive:true});cpSync(join(root,path),dest,{recursive:true});
}
const sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const wrapper=join(stage,'services/api/mvnw');
writeFileSync(wrapper,readFileSync(wrapper,'utf8').replaceAll('\r\n','\n'));
const files={};function walk(path,rel=''){for(const name of readdirSync(path)){const p=join(path,name),r=rel?rel+'/'+name:name;if(statSync(p).isDirectory())walk(p,r);else files[r]=sha(readFileSync(p));}}walk(stage);
const git=spawnSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
if(git.status!==0)throw Error('Source revision unavailable');
const manifest={sourceRevision:git.stdout.trim(),canonical:false,transforms:['services/api/mvnw: CRLF to LF for Linux'],note:'Compiled candidate plus exact source digests; preparation edits may be uncommitted. No merged or online deployment claim.',files};
writeFileSync(join(stage,'candidate-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const archive=join(local,id,'candidate.tar.gz');
const tar=spawnSync('tar',['-czf',archive,'-C',stage,'.'],{windowsHide:true,encoding:'utf8'});if(tar.status!==0)throw Error('Candidate archive failed');
const args=connection(process.env.CODELESS_CAPACITY_SSH_CONFIG_FILE), target=args.at(-1), prefix=args.slice(0,-1);
const log=openSync(join(local,id,'transport.log'),'wx',0o600);
function run(cmd,args,input){const r=spawnSync(cmd,args,{input,windowsHide:true,stdio:input===undefined?['ignore',log,log]:['pipe',log,log],timeout:120000});if(r.status!==0)throw Error('SSH candidate staging failed; protected transport log retained');}
try{
  run('ssh',[...args,`umask 077; mkdir -m 700 '${remote}'`]);
  run('scp',[...prefix.map((a,i)=>a==='-p'?'-P':a),archive,target+':'+remote+'/candidate.tar.gz']);
  const setup=`cd '${remote}' && tar -xzf candidate.tar.gz && chmod 700 services/api/mvnw && /opt/codeless/tools/node-v24.22.1-linux-x64/bin/node --check tests/performance/api/run-capacity.mjs`;
  run('ssh',[...args,setup]);
}finally{closeSync(log);}
const state={id,remote,archiveSha256:sha(readFileSync(archive)),manifestSha256:sha(readFileSync(join(stage,'candidate-manifest.json'))),sourceRevision:manifest.sourceRevision};
writeFileSync(join(local,id,'remote-state.json'),JSON.stringify(state,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({staged:true,id,archiveSha256:state.archiveSha256,files:Object.keys(files).length}));
