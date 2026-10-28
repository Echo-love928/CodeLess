// Model credentials cross SSH stdin only and are never arguments, logs or candidate files.
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {connection} from './remote.mjs';
const mode=process.argv[2], local=resolve(process.env.CODELESS_CAPACITY_LOCAL_PRIVATE??'.local-data/d22-a-real'), state=JSON.parse(readFileSync(process.argv[3],'utf8'));
if(!['REAL','MOCK'].includes(mode)||!/^codeless-d22-a-[a-f0-9-]+$/.test(state.id)||state.remote!=='/var/tmp/'+state.id)throw Error('Invalid isolated candidate');
if(mode==='REAL'&&(process.env.CODELESS_CAPACITY_APPROVAL!=='USER_APPROVED_RMB_2'||!process.env.CODELESS_MODEL_API_KEY||process.env.CODELESS_MODEL_NAME!=='deepseek-flash'))throw Error('Missing REAL authorization');
const runId=mode.toLowerCase()+'-'+randomUUID(), out=join(local,state.id,runId);mkdirSync(out,{recursive:true,mode:0o700});
const env={PATH:'/opt/codeless/tools/node-v24.22.1-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  MAVEN_USER_HOME:'/opt/codeless/maven-cache',MAVEN_OPTS:'-Xmx384m',
  CODELESS_CAPACITY_MAVEN_REPO:'/opt/codeless/maven-cache/repository',CODELESS_CAPACITY_PRECOMPILED:'1',
  CODELESS_CAPACITY_PRIVATE_ROOT:state.remote+'/private/'+runId,CODELESS_CAPACITY_RESOURCE_GROUP:'CPU1_MEMORY1536M'};
if(mode==='REAL')Object.assign(env,{CODELESS_CAPACITY_APPROVAL:'USER_APPROVED_RMB_2',CODELESS_MODEL_API_KEY:process.env.CODELESS_MODEL_API_KEY,CODELESS_MODEL_NAME:'deepseek-flash'});
const payload={root:state.remote,runId,mode,env};
const worker=`import os,json,subprocess,sys,shutil,pathlib\nroot=sys.argv[1]\nc=json.load(open(sys.argv[2]))\nos.environ.update(c['env'])\nos.environ['JAVA_HOME']=os.path.dirname(os.path.dirname(os.path.realpath('/usr/bin/java')))\nos.chdir(root)\nr=subprocess.run(['/opt/codeless/tools/node-v24.22.1-linux-x64/bin/node','tests/performance/api/run-capacity.mjs',c['mode']])\nreports=pathlib.Path('services/api/target/surefire-reports')\nif reports.exists():shutil.copytree(reports,pathlib.Path(c['env']['CODELESS_CAPACITY_PRIVATE_ROOT'])/'junit')\nsys.exit(r.returncode)\n`;
const setup=`import sys,json,os,subprocess,pathlib\nc=json.load(sys.stdin);root=pathlib.Path(c['root']);assert root.name.startswith('codeless-d22-a-') and root.parent==pathlib.Path('/var/tmp')\nprivate=root/'private';private.mkdir(mode=0o700,exist_ok=True)\np=private/(c['runId']+'-env.json');fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)\nwith os.fdopen(fd,'w') as f:json.dump(c,f)\nw=root/'capacity-worker.py';w.write_text(${JSON.stringify(worker)})\nlog=private/(c['runId']+'-unit.log')\ntry:\n with open(log,'x') as f:r=subprocess.run(['systemd-run','--quiet','--wait','--pipe','--collect','--unit',c['runId']+'-d22-a','-p','CPUQuota=100%','-p','MemoryMax=1536M','-p','MemorySwapMax=0','/usr/bin/python3',str(w),str(root),str(p)],stdout=f,stderr=subprocess.STDOUT)\n print(json.dumps(dict(mode=c['mode'],nativeUnitExit=r.returncode,runId=c['runId'])))\n sys.exit(r.returncode)\nfinally:p.unlink()\n`;
// The fixed Python program is encoded, while secrets remain exclusively on stdin.
const script="python3 -c \"import base64;exec(base64.b64decode('"+Buffer.from(setup).toString('base64')+"'))\"";
const fd=openSync(join(out,'transport.log'),'wx',0o600), startedAt=new Date().toISOString();
const result=spawnSync('ssh',[...connection(process.env.CODELESS_CAPACITY_SSH_CONFIG_FILE),script],{input:JSON.stringify(payload),stdio:['pipe',fd,fd],windowsHide:true,timeout:10*60*1000});closeSync(fd);
const meta={mode,runId,startedAt,completedAt:new Date().toISOString(),sshExitCode:result.status,signal:result.signal,errorClass:result.error?.code??null};
writeFileSync(join(out,'transport.json'),JSON.stringify(meta,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(meta));process.exit(result.status===0&&!result.signal?0:1);
