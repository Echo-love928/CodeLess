"""Export explicit D28 receipts; never choose a newer/greener run or expose auth traces."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'tests/release/browser/evidence/d28'
def sha(data): return hashlib.sha256(data).hexdigest()
def read(path): return json.loads(path.read_bytes())
def receipt(relative):
    folder = (ROOT / relative).resolve()
    assert folder.is_relative_to(ROOT / '.local-data/d28-b/commands')
    raw = (folder / 'run.json').read_bytes()
    value = json.loads(raw)
    assert sha((folder / 'command.log').read_bytes()) == value['logSha256']
    return value, {'path': (folder / 'run.json').relative_to(ROOT).as_posix(), 'sha256': sha(raw),
        'command': value['command'], 'head': value['head'], 'nativeExitCode': value['exitCode'],
        'signal': value['signal'], 'status': value['status'], 'logSha256': value['logSha256'],
        'sourceBytesUnchanged': value['sourceBytesUnchanged'], 'headUnchanged': value['headUnchanged'],
        'sourcesManifestSha256': sha(json.dumps(value['sources'], sort_keys=True, separators=(',', ':')).encode())}
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--flow-command', required=True)
    parser.add_argument('--flow-run', required=True)
    parser.add_argument('--api-command')
    args=parser.parse_args()
    command, meta=receipt(args.flow_command)
    run_dir=(ROOT / args.flow_run).resolve()
    assert run_dir.is_relative_to(ROOT / '.local-data/d28-b/runs')
    run=read(run_dir/'run.json')
    assert command['head']==run['revision']
    ids=read(run_dir/'identities.json')
    artifacts=[]
    for path in sorted(run_dir.rglob('*')):
        if path.suffix in ('.png','.zip'):
            raw=path.read_bytes()
            artifacts.append({'privatePath':path.relative_to(ROOT).as_posix(),'bytes':len(raw),'sha256':sha(raw),
                'authenticatedTrace':path.name=='trace.zip'})
    sql=run.get('sql') or {}
    models=sql.get('models') or []
    report={'task':'D28-B','recordedAt':datetime.now(timezone.utc).isoformat(),'receipt':meta,
        'exporterSha256':sha(Path(__file__).read_bytes()),
        **{key:run.get(key) for key in ('status','revision','canonical','cleanDatabase','browserExitCode','browserSignal',
             'sql','cleanupErrors','databaseRemoved','hostingRemoved','changedSources')},
        'identities':{k:v for k,v in ids.items() if k!='failure'},'artifacts':artifacts,
        'publicAcceptance':False,'normalPublicTls':False,'hostingProbe':'explicit local HTTPS fixture',
        'runtimeUsage':{'provider':'deterministic-mock','paidRequests':0,'mockCalls':len(models),
            'inputTokensSynthetic':sum(m['inputTokens'] for m in models) if models and all(m['inputTokens'] is not None for m in models) else None,
            'outputTokensSynthetic':sum(m['outputTokens'] for m in models) if models and all(m['outputTokens'] is not None for m in models) else None,
            'measurement':'DECLARED_SYNTHETIC_NOT_MEASURED','realModelQualityAccepted':False}}
    (OUT/'flow-final.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if args.api_command:
        api, api_meta=receipt(args.api_command)
        started=datetime.fromisoformat(api['startedAt'].replace('Z','+00:00')).timestamp()
        suites=[]
        for path in sorted((ROOT/'services/api/target/surefire-reports').glob('TEST-*.xml')):
            if path.stat().st_mtime < started: continue
            raw=path.read_bytes(); doc=ET.fromstring(raw)
            suites.append({k:doc.get(k) for k in ('name','tests','failures','errors','skipped')}|
                {'sha256':sha(raw),'cases':[{'name':case.get('name'),'status':'SKIPPED' if case.find('skipped') is not None else
                    'FAILED' if case.find('failure') is not None or case.find('error') is not None else 'PASSED'} for case in doc.findall('testcase')]})
        api_report={'task':'D28-B','receipt':api_meta,'junit':suites,
            'totals':{k:sum(int(s[k]) for s in suites) for k in ('tests','failures','errors','skipped')},
            'modelMeasurement':'original deterministic/loopback provider fixtures; aggregate usage UNKNOWN',
            'doesNotErasePriorFailures':True}
        (OUT/'api-configured.json').write_text(json.dumps(api_report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'flow':report['status'],'nativeExitCode':meta['nativeExitCode'],'artifacts':len(artifacts)}))
if __name__=='__main__': main()
