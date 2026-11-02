"""Read-only current VPS attestation via the user's existing SSH key, strict host checking.

No service restart, generated task, publish, config write, or credential output.
Compares the existing deployed 61 release, never labels a new test commit deployed.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
REV = '61df15eba456422762a667aaed7734b7d13b48e7'
PEER = 'tests/release/browser/evidence/final-61df15e/'


def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: d28_live_identity.py <existing SSH key path> <authorized user@host>')
    key, target = sys.argv[1:]
    if target != 'root@23.136.172.128':
        raise SystemExit('Unexpected authorized deployment')
    def blob(name):
        return subprocess.check_output(['git', '-c', 'safe.directory=' + ROOT.as_posix(), 'show', '2be793dc3318c2308d18a7fd45afb201342206a7:' + PEER + name], cwd=ROOT)
    api, client, selected, status = [json.loads(blob(p)) for p in ('api-manifest.json', 'client-manifest.json', 'selected.json', 'current-status.json')]
    expected = {'commit': REV, 'api': api, 'client': client, 'apiManifestSha256': selected['apiManifestSha256'],
                'clientManifestSha256': selected['clientManifestSha256'], 'workerSha256': status['workerSha256'],
                'imageId': 'sha256:e3d4431bcf42d644b8e89fe703af596c51b848d7c4ea9e68bcc983514cfbb850'}
    remote = '''
import json,os,hashlib,subprocess,time
from pathlib import Path
base=Path('/srv/codeless'); release=base/'releases'/('d27-'+expected['commit']+'-review')/'release'
report={'task':'D28-A-fix','observedAtEpoch':time.time(),'scope':'current existing deployed 61; no deployment or new generation','productionChanged':False,'checks':[],'mismatches':[]}
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def checked(name,ok,**data):
    report['checks'].append({'name':name,'status':'PASSED' if ok else 'FAILED',**data})
    if not ok:report['mismatches'].append(name)
def command(args):
    r=subprocess.run(args,capture_output=True,timeout=30)
    if r.returncode!=0:raise RuntimeError('Read-only command failed: '+args[0])
    return r.stdout
def process(unit):
    pid=int(command(['systemctl','show',unit,'-p','MainPID','--value']).strip())
    if pid<1:raise RuntimeError('No active service PID')
    data=Path('/proc/'+str(pid)+'/stat').read_text().rsplit(')',1)[1].split()
    # /proc/stat btime truncates the boot epoch to whole seconds. Bracket a
    # CLOCK_BOOTTIME sample instead, so a freshly installed pre-start file is
    # not misclassified as modified after start by that lost fractional second.
    before=time.time();boot_clock=time.clock_gettime(time.CLOCK_BOOTTIME);after=time.time()
    started=before-boot_clock+int(data[19])/os.sysconf('SC_CLK_TCK')
    argv=[s.decode() for s in Path('/proc/'+str(pid)+'/cmdline').read_bytes().split(b'\\0') if s]
    return pid,started,argv
try:
    record=json.loads((base/'deployed-release.json').read_text())
    report['deployedCommit']=record['commit']
    checked('DEPLOYED_RECORD_COMMIT',record['commit']==expected['commit'])
    api_sha=sha(release/'api/release.json');client_sha=sha(release/'client/manifest.json')
    checked('SEALED_MANIFESTS',api_sha==expected['apiManifestSha256'] and client_sha==expected['clientManifestSha256'],apiSha256=api_sha,clientSha256=client_sha)
    mismatched=[]
    for item in expected['api']['sourceFiles']:
        path=item['path'].removeprefix('repository/')
        actual=base/'repository'/path
        if not actual.is_file() or sha(actual)!=item['sha256']:mismatched.append(path)
    checked('CURRENT_RUNTIME_SOURCE_BYTES',not mismatched,files=len(expected['api']['sourceFiles']),mismatched=mismatched)
    jar=base/'api.jar';jar_sha=sha(jar)
    expected_jar=next(x['sha256'] for x in expected['api']['files'] if x['path']=='api.jar')
    checked('CURRENT_API_JAR_BYTES',jar_sha==expected_jar,sha256=jar_sha)
    api_pid,api_started,api_args=process('codeless-api')
    selected_jar=api_args[api_args.index('-jar')+1] if '-jar' in api_args else None
    fd_hashes=[]
    for descriptor in Path('/proc/'+str(api_pid)+'/fd').iterdir():
        try:
            if os.readlink(descriptor)==str(jar):fd_hashes.append(sha(descriptor))
        except OSError:pass
    checked('RUNNING_API_BINDS_CURRENT_JAR',selected_jar==str(jar) and fd_hashes and all(x==jar_sha for x in fd_hashes) and jar.stat().st_mtime<=api_started,pid=api_pid,jarPath=selected_jar,openJarSha256=fd_hashes,jarModifiedBeforeProcessStart=jar.stat().st_mtime<=api_started)
    worker=Path('/opt/codeless/ops/worker.py');worker_sha=sha(worker)
    worker_pid,worker_started,worker_args=process('codeless-worker')
    checked('RUNNING_WORKER_BINDS_SOURCE',str(worker) in worker_args and worker_sha==expected['workerSha256'] and worker.stat().st_mtime<=worker_started,pid=worker_pid,sha256=worker_sha,modifiedBeforeProcessStart=worker.stat().st_mtime<=worker_started)
    # Whitelist configuration names in memory; never output other environment entries.
    settings={}
    wanted={'SPRING_APPLICATION_JSON','CODELESS_AGENT_REPOSITORY_ROOT','CODELESS_EXPORT_REPOSITORY_ROOT','CODELESS_MODEL_PROVIDER'}
    for entry in Path('/proc/'+str(api_pid)+'/environ').read_bytes().split(b'\\0'):
        if b'=' not in entry:continue
        name,value=entry.split(b'=',1)
        if name.decode() in wanted:settings[name.decode()]=value.decode()
    props=json.loads(settings.get('SPRING_APPLICATION_JSON','{}'))
    nested=props.get('codeless',{})
    agent=props.get('codeless.agent.repository-root',nested.get('agent',{}).get('repository-root',settings.get('CODELESS_AGENT_REPOSITORY_ROOT')))
    export=props.get('codeless.export.repository-root',nested.get('export',{}).get('repository-root',settings.get('CODELESS_EXPORT_REPOSITORY_ROOT',agent)))
    checked('ACTIVE_AGENT_EXPORT_ROOTS',agent==export==str(base/'repository'),agentRoot=agent,effectiveExportRoot=export)
    settings.clear();props.clear()
    image=json.loads(command(['docker','image','inspect','codeless-vue-build:d05']))[0]
    revision=(image.get('Config',{}).get('Labels') or {}).get('org.opencontainers.image.revision')
    checked('CURRENT_POLICY_IMAGE_ID',image['Id']==expected['imageId'] and revision==expected['commit'],imageId=image['Id'],revision=revision)
    web_bad=[]
    for name,item in expected['client']['files'].items():
        if name.startswith('web/') and sha(base/name)!=item['sha256']:web_bad.append(name)
    checked('CURRENT_WEB_MANIFEST_FILES',not web_bad,files=7,mismatched=web_bad)
    report['status']='PASSED_EXISTING_DEPLOYMENT_ONLY' if not report['mismatches'] else 'FAILED'
except Exception as error:
    report.update(status='BLOCKED',errorType=type(error).__name__)
print(json.dumps(report))
raise SystemExit(0 if report['status']=='PASSED_EXISTING_DEPLOYMENT_ONLY' else 1)
'''
    command = ['ssh', '-i', key, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=12', target, 'python3 -']
    source = 'expected=' + repr(expected) + '\n' + remote
    result = subprocess.run(command, input=source.encode(), capture_output=True, timeout=150)
    stamp = datetime.now(timezone.utc).isoformat().replace(':', '-')
    private = ROOT / 'tests/release/api/.private/d28-fix' / ('live-' + stamp)
    private.mkdir(parents=True)
    (private / 'stdout.json').write_bytes(result.stdout)
    (private / 'stderr.log').write_bytes(result.stderr)
    public = ROOT / 'tests/release/api/evidence/d28-fix'
    try:
        report = json.loads(result.stdout)
    except ValueError:
        report = {'status': 'BLOCKED', 'errorType': 'RemoteResultUnavailable'}
    report.update(command=['ssh', '-i', '<user-provided-key>', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', target, 'python3 -'],
                  nativeExitCode=result.returncode, expectedDeployedCommit=REV,
                  stdoutSha256=hashlib.sha256(result.stdout).hexdigest(), stderrSha256=hashlib.sha256(result.stderr).hexdigest(),
                  newCandidateDeployed=False, credentialsExported=False)
    (public / ('live-identity-' + stamp + '.json')).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))
    return result.returncode


if __name__ == '__main__':
    sys.exit(main())
