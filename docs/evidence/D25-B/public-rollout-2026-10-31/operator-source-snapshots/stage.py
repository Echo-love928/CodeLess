import hashlib,json,os,pwd,shutil,subprocess,tarfile
from pathlib import Path
commit='54f347f7da3c39311003f682022c955a6769b76e'
incoming=Path('/tmp/codeless-cover-54f347f-20261031');release=Path('/srv/codeless/releases')/(commit+'-cover-20261031-lf')
expected={'archiveSha256':'943fb8b02bf7a460d881eeb552e422d98d1254baabc30ede693cbfcefb9fe075','manifestSha256':'3d97d69b5a74a8f911dba71e518f9d27a3756a489b4184a5e540d462888156be'}
for name,key in [('source.tar.gz','archiveSha256'),('source-manifest.json','manifestSha256')]:assert hashlib.sha256((incoming/name).read_bytes()).hexdigest()==expected[key]
assert not release.exists(),'Stage already exists; do not replace historical evidence'
release.mkdir(mode=0o755)
for name in ['source.tar.gz','source-manifest.json','package-result.json']:shutil.copyfile(incoming/name,release/name)
source=release/'source';source.mkdir(mode=0o755)
with tarfile.open(release/'source.tar.gz') as archive:
 for member in archive.getmembers():assert not member.issym() and not member.islnk() and not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
 archive.extractall(source,filter='data')
manifest=json.loads((release/'source-manifest.json').read_text());assert manifest['commit']==commit
for row in manifest['files']:assert hashlib.sha256((source/row['path']).read_bytes()).hexdigest()==row['sha256']
build=release/'build';shutil.copytree(source,build)
worker=pwd.getpwnam('codeless-worker');home=release/'home';home.mkdir(mode=0o700)
for base,dirs,files in os.walk(build):
 os.chown(base,worker.pw_uid,worker.pw_gid)
 for name in dirs+files:os.chown(Path(base)/name,worker.pw_uid,worker.pw_gid,follow_symlinks=False)
os.chown(home,worker.pw_uid,worker.pw_gid);(build/'services/api/mvnw').chmod(0o755)
driver=r'''import hashlib,json,os,subprocess,sys
from pathlib import Path
release=Path(__file__).parent;build=release/'build'
node='/opt/codeless/tools/node-v24.22.1-linux-x64/bin';cache='/srv/codeless/validation/discovery-8078c809ada8429285a7157fba05ad81/maven-cache'
env={'PATH':node+':/usr/lib/jvm/java-21-openjdk-amd64/bin:/usr/bin:/bin','HOME':str(release/'home'),'MAVEN_USER_HOME':cache,
 'MAVEN_OPTS':'-Xmx512m -Dmaven.repo.local='+cache+'/repository','JAVA_HOME':'/usr/lib/jvm/java-21-openjdk-amd64','COREPACK_HOME':str(release/'home/corepack'),
 'PLAYWRIGHT_BROWSERS_PATH':'/opt/codeless/browsers','CI':'true','LANG':'C.UTF-8',
 'VITE_CODELESS_PREVIEW_ORIGIN':'https://preview.codeless-preview.top','VITE_PUBLICATION_ORIGIN':'https://sites.codeless-publish.top'}
commands=[['corepack','pnpm','install','--frozen-lockfile'],
 ['services/api/mvnw','-B','-ntp','-f','services/api/pom.xml','-Dtest=CoverEntryProofTest,CoverStoreTest,NodeCoverGatewayTest','package'],
 ['node','--test','tests/infra/cover-entry.test.mjs','tests/infra/cover-queue-binding.test.mjs','tests/infra/cover-gateway.test.mjs','tests/deploy/contracts.test.mjs'],
 ['corepack','pnpm','--dir','apps/web','exec','vitest','run','src/features/deploy/DeploymentCover.test.ts','src/features/deploy/cover-api.test.ts'],
 ['corepack','pnpm','--filter','@codeless/web','build']]
records=[]
with (build/'stage.log').open('w') as log:
 for i,command in enumerate(commands):
  status={'state':'RUNNING','stage':i,'command':command,'records':records};(build/'stage-status.json').write_text(json.dumps(status))
  result=subprocess.run(command,cwd=build,env=env,stdout=log,stderr=subprocess.STDOUT);log.flush();records.append({'command':command,'exitCode':result.returncode})
  if result.returncode:(build/'stage-status.json').write_text(json.dumps({'state':'FAILED','stage':i,'records':records}));sys.exit(result.returncode)
 manifest=json.loads((release/'source-manifest.json').read_text())
 for row in manifest['files']:assert hashlib.sha256((build/row['path']).read_bytes()).hexdigest()==row['sha256'],row['path']
 jar=build/'services/api/target/codeless-api-0.0.0-SNAPSHOT.jar'
 (build/'stage-status.json').write_text(json.dumps({'state':'PASSED','records':records,'sourceFilesVerified':len(manifest['files']),'jarSha256':hashlib.sha256(jar.read_bytes()).hexdigest(),'productionChanged':False},indent=2))
'''
(release/'build-driver.py').write_text(driver)
subprocess.run(['systemd-run','--unit=codeless-cover-stage-54f347f','--uid=codeless-worker','--gid=codeless-ipc','--property=MemoryMax=1536M','--property=TasksMax=512','--property=KillMode=control-group','/usr/bin/python3',str(release/'build-driver.py')],check=True,capture_output=True,text=True)
print(json.dumps({'stagedCommit':commit,'sourceFilesVerified':len(manifest['files']),'unit':'codeless-cover-stage-54f347f','productionChanged':False}))
