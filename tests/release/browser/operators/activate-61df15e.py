"""D27 reviewed candidate switch. Default is read-only preflight; --activate requires operator authorization."""
import hashlib,json,os,shlex,shutil,subprocess,time,urllib.request,uuid,sys
from pathlib import Path
C='61df15eba456422762a667aaed7734b7d13b48e7';BASE=Path('/srv/codeless');RELEASE=BASE/'releases'/('d27-'+C+'-review');RUNTIME=RELEASE/'runtime/repository';SEALED=RELEASE/'release';TARGET=BASE/'repository';PREPARED=BASE/('repository.d27-'+C+'-prepared');BACKUP=BASE/'deployment-patches'/('d27-'+C+'-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def run(args,**kw):return subprocess.run(args,capture_output=True,check=True,timeout=120,**kw)
def query(sql):return json.loads(run(['docker','exec','-i','codeless-public-postgres-1','psql','-U','codeless','-d','codeless','-At'],input=sql.encode()).stdout)
def snapshot():return query("SELECT json_build_object('activeTasks',(SELECT count(*) FROM generation_tasks WHERE queue_state IN ('QUEUED','RUNNING')),'pendingPublications',(SELECT count(*) FROM publications WHERE status='REQUESTED'),'models',(SELECT count(*) FROM model_calls),'versions',(SELECT count(*) FROM application_versions));")
assert os.getuid()==0 and TARGET.resolve()==TARGET and RUNTIME.is_dir()
assert sha(SEALED/'api/release.json')=='e488c594cd32ac3bcf7b76faffba7810bc400a7f9c8bd8daa19340ae76a7246c'
assert sha(SEALED/'client/manifest.json')=='676635224f6e6dc28e0d8794daf34c87da6e3773b265cc0ee93485e38dee943b'
api=json.loads((SEALED/'api/release.json').read_text());
for item in api['sourceFiles']:
 assert item['path'].startswith('repository/')
 item['path']=item['path'][len('repository/'):]
client=json.loads((SEALED/'client/manifest.json').read_text());assert api['sourceCommit']==client['commit']==C
for row in api['files']:assert sha(SEALED/'api'/row['path'])==row['sha256']
for row in api['sourceFiles']:assert sha(RUNTIME/row['path'])==row['sha256']
for path,row in client['files'].items():assert sha(SEALED/'client'/path)==row['sha256']
assert json.loads((RELEASE/'real-backup-compat.json').read_text())['status']=='PASSED'
assert json.loads((RELEASE/'validation/validation.json').read_text())['status']=='PASSED'
boundary=json.loads((RELEASE/'boundary-test.json').read_text());assert boundary['sourceCommit']==C and boundary['nativeExitCode']==0
boundaryLog=(RELEASE/'boundary-test.log').read_text();assert 'Ran 10 tests' in boundaryLog and 'OK' in boundaryLog and 'skipped' not in boundaryLog
ipc=json.loads((RELEASE/'ipc-composite-worker/report.json').read_text());assert ipc['sourceCommit']==C and ipc['brokerExit']==0 and ipc['resultStatus']=='VERIFIED' and ipc['browserClosed']
assert ipc['workerSha256']==sha(RUNTIME/'infra/public/worker.py')
image=json.loads(run(['docker','image','inspect','codeless-d27-b:'+C]).stdout)[0];assert image['Config']['Labels']['org.opencontainers.image.revision']==C
settings={}
for line in Path('/etc/codeless/api.env').read_text().splitlines():
 key,value=line.split('=',1);settings[key]=shlex.split(value)[0]
assert settings.get('CODELESS_MODEL_PROVIDER','deterministic-mock')=='deterministic-mock'
assert json.loads(settings.get('SPRING_APPLICATION_JSON','{}')).get('codeless',{}).get('model',{}).get('provider','deterministic-mock')=='deterministic-mock'
assert json.loads(settings.get('SPRING_APPLICATION_JSON','{}')).get('codeless.model.provider','deterministic-mock')=='deterministic-mock'
settings.clear()
before=snapshot();assert before['activeTasks']==before['pendingPublications']==0
assert not PREPARED.exists() and not BACKUP.exists()
plan={'sourceCommit':C,'phase':'PREFLIGHT_PASSED','backup':str(BACKUP),'repositoryRoot':str(TARGET),'preparedRuntime':str(RUNTIME),'apiManifestSha256':sha(SEALED/'api/release.json'),'clientManifestSha256':sha(SEALED/'client/manifest.json'),'jarSha256':sha(SEALED/'api/api.jar'),'imageId':image['Id'],'existingState':before,'productionChanged':False,'historicalIncidents':'OPEN; no root-cause closure','activationRequested':'--activate' in sys.argv}
if '--activate' not in sys.argv:print(json.dumps(plan));raise SystemExit(0)
# Separate invocation after explicit approval. No secrets are printed or exported.
BACKUP.mkdir(mode=0o700);os.umask(0o077);state=dict(plan);state['phase']='PREPARING';stopped=False;switched=False;tagged=False
services=['codeless-api','codeless-preview','codeless-worker'];oldImage=run(['docker','image','inspect','codeless-vue-build:d05','--format','{{.Id}}']).stdout.decode().strip()
state['previousPolicyImageId']=oldImage
state['rollbackImageReference']='codeless-d27-rollback:'+C
def save(): (BACKUP/'switch.json').write_text(json.dumps(state,indent=2))
def atomic(path,data,mode=0o644):
 temp=path.with_name(path.name+'.d27-'+uuid.uuid4().hex);temp.write_bytes(data);temp.chmod(mode);os.replace(temp,path)
try:
 assert subprocess.run(['docker','image','inspect',state['rollbackImageReference']],capture_output=True).returncode!=0
 run(['docker','tag',oldImage,state['rollbackImageReference']])
 shutil.copytree(RUNTIME,PREPARED,symlinks=True)
 for row in api['sourceFiles']:assert sha(PREPARED/row['path'])==row['sha256']
 for name,path in [('ops-worker.py',Path('/opt/codeless/ops/worker.py')),('api.jar',BASE/'api.jar'),('api.env',Path('/etc/codeless/api.env')),('deployed-release.json',BASE/'deployed-release.json'),('deployment-source-manifest.json',BASE/'deployment-source-manifest.json')]:
  if path.exists():shutil.copy2(path,BACKUP/name)
 shutil.copytree(BASE/'web',BACKUP/'web',symlinks=True);save()
 run(['systemctl','stop',*services]);stopped=True;assert snapshot()==before
 with (BACKUP/'database.dump').open('xb') as f:subprocess.run(['docker','exec','codeless-public-postgres-1','pg_dump','-Fc','-U','codeless','-d','codeless'],stdout=f,check=True)
 run(['tar','-cf',str(BACKUP/'private-publication.tar'),'-C',str(BASE),'private','publication'])
 state['databaseBackupSha256']=sha(BACKUP/'database.dump');state['privatePublicationBackupSha256']=sha(BACKUP/'private-publication.tar');save()
 os.rename(TARGET,BACKUP/'repository');os.rename(PREPARED,TARGET);switched=True
 atomic(Path('/opt/codeless/ops/worker.py'),(RUNTIME/'infra/public/worker.py').read_bytes(),0o755);atomic(BASE/'api.jar',(SEALED/'api/api.jar').read_bytes());run(['docker','tag',image['Id'],'codeless-vue-build:d05']);tagged=True
 for path in sorted((SEALED/'client/web').rglob('*'),key=lambda p:p.name=='index.html'):
  if path.is_file():dest=BASE/'web'/path.relative_to(SEALED/'client/web');dest.parent.mkdir(parents=True,exist_ok=True);atomic(dest,path.read_bytes())
 # Keep API/worker/export root at their existing fixed path; do not rewrite secrets or SQL.
 source={'commit':C,'files':[{'path':r['path'],'sha256':r['sha256']} for r in api['sourceFiles']]};sourceData=(json.dumps(source,indent=2)+'\n').encode();identityDir=BASE/'releases'/C;identityDir.mkdir();atomic(identityDir/'source-manifest.json',sourceData)
 record={'commit':C,'jarSha256':sha(BASE/'api.jar'),'manifestSha256':hashlib.sha256(sourceData).hexdigest(),'apiManifestSha256':sha(SEALED/'api/release.json'),'clientManifestSha256':sha(SEALED/'client/manifest.json'),'archiveSha256':'f4c9209e778422918b3e7f5094867a50c81a52924f2849f8f18d3321be0024ea','sourceFilesVerified':len(source['files']),'backup':str(BACKUP),'quality':'HOLD','runnerIncident':'OPEN','repositoryRoot':str(TARGET),'workerSha256':sha(Path('/opt/codeless/ops/worker.py'))}
 atomic(BASE/'deployed-release.json',(json.dumps(record,indent=2)+'\n').encode());atomic(BASE/'deployment-source-manifest.json',sourceData)
 run(['systemctl','start','codeless-worker','codeless-preview','codeless-api']);deadline=time.monotonic()+75
 while True:
  try:
   with urllib.request.urlopen('https://app.codeless-platform.top/api/v0/auth/csrf',timeout=8) as r:
    if r.status==200:break
  except Exception:pass
  assert time.monotonic()<deadline,'Public readiness failed';time.sleep(.5)
 for service in services:assert run(['systemctl','is-active',service]).stdout.strip()==b'active'
 for row in api['sourceFiles']:assert sha(TARGET/row['path'])==row['sha256']
 state.update(phase='ACTIVATED_PENDING_BROWSER_ACCEPTANCE',productionChanged=True,record=record);save();print(json.dumps(state))
except Exception as e:
 state.update(phase='FAILED_ROLLBACK',errorType=type(e).__name__);save()
 if stopped:
  subprocess.run(['systemctl','stop',*services],capture_output=True)
  if switched:os.rename(TARGET,BACKUP/'rejected-repository');os.rename(BACKUP/'repository',TARGET)
  for name,path in [('api.jar',BASE/'api.jar'),('api.env',Path('/etc/codeless/api.env')),('deployed-release.json',BASE/'deployed-release.json'),('deployment-source-manifest.json',BASE/'deployment-source-manifest.json')]:
   if (BACKUP/name).exists():atomic(path,(BACKUP/name).read_bytes(),0o600 if name=='api.env' else 0o755 if name=='ops-worker.py' else 0o644)
  for path in (BACKUP/'web').rglob('*'):
   if path.is_file():atomic(BASE/'web'/path.relative_to(BACKUP/'web'),path.read_bytes())
  if tagged:run(['docker','tag',oldImage,'codeless-vue-build:d05'])
  run(['systemctl','start','codeless-worker','codeless-preview','codeless-api'])
 state['automaticDatabaseRestore']=False;save();print(json.dumps({'phase':state['phase'],'errorType':state['errorType']}));raise SystemExit(1)
