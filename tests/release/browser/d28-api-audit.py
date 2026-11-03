"""Preserve a terminated API command without inventing its missing native exit."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
from uuid import uuid4
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[3]
COMMAND=ROOT/'.local-data/d28-b/commands/2026-11-02T01-11-50.989Z-api'
OUT=ROOT/'tests/release/browser/evidence/d28'
sha=lambda data:hashlib.sha256(data).hexdigest()

def main():
    raw=(COMMAND/'run.json').read_bytes()
    receipt=json.loads(raw)
    assert receipt['status']=='RUNNING' and receipt['exitCode'] is None
    started=datetime.fromisoformat(receipt['startedAt'].replace('Z','+00:00')).timestamp()
    private=ROOT/'.local-data/d28-b/interrupted-api'/str(uuid4())
    (private/'junit').mkdir(parents=True)
    shutil.copyfile(COMMAND/'run.json',private/'original-run.json')
    shutil.copyfile(COMMAND/'command.log',private/'command.log')
    rows=[]
    for path in sorted((ROOT/'services/api/target/surefire-reports').glob('TEST-*.xml')):
        if path.stat().st_mtime < started: continue
        data=path.read_bytes();doc=ET.fromstring(data)
        saved=private/'junit'/path.name
        saved.write_bytes(data)
        cases=[]
        for case in doc.findall('testcase'):
            issues=[*case.findall('failure'),*case.findall('error')]
            codes=sorted(set(code for issue in issues for code in re.findall(r'AGENT_[A-Z_]{2,80}',issue.get('message',''))))
            cases.append({'name':case.get('name'),'status':'SKIPPED' if case.find('skipped') is not None else 'FAILED' if issues else 'PASSED',
                'failureTypes':[issue.get('type') for issue in issues],'observedAgentCodes':codes})
        rows.append({**{key:doc.get(key) for key in ('name','tests','failures','errors','skipped')},
            'sha256':sha(data),'privateReport':saved.relative_to(ROOT).as_posix(),'cases':cases})
    changed=[]
    for path,digest in receipt['sources'].items():
        if sha((ROOT/path).read_bytes())!=digest: changed.append(path)
    report={'task':'D28-B','auditedAt':datetime.now(timezone.utc).isoformat(),'status':'INCOMPLETE_NO_FINAL_NATIVE_EXIT',
        'originalHead':receipt['head'],'originalCommand':receipt['command'],'nativeExitCode':None,'signal':None,
        'interruptionCause':'UNKNOWN; execution session no longer exists and original JVM PID285900 is absent',
        'originalReceiptUnmodified':True,'originalReceiptSha256':sha(raw),
        'originalLastLogWriteUtc':datetime.fromtimestamp((COMMAND/'command.log').stat().st_mtime,timezone.utc).isoformat(),
        'privateOriginal':private.relative_to(ROOT).as_posix(),'logSha256':sha((private/'command.log').read_bytes()),
        'changedOriginalSources':changed,'completedSuiteCount':len(rows),'junit':rows,
        'totals':{key:sum(int(row[key]) for row in rows) for key in ('tests','failures','errors','skipped')},
        'remainingPlan':json.loads((ROOT/'.local-data/d28-b/api-remaining-plan.json').read_bytes()),
        'fullApiGatePassed':False,'failuresRetried':False,
        'limitation':'BeforeAll/prerequisite failures prevented later case bodies; suite inventory coverage is not 428 successful cases.'}
    assert len(rows)==73
    (OUT/'api-interrupted.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'status':report['status'],'privateOriginal':report['privateOriginal'],'totals':report['totals'],
        'changedOriginalSources':changed,'remainingSuites':len(report['remainingPlan']['remainingSuites'])}))
if __name__=='__main__': main()
