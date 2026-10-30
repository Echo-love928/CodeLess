import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{join,resolve,delimiter}from'node:path';import{spawnSync}from'node:child_process';import{randomUUID,createHash}from'node:crypto';import{apiReader}from'../../evals/edit/collect.mjs';
const base=resolve('.local-data/d25-a/six-edits-2026-10-30'),runtime=join(base,'runtime'),pubRoot=join(base,'publication'),read=p=>JSON.parse(readFileSync(p));
const suffix=process.argv[2]??'';assert.ok(suffix===''||suffix==='attempt2');const pub=suffix?join(pubRoot,suffix):pubRoot;if(suffix)mkdirSync(pub);
const state=read(join(runtime,'runtime.json')),session=read(join(runtime,'session.private.json')),cfg=read(join(pubRoot,'transport.private.json'));
assert.equal(state.platformRevision,'fb79c402de6b66bc849e87b6880bf955488f8032');assert.equal(new URL(session.api).hostname,'127.0.0.1');
const get=apiReader(session.api,session.owner.cookie,fetch,session.audit.cookie),owner=await get('auth/me');assert.equal(owner.id,state.ownerId);
const run=(cmd,args,options={})=>{const r=spawnSync(cmd,args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,...options});if(r.status!==0)throw Error('Operator preparation command failed: '+cmd);return r.stdout.trim();};
assert.equal(run('docker',['inspect','--format','{{.Name}}',state.container]),'/'+state.container);
const db=JSON.parse(run('docker',['inspect','--format','{{json .Config.Env}}',state.container]));const dbPassword=db.find(v=>v.startsWith('POSTGRES_PASSWORD=')).slice(18);
const port=run('docker',['port',state.container,'5432/tcp']);assert.match(port,/^127\.0\.0\.1:\d+$/);
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/CODELESS_|API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS/.test(k)));
const java=resolve('.local-data/d07-a/tools/java21/jdk-21.0.12.1+1/bin'),classes=join(pub,'classes');mkdirSync(classes);
const cp=[join(state.platformRoot,'services/api/target/classes'),readFileSync(join(runtime,'classpath.txt'),'utf8').trim()].join(delimiter);
run(join(java,'javac.exe'),['-cp',cp,'-d',classes,join(pubRoot,'D25PublishOnce.java')],{env});
const localHosting=join(pub,'operator-hosting-root');mkdirSync(localHosting);
const operatorEnv={...env,CODELESS_DATABASE_URL:'jdbc:postgresql://'+port+'/codeless_test',CODELESS_DATABASE_USER:'codeless_test',CODELESS_DATABASE_PASSWORD:dbPassword,
 CODELESS_MODEL_PROVIDER:'deterministic-mock',CODELESS_AGENT_PRIVATE_ROOT:join(runtime,'private'),D25_OWNER_ID:owner.id,
 CODELESS_PUBLICATION_ENABLED:'true',CODELESS_NODE_EXECUTABLE:process.execPath,CODELESS_PUBLICATION_GATEWAY_ENTRY:join(pubRoot,'ssh-gateway.private.mjs'),CODELESS_HOSTING_ROOT:localHosting,
 CODELESS_PUBLICATION_ORIGIN:cfg.publicOrigin,CODELESS_PLATFORM_ORIGIN:cfg.platformOrigin,CODELESS_PREVIEW_ORIGIN:cfg.previewOrigin};
const results=[];
for(const id of['EDIT-05','EDIT-04','EDIT-06']){
 const row=read(join(base,'execution/records-6',id+'.json')),version=row.after.version,artifact=row.after.snapshot.validation.artifactDigest;
 assert.equal((await get('applications/'+version.applicationId)).latestReadyVersionId,version.id);
 const request={applicationId:version.applicationId,versionId:version.id,artifactDigest:artifact},key='D25-publication-'+randomUUID();
 writeFileSync(join(pub,id+'-owner-request.json'),JSON.stringify({request,idempotencyKey:key,ownerId:owner.id,at:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
 const response=await fetch(new URL('publications',session.api),{method:'POST',redirect:'error',headers:{Cookie:session.owner.cookie,'X-CSRF-Token':session.owner.csrf,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(request),signal:AbortSignal.timeout(30000)});
 const submitted=await response.json();writeFileSync(join(pub,id+'-submission.json'),JSON.stringify({httpStatus:response.status,body:submitted},null,2)+'\n',{flag:'wx'});assert.equal(response.status,202);assert.equal(submitted.status,'REQUESTED');
 const args=['-cp',[classes,cp].join(delimiter),'D25PublishOnce',submitted.id,'--server.address=127.0.0.1','--server.port=0','--codeless.agent.enabled=true','--codeless.tasks.enabled=false','--codeless.recovery.sweep-enabled=false','--codeless.deploy.worker-enabled=false','--codeless.agent.repository-root='+state.platformRoot,'--codeless.agent.private-root='+join(runtime,'private'),'--codeless.model.audit-root='+join(runtime,'models'),'--CODELESS_FILE_WORKSPACE_ROOT='+join(runtime,'workspaces'),'--CODELESS_FILE_AUDIT_ROOT='+join(runtime,'file-audit')];
 const startedAt=new Date().toISOString(),worked=spawnSync(join(java,'java.exe'),args,{cwd:state.platformRoot,env:operatorEnv,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 const log=Buffer.from((worked.stdout??'')+(worked.stderr??''));writeFileSync(join(pub,id+'-worker.log'),log,{flag:'wx'});
 const publication=await get('publications/'+submitted.id),deployment=await get('publications/'+submitted.id+'/deployment');
 const record={sample:id,ownerId:owner.id,requestStatus:response.status,request,publication,deployment,worker:{startedAt,completedAt:new Date().toISOString(),exitCode:worked.status,signal:worked.signal,error:worked.error?.code??null,logSha256:'sha256:'+createHash('sha256').update(log).digest('hex')},candidate:state.platformRevision,transport:'EXISTING_NATIVE_PAYLOAD_OVER_FIXED_SSH_NO_CONTRACT_CHANGE',additionalModelRequests:0};
 writeFileSync(join(pub,id+'-result.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});results.push(record);
 writeFileSync(join(pub,'index.json'),JSON.stringify({results,modelProviderInPublisher:'UNUSED_DETERMINISTIC_MOCK_NO_MODEL_CALLS',originalEditingProvider:'deepseek/deepseek-flash'},null,2)+'\n');
 console.log(JSON.stringify({sample:id,publicationId:publication.id,status:publication.status,url:publication.url,workerExit:worked.status}));
 assert.equal(worked.status,0);assert.equal(publication.status,'PUBLISHED');assert.equal(deployment.phase,'SUCCEEDED');
}
