import base64,hashlib,importlib.util,json,os,pathlib,socket,struct,threading,uuid
C='61df15eba456422762a667aaed7734b7d13b48e7';b=pathlib.Path('/srv/codeless/releases/d27-'+C+'-review');repo=b/'runtime/repository';private=b/'ipc-composite-worker';assert os.getuid()!=0 and not list(private.iterdir())
spec=importlib.util.spec_from_file_location('composite',repo/'infra/public/worker.py');w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w);w.REPOSITORY=repo;w.PRIVATE=private;w.enable_subreaper()
source=private/'versions'/str(uuid.uuid4())/'source';(source/'src/pages').mkdir(parents=True);content=b'<template><main><h1>D27 actual IPC</h1></main></template>\n';(source/'src/pages/HomePage.vue').write_bytes(content);(private/'work').mkdir();task=str(uuid.uuid4());digest='sha256:'+hashlib.sha256(json.dumps([{'path':'src/pages/HomePage.vue','bytes':len(content),'digest':'sha256:'+hashlib.sha256(content).hexdigest()}],separators=(',',':')).encode()).hexdigest()
args=[str(repo/'services/api/agent-runner.mjs'),str(private/'work'/task),*[str(private/name) for name in ('artifacts','evidence','receipts')]];job={'sourceDirectory':str(source),'sourceDigest':digest,'actions':[{'type':'expectText','target':{'role':'heading','name':'D27 actual IPC'},'value':'D27 actual IPC'}]};envelope=json.dumps({'argv':args,'input':base64.b64encode(json.dumps(job).encode()).decode()}).encode();left,right=socket.socketpair();errors=[]
def handle():
 try:w.handle(left,{'apiUid':os.getuid(),'CODELESS_PLATFORM_ORIGIN':'https://app.codeless-platform.top','CODELESS_PREVIEW_ORIGIN':'https://preview.codeless-preview.top','CODELESS_PUBLICATION_ORIGIN':'https://sites.codeless-publish.top'})
 except Exception as e:errors.append(type(e).__name__)
 finally:left.close()
t=threading.Thread(target=handle);t.start();right.settimeout(245);right.sendall(struct.pack('!I',len(envelope))+envelope)
def receive(n):
 result=b''
 while len(result)<n:
  data=right.recv(n-len(result));assert data,'early EOF';result+=data
 return result
frame=json.loads(receive(struct.unpack('!I',receive(4))[0]));right.close();t.join(10);assert not t.is_alive() and not errors;result=json.loads(base64.b64decode(frame['output']));report={'sourceCommit':C,'scope':'isolated roots, real non-root worker role, Unix socket peer fixture; not public acceptance','uid':os.getuid(),'taskScopedScratch':args[1],'brokerExit':frame['exit'],'resultStatus':result.get('status'),'resultFailure':result.get('failure'),'buildStatus':(result.get('build') or {}).get('status'),'verificationStatus':(result.get('verification') or {}).get('status'),'browserClosed':(result.get('verification') or {}).get('cleanup',{}).get('browserClosed'),'workerSha256':hashlib.sha256((repo/'infra/public/worker.py').read_bytes()).hexdigest(),'productionChanged':False,'publicAcceptance':False};(private/'report.json').write_text(json.dumps(report,indent=2));assert frame['exit']==0 and result['status']=='VERIFIED' and report['browserClosed'];print(json.dumps(report))
