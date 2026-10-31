import hashlib,http.cookiejar,json,os,pwd,shlex,shutil,subprocess,time,urllib.request,urllib.error
from pathlib import Path
BASE=Path('/srv/codeless');COMMIT='54f347f7da3c39311003f682022c955a6769b76e';release=BASE/'releases'/(COMMIT+'-cover-20261031-lf');build=release/'build'
backup=BASE/'deployment-patches'/'cover-54f347f-20261031';prepared=BASE/'repository.cover-54f347f-prepared'
assert os.getuid()==0 and json.loads((build/'stage-status.json').read_text())['state']=='PASSED'
assert not backup.exists() and not prepared.exists(),'Never overwrite an existing deployment/rollback'
sha=lambda b:hashlib.sha256(b).hexdigest()
def run(args,**kwargs):return subprocess.run(args,check=True,capture_output=True,**kwargs)
def query(sql):return json.loads(run(['docker','exec','-i','codeless-public-postgres-1','sh','-c','exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'],input=sql,text=True).stdout)
def snapshot():
 data=query("""SELECT json_build_object(
 'activeTasks',(SELECT count(*) FROM generation_tasks WHERE queue_state IN ('QUEUED','RUNNING')),
 'pendingPublications',(SELECT count(*) FROM publications WHERE status='REQUESTED'),
 'modelCalls',(SELECT count(*) FROM model_calls),
 'models',(SELECT json_agg(t ORDER BY id) FROM model_calls t),
 'applications',(SELECT json_agg(t ORDER BY id) FROM (SELECT id,latest_ready_version_id FROM applications) t),
 'versions',(SELECT json_agg(t ORDER BY id) FROM application_versions t),
 'publications',(SELECT json_agg(t ORDER BY id) FROM publications t));""")
 return {k:(sha(json.dumps(v,sort_keys=True,separators=(',',':')).encode()) if k in ('models','applications','versions','publications') else v) for k,v in data.items()}
def files(root):
 return {str(p.relative_to(root)):sha(p.read_bytes()) for p in root.rglob('*') if p.is_file() and not p.is_symlink()}
def atomic(path,data,mode=0o644):
 temp=path.with_name(path.name+'.cover-54f347f.tmp');assert not temp.exists();temp.write_bytes(data);temp.chmod(mode);os.replace(temp,path)
def env_read(path):
 result={}
 for line in path.read_text().splitlines():
  if line and not line.startswith('#') and '=' in line:
   k,v=line.split('=',1);parsed=shlex.split(v);assert len(parsed)==1;result[k]=parsed[0]
 return result
def native(method,path,body=None,headers=None,opener=None):
 req=urllib.request.Request('https://app.codeless-platform.top'+path,data=None if body is None else json.dumps(body).encode(),headers=headers or {},method=method)
 try:
  with (opener or urllib.request.build_opener()).open(req,timeout=10) as r:return r.status,dict(r.headers),r.read()
 except urllib.error.HTTPError as e:return e.code,dict(e.headers),e.read()
services=['codeless-api','codeless-preview','codeless-worker'];before=snapshot();assert before['activeTasks']==0 and before['pendingPublications']==0
original_versions=files(BASE/'private/agent/versions');original_public=files(BASE/'publication/sites')
backup.mkdir(mode=0o700);(backup/'preflight.json').write_text(json.dumps({'db':before,'versions':original_versions,'published':original_public},indent=2))
for name,path in [('api.jar',BASE/'api.jar'),('api.env',Path('/etc/codeless/api.env')),('deployed-release.json',BASE/'deployed-release.json'),('deployment-source-manifest.json',BASE/'deployment-source-manifest.json')]:
 if path.exists():shutil.copy2(path,backup/name)
shutil.copytree(BASE/'web',backup/'web',symlinks=True)
shutil.copytree(release/'source',prepared)
for name in ['node_modules','apps/web/node_modules','services/runner/node_modules']:
 if (build/name).is_dir():shutil.copytree(build/name,prepared/name,symlinks=True)
