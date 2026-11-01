import hashlib,http.cookiejar,json,os,pwd,secrets,shlex,shutil,socket,subprocess,time,urllib.request,urllib.error,uuid
from pathlib import Path
C='61df15eba456422762a667aaed7734b7d13b48e7';base=Path('/srv/codeless/releases/d27-'+C+'-review');work=base/'real-backup-compat';work.mkdir(mode=0o700);os.umask(0o077)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();backup=Path('/srv/codeless/deployment-patches/cover-54f347f-20261031/database.dump');assert sha(backup)=='513876749614c85f758fc288434b0a36048fff8e16214bf40b0536a41eeeea5f'
report={'sourceCommit':C,'dataset':'real D25 server rollback backup; NOT the canonical D23 backup','sourceBackupSha256':sha(backup),'publicAcceptance':False,'productionChanged':False,'status':'RUNNING','checks':[],'cleanupErrors':[]};api=None;container=None
liveJar=sha(Path('/srv/codeless/api.jar'));tagBefore=subprocess.check_output(['docker','image','inspect','codeless-vue-build:d05','--format','{{.Id}}']).decode().strip()
def run(args,**kwargs):return subprocess.run(args,capture_output=True,check=True,timeout=45,**kwargs)
def sql(query):return run(['docker','exec','-i',container,'psql','-v','ON_ERROR_STOP=1','-U','codeless','-d','codeless','-At'],input=query.encode()).stdout.decode().strip()
def check(label,value):assert value,label;report['checks'].append(label)
def request(path,method='GET',body=None,token=None,opener=None):
 headers={};data=None
 if body is not None:data=json.dumps(body).encode();headers['Content-Type']='application/json'
 if token:headers['X-CSRF-Token']=token
 req=urllib.request.Request(origin+'/api/v0/'+path,data=data,headers=headers,method=method)
 try:
  with (opener or urllib.request.build_opener()).open(req,timeout=8) as r:return r.status,r.read(),r.headers
 except urllib.error.HTTPError as r:return r.code,r.read(),r.headers
