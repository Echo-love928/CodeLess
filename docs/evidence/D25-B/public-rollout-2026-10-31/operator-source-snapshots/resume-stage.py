import json,shutil,subprocess
from pathlib import Path
release=Path('/srv/codeless/releases/54f347f7da3c39311003f682022c955a6769b76e-cover-20261031-lf');build=release/'build';driver=release/'build-driver.py'
status=json.loads((build/'stage-status.json').read_text());assert status['state']=='FAILED' and status['stage']==1
for name in ['stage-status.json','stage.log']:shutil.copyfile(build/name,build/(name+'.java-home-failure-preserved'))
shutil.copyfile(driver,release/'build-driver.java-home-failure.py')
code=driver.read_text().replace("'/usr/lib/jvm/java-21-openjdk-amd64'","'/usr/lib/jvm/bellsoft-java21-amd64'")
code=code.replace("records=[]","records="+repr(status['records'][:1]))
code=code.replace("for i,command in enumerate(commands):","for i,command in enumerate(commands):\n  if i<1: continue")
driver.write_text(code)
subprocess.run(['systemd-run','--unit=codeless-cover-stage-54f347f-java-home','--uid=codeless-worker','--gid=codeless-ipc','--property=MemoryMax=1536M','--property=TasksMax=512','--property=KillMode=control-group','/usr/bin/python3',str(driver)],check=True,capture_output=True,text=True)
print(json.dumps({'resumedFromStage':1,'oldFailureRetained':True,'productionChanged':False}))