manifest=json.loads((release/'source-manifest.json').read_text())
for row in manifest['files']:assert sha((prepared/row['path']).read_bytes())==row['sha256']
state={'commit':COMMIT,'phase':'PREPARED','backup':str(backup),'modelCallsBefore':before['modelCalls'],'captureWorkerEnabled':False,'coverReadsEnabled':True,'databaseRestorePerformed':False}
def save():atomic(backup/'rollout.json',json.dumps(state,indent=2).encode(),0o600)
save();stopped=False;repository_replaced=False
try:
 run(['systemctl','stop',*services]);stopped=True
 quiescent=snapshot();assert quiescent==before,'Production state changed before switch'
 dump=run(['docker','exec','codeless-public-postgres-1','sh','-c','exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"']).stdout
 (backup/'database.dump').write_bytes(dump);(backup/'database.dump').chmod(0o600);state['databaseBackupSha256']=sha(dump)
 os.rename(BASE/'repository',backup/'repository');os.rename(prepared,BASE/'repository');repository_replaced=True
 atomic(BASE/'api.jar',(build/'services/api/target/codeless-api-0.0.0-SNAPSHOT.jar').read_bytes())
 env=env_read(Path('/etc/codeless/api.env'));config=json.loads(env['SPRING_APPLICATION_JSON']);cover=config.setdefault('codeless',{}).setdefault('cover',{})
 cover_root=BASE/'private/covers/production-54f347f';cover_root.mkdir(parents=True,mode=0o700);api=pwd.getpwnam('codeless-api');os.chown(cover_root,api.pw_uid,api.pw_gid)
 cover.update({'enabled':True,'worker-enabled':False,'root':str(cover_root),'gateway-entry':str(BASE/'repository/services/runner/src/screenshot/gateway.mjs')})
 env.update({'SPRING_APPLICATION_JSON':json.dumps(config,separators=(',',':')),'CODELESS_COVER_ENABLED':'true','CODELESS_COVER_WORKER_ENABLED':'false','CODELESS_COVER_ROOT':str(cover_root),'CODELESS_COVER_GATEWAY_ENTRY':str(BASE/'repository/services/runner/src/screenshot/gateway.mjs')})
 atomic(Path('/etc/codeless/api.env'),''.join(k+'='+shlex.quote(v)+'\n' for k,v in env.items()).encode(),0o600)
 # Retain old hashed assets for already-open clients; index.html is replaced last.
 dist=build/'apps/web/dist';web=BASE/'web'
 for f in sorted(dist.rglob('*'),key=lambda p:p.name=='index.html'):
  if f.is_file():target=web/f.relative_to(dist);target.parent.mkdir(parents=True,exist_ok=True);atomic(target,f.read_bytes())
 state['phase']='STARTING';save();run(['systemctl','start','codeless-worker','codeless-preview','codeless-api'])
 ready=False
 for _ in range(45):
  try:
   status,_,_=native('GET','/api/v0/auth/csrf')
   if status==200:ready=True;break
  except Exception:pass
  time.sleep(1)
 assert ready,'Public HTTPS API readiness failed'
 jar=build/'services/api/target/codeless-api-0.0.0-SNAPSHOT.jar';assert sha((BASE/'api.jar').read_bytes())==sha(jar.read_bytes())
 for row in manifest['files']:assert sha((BASE/'repository'/row['path']).read_bytes())==row['sha256']
 # Use a normal HTTPS login; cookies and password remain only in this server process.
 cookies=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
 status,_,body=native('GET','/api/v0/auth/csrf',opener=opener);assert status==200;token=json.loads(body)['token']
 status,_,body=native('POST','/api/v0/auth/login',{'email':'demo@codeless.local','password':env['CODELESS_DEMO_PASSWORD']},{'Content-Type':'application/json','X-CSRF-Token':token},opener);assert status==200,'Owner login failed'
 pubs=query("SELECT coalesce(json_agg(p.id),'[]'::json) FROM publications p JOIN applications a ON a.id=p.application_id JOIN platform_users u ON u.id=a.owner_id WHERE u.email='demo@codeless.local' AND p.status='PUBLISHED';")
 probes=[]
 for publication in pubs:
  for suffix in ['', '/image?digest=sha256:'+'0'*64]:
   path='/api/v0/publications/'+publication+'/cover'+suffix
   anon,_,_=native('GET',path);assert anon==401
   code,headers,payload=native('GET',path,opener=opener);data=json.loads(payload)
   assert code in (200,404,503) and ('entryPath' in data or data.get('message')=='Cover unavailable'),'Cover controller not reached'
   probes.append({'publicationId':publication,'resource':'image' if suffix else 'metadata','anonymousStatus':anon,'ownerStatus':code,'code':data.get('code'),'cacheControl':headers.get('Cache-Control')})
 after=snapshot();assert after==before,'Ledger, latestReady, immutable version or publication changed'
 assert files(BASE/'private/agent/versions')==original_versions and files(BASE/'publication/sites')==original_public
 assert not list((cover_root/'queue').iterdir()),'GET created queue job'
 for service in services:assert run(['systemctl','is-active',service],text=True).stdout.strip()=='active'
 webfiles=[{'path':str(p.relative_to(dist)),'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size} for p in dist.rglob('*') if p.is_file()]
 record={'commit':COMMIT,'implementation':'45650b16981b04b6d65742befea8793b21f7a229','archiveSha256':json.loads((release/'package-result.json').read_text())['archiveSha256'],'manifestSha256':sha((release/'source-manifest.json').read_bytes()),'jarSha256':sha(jar.read_bytes()),'sourceFilesVerified':len(manifest['files']),'webFiles':webfiles,'cover':{'enabled':True,'workerEnabled':False,'captureExecutor':'NOT_ENABLED_REQUIRES_IPC_ROLE_INTEGRATION','newCaptureAttempts':0},'originalModelCallsBefore':before['modelCalls'],'originalModelCallsAfter':after['modelCalls'],'immutableVersionsAndPublicationsPreserved':True,'backup':str(backup),'quality':'HOLD'}
 atomic(BASE/'deployed-release.json',json.dumps(record,indent=2).encode());atomic(BASE/'deployment-source-manifest.json',(release/'source-manifest.json').read_bytes())
 state.update({'phase':'PASSED','record':record,'coverHttpProbes':probes,'dbBefore':before,'dbAfter':after,'originalVersionsPreserved':True,'originalPublicFilesPreserved':True,'coverQueueJobs':0});save();print(json.dumps(state,indent=2))
except Exception as failure:
 state.update({'phase':'FAILED_ROLLBACK','errorType':type(failure).__name__,'error':str(failure)[:250]});save()
 if stopped:
  subprocess.run(['systemctl','stop',*services],capture_output=True)
  if repository_replaced:
   os.rename(BASE/'repository',backup/'rejected-repository');os.rename(backup/'repository',BASE/'repository')
  for name,path in [('api.jar',BASE/'api.jar'),('api.env',Path('/etc/codeless/api.env')),('deployed-release.json',BASE/'deployed-release.json'),('deployment-source-manifest.json',BASE/'deployment-source-manifest.json')]:
   if (backup/name).exists():atomic(path,(backup/name).read_bytes(),0o600 if name=='api.env' else 0o644)
  for f in (backup/'web').rglob('*'):
   if f.is_file():atomic(BASE/'web'/f.relative_to(backup/'web'),f.read_bytes())
  run(['systemctl','start','codeless-worker','codeless-preview','codeless-api']);state['rollbackServicesStarted']=True;save()
 print(json.dumps(state,indent=2));raise SystemExit(1)