try:
 # Clone only the immutable version material referenced by the real backup.
 agent=work/'agent';agent.mkdir();shutil.copytree('/srv/codeless/private/agent/versions',agent/'versions')
 account=pwd.getpwnam('codeless-api')
 for root,dirs,files in os.walk(work):
  os.chown(root,account.pw_uid,account.pw_gid)
  for name in files:os.chown(Path(root)/name,account.pw_uid,account.pw_gid)
 envfile=work/'pg.env';password=secrets.token_hex(24);envfile.write_text('POSTGRES_USER=codeless\nPOSTGRES_DB=codeless\nPOSTGRES_PASSWORD='+password+'\n');envfile.chmod(0o600)
 container='codeless-d27-compat-'+uuid.uuid4().hex
 pgImage=run(['docker','inspect','codeless-public-postgres-1','--format','{{.Image}}']).stdout.decode().strip()
 run(['docker','run','-d','--name',container,'--label','codeless.d27-compat='+C,'--memory','512m','--cpus','1','--pids-limit','128','--env-file',str(envfile),'-p','127.0.0.1::5432',pgImage])
 deadline=time.monotonic()+60
 while subprocess.run(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','codeless','-d','codeless'],capture_output=True).returncode:
  assert time.monotonic()<deadline;time.sleep(.3)
 run(['docker','exec','-i',container,'pg_restore','--exit-on-error','--no-owner','--no-acl','-U','codeless','-d','codeless'],input=backup.read_bytes());check('REAL_DATABASE_BACKUP_RESTORED_IN_OWNED_CLUSTER',True)
 binding=json.loads(sql("SELECT row_to_json(t) FROM (SELECT a.id AS app,v.id AS version,p.id AS publication,v.source_digest FROM publications p JOIN application_versions v ON v.id=p.version_id JOIN applications a ON a.id=v.application_id JOIN platform_users u ON u.id=a.owner_id WHERE u.email='demo@codeless.local' AND p.status='PUBLISHED' ORDER BY p.id LIMIT 1) t;"));check('REAL_PUBLISHED_VERSION_PRESENT',bool(binding))
 inventory="SELECT md5((SELECT coalesce(json_agg(x ORDER BY id)::text,'[]') FROM application_versions x)|| (SELECT coalesce(json_agg(x ORDER BY id)::text,'[]') FROM publications x)|| (SELECT coalesce(json_agg(x ORDER BY id)::text,'[]') FROM model_calls x));";before=sql(inventory)
 dbPort=json.loads(run(['docker','inspect',container,'--format','{{json .NetworkSettings.Ports}}']).stdout)['5432/tcp'][0]['HostPort'];s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close();origin='http://127.0.0.1:'+str(port)
 java='/usr/lib/jvm/bellsoft-java21-amd64/bin/java';env={'PATH':'/opt/codeless/tools/node-v24.22.1-linux-x64/bin:/usr/bin:/bin','HOME':str(work),'LANG':'C.UTF-8','CODELESS_DATABASE_URL':'jdbc:postgresql://127.0.0.1:'+dbPort+'/codeless','CODELESS_DATABASE_USER':'codeless','CODELESS_DATABASE_PASSWORD':password,'CODELESS_MODEL_PROVIDER':'deterministic-mock','CODELESS_COOKIE_SECURE':'false','CODELESS_MODEL_AUDIT_ROOT':str(work/'models'),'CODELESS_FILE_AUDIT_ROOT':str(work/'audit'),'CODELESS_FILE_WORKSPACE_ROOT':str(work/'workspaces')}
 args=['/usr/sbin/runuser','-u','codeless-api','--',java,'-Xms64m','-Xmx384m','-jar',str(base/'release/api/api.jar'),'--server.address=127.0.0.1','--server.port='+str(port),'--codeless.tasks.enabled=false','--codeless.agent.enabled=false','--codeless.deploy.worker-enabled=false','--codeless.recovery.sweep-enabled=false','--codeless.cover.enabled=false','--codeless.agent.private-root='+str(agent),'--codeless.export.repository-root='+str(base/'runtime/repository')]
 with (work/'api.private.log').open('xb') as log:api=subprocess.Popen(args,cwd=work,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));deadline=time.monotonic()+75
 while True:
  assert api.poll() is None,'CANDIDATE_API_EXITED'
  try:
   code,raw,_=request('auth/csrf',opener=opener)
   if code==200:break
  except (OSError,urllib.error.URLError):pass
  assert time.monotonic()<deadline,'API_STARTUP_TIMEOUT';time.sleep(.3)
 check('SEALED_CANDIDATE_JAR_STARTS_ON_REAL_BACKUP',True);token=json.loads(raw)['token'];credentials={}
 # Credential remains inside this server process, never a command argument, file or report.
 for line in Path('/etc/codeless/api.env').read_text().splitlines():
  key,value=line.split('=',1)
  if key=='CODELESS_DEMO_PASSWORD':credentials[key]=shlex.split(value)[0]
 code,_,_=request('auth/login','POST',{'email':'demo@codeless.local','password':credentials['CODELESS_DEMO_PASSWORD']},token,opener);credentials.clear();check('REAL_OWNER_LOGIN',code==200)
 version=binding['version'];code,raw,_=request('versions/'+version,opener=opener);check('EXISTING_VERIFIED_VERSION_READABLE',code==200 and json.loads(raw)['status']=='VERIFIED')
 code,raw,_=request('versions/'+version+'/files',opener=opener);check('EXISTING_SOURCE_LIST_READABLE',code==200 and len(json.loads(raw)['files'])>0)
 code,raw,headers=request('versions/'+version+'/export',opener=opener);check('REAL_AUTHENTICATED_SOURCE_ZIP',code==200 and raw[:2]==b'PK' and headers.get('Content-Type')=='application/zip');report['exportSha256']=hashlib.sha256(raw).hexdigest()
 check('ANONYMOUS_VERSION_IS_401',request('versions/'+version)[0]==401);check('IMMUTABLE_VERSIONS_PUBLICATIONS_MODEL_LEDGER_UNCHANGED',sql(inventory)==before);check('ORIGINAL_BACKUP_UNCHANGED',sha(backup)==report['sourceBackupSha256']);report['status']='PASSED'
except Exception as e:
 report.update(status='FAILED',errorType=type(e).__name__,errorCode=str(e)[:150] if isinstance(e,AssertionError) else 'PRIVATE_DIAGNOSTIC_REQUIRED')
finally:
 if api is not None:
  try:
   if api.poll() is None:api.terminate()
   api.wait(timeout=25)
  except Exception as e:report['cleanupErrors'].append(type(e).__name__)
 if container is not None:
  try:
   assert run(['docker','inspect',container,'--format','{{index .Config.Labels "codeless.d27-compat"}}']).stdout.decode().strip()==C;run(['docker','rm','-f','-v',container])
  except Exception as e:report['cleanupErrors'].append(type(e).__name__)
 report['liveJarUnchanged']=sha(Path('/srv/codeless/api.jar'))==liveJar;report['productionImageTagUnchanged']=subprocess.check_output(['docker','image','inspect','codeless-vue-build:d05','--format','{{.Id}}']).decode().strip()==tagBefore
 if report['cleanupErrors'] or not report['liveJarUnchanged'] or not report['productionImageTagUnchanged']:report['status']='FAILED'
 (base/'real-backup-compat.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
raise SystemExit(0 if report['status']=='PASSED' else 1)
