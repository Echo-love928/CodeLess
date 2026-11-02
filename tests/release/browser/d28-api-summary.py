"""Combine explicit interrupted/remaining receipts without relabelling a full API gate."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'tests/release/browser/evidence/d28'
sha=lambda data:hashlib.sha256(data).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--remaining-command',required=True)
    args=parser.parse_args()
    original_raw=(BASE/'api-interrupted.json').read_bytes()
    original=json.loads(original_raw)
    assert original['nativeExitCode'] is None and original['totals']['failures']==22
    private=ROOT/original['privateOriginal']
    assert sha((private/'original-run.json').read_bytes())==original['originalReceiptSha256']
    assert sha((private/'command.log').read_bytes())==original['logSha256']
    for row in original['junit']:
        assert sha((ROOT/row['privateReport']).read_bytes())==row['sha256']
    command=(ROOT/args.remaining_command).resolve()
    assert command.is_relative_to(ROOT/'.local-data/d28-b/commands')
    raw=(command/'run.json').read_bytes(); remaining=json.loads(raw)
    assert remaining['exitCode'] is not None and remaining['head']==original['originalHead']
    assert sha((command/'command.log').read_bytes())==remaining['logSha256']
    assert set(remaining['selectedSuites'])==set(original['remainingPlan']['remainingSuites'])
    started=datetime.fromisoformat(remaining['startedAt'].replace('Z','+00:00')).timestamp()
    rows=[]
    for name in remaining['selectedSuites']:
        path=command/'junit'/('TEST-'+name+'.xml')
        source=ROOT/'services/api/target/surefire-reports'/path.name
        assert source.stat().st_mtime>=started, 'Stale JUnit: '+name
        data=path.read_bytes();assert data==source.read_bytes()
        doc=ET.fromstring(data);assert doc.get('name')==name
        rows.append({**{key:doc.get(key) for key in ('name','tests','failures','errors','skipped')},
            'sha256':sha(data),'privateReport':path.relative_to(ROOT).as_posix(),
            'cases':[{'name':case.get('name'),'status':'SKIPPED' if case.find('skipped') is not None else
                'FAILED' if case.find('failure') is not None or case.find('error') is not None else 'PASSED'} for case in doc.findall('testcase')]})
    original_names={row['name'] for row in original['junit']}
    assert original_names.isdisjoint(remaining['selectedSuites'])
    inventory={'.'.join(path.relative_to(ROOT/'services/api/src/test/java').with_suffix('').parts)
        for path in (ROOT/'services/api/src/test/java').rglob('*Test.java')}
    assert original_names|set(remaining['selectedSuites'])==inventory
    report={'task':'D28-B','recordedAt':datetime.now(timezone.utc).isoformat(),'status':'HOLD_FAILED_AND_INCOMPLETE_FULL_GATE',
        'summaryExitCode':1,'fullOriginalNativeExitCode':None,'fullApiGatePassed':False,
        'originalReceipt':{'path':'tests/release/browser/evidence/d28/api-interrupted.json','sha256':sha(original_raw),
            'completedSuites':len(original['junit']),'totals':original['totals']},
        'remainingReceipt':{'privatePath':(command/'run.json').relative_to(ROOT).as_posix(),'sha256':sha(raw),
            'command':remaining['command'],'nativeExitCode':remaining['exitCode'],'signal':remaining['signal'],
            'sourceBytesUnchanged':remaining['sourceBytesUnchanged'],'headUnchanged':remaining['headUnchanged'],
            'logSha256':remaining['logSha256'],'suites':len(rows),'junit':rows,
            'totals':{key:sum(int(row[key]) for row in rows) for key in ('tests','failures','errors','skipped')}},
        'observedCombinedTotals':{key:sum(int(row[key]) for row in [*original['junit'],*rows]) for key in ('tests','failures','errors','skipped')},
        'suiteInventory':{'expected':len(inventory),'completedReports':len(original['junit'])+len(rows),'failedSuitesRetried':False},
        'limitation':'90 suite reports do not mean 428 case bodies passed: prerequisite/BeforeAll failures prevented later case bodies; full original exit remains UNKNOWN.',
        'nativeResultsNotMergedIntoSuccess':True,'verifierSha256':sha(Path(__file__).read_bytes())}
    (BASE/'api-configured.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'status':report['status'],'remainingNativeExit':remaining['exitCode'],
        'remainingTotals':report['remainingReceipt']['totals'],'combined':report['observedCombinedTotals']}))
    return 1
if __name__=='__main__':raise SystemExit(main())
