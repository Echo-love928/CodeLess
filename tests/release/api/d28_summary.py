"""Build a fail-closed summary from the explicitly selected D28 receipts.

Exit 1 for HOLD/BLOCKED even when individual deterministic checks are green.
Never searches for a newer or greener run. No tests or deployment are run here.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'tests/release/api'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    selected = json.loads((BASE / 'd28-candidate.json').read_text(encoding='utf-8'))
    summary = {'task': 'D28-A', 'candidate': selected['sourceCommit'], 'deployedCandidate': selected['deployedSourceCommit'],
               'command': [sys.executable, '-B', 'tests/release/api/d28_summary.py'],
               'recordedAt': datetime.now(timezone.utc).isoformat(), 'status': 'HOLD', 'exitCode': 1,
               'receipts': {}, 'provenanceMismatches': [], 'junitTotals': {}, 'keySuites': [],
               'openBlockers': selected['openBlockers'], 'mergeApproved': False, 'M5': 'NOT_ACCEPTED'}
    values = {}
    for name, relative in selected['receipts'].items():
        path = ROOT / relative
        if not path.exists():
            summary['receipts'][name] = {'path': relative, 'status': 'NOT_RUN', 'exitCode': None}
            continue
        raw = path.read_bytes()
        value = json.loads(raw.decode('utf-8-sig'))
        values[name] = value
        item = {'path': relative, 'sha256': sha(raw), 'status': value.get('status'), 'exitCode': value.get('exitCode')}
        summary['receipts'][name] = item
        if value.get('candidate', selected['sourceCommit']) != selected['sourceCommit']:
            summary['provenanceMismatches'].append(name + ':candidate')
        for child in value.get('commands', []):
            log = ROOT / child['privateLog']
            if not log.exists() or sha(log.read_bytes()) != child['logSha256']:
                summary['provenanceMismatches'].append(name + ':log:' + child['operation'])
        if value.get('logSha256') and (path.parent / 'unit.log').exists():
            if sha((path.parent / 'unit.log').read_bytes()) != value['logSha256']:
                summary['provenanceMismatches'].append(name + ':unit.log')
    gate = values.get('gate', {})
    summary['stages'] = gate.get('stages', [])
    summary['stageCounts'] = {}
    gate_log = next((ROOT / c['privateLog'] for c in gate.get('commands', []) if c['operation'] == 'gate'), None)
    if gate_log and gate_log.exists():
        text = re.sub(r'\x1b\[[0-9;]*m', '', gate_log.read_text(encoding='utf-8', errors='replace'))
        sections = re.split(r'\[ci-gate\] (verify:(?:static|api|runner|e2e))\r?\n', text)
        for index in range(1, len(sections), 2):
            stage, body = sections[index:index + 2]
            counters = [{'name': k, 'value': int(v)} for k, v in re.findall(
                r'(?:#|ℹ)\s+(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)', body)]
            ui = [int(n) for n in re.findall(r'\bTests\s+(\d+) passed', body)]
            playwright = [int(n) for n in re.findall(r'\b(\d+) passed \(', body)]
            full = []
            for line in body.splitlines():
                if not line.startswith('{'):
                    continue
                try:
                    value = json.loads(line)
                    if 'browserExitCode' in value:
                        full.append({k: value.get(k) for k in ('status', 'browserExitCode')})
                except ValueError:
                    pass
            summary['stageCounts'][stage] = {'nodeCounters': counters, 'uiPassed': ui,
                'playwrightPassed': playwright, 'fullProduct': full,
                'nonzeroSkipOrDidNotRun': bool(re.search(r'(?:#|ℹ)\s+skipped\s+[1-9]\d*\b|\b[1-9]\d* (?:skipped|did not run)\b', body))}
    reports = gate.get('junit', [])
    summary['junitTotals'] = {key: sum(int(item[key]) for item in reports) for key in ('tests', 'failures', 'errors', 'skipped')}
    summary['junitTotals']['suites'] = len(reports)
    for item in reports:
        path = ROOT / item['privateReport']
        if not path.exists() or sha(path.read_bytes()) != item['sha256']:
            summary['provenanceMismatches'].append('junit:' + item['name'])
            continue
        if any(word in item['name'] for word in ('.auth.', '.security.', '.recovery.', '.versions.',
                                                  '.tasks.TaskHttpTest', '.tasks.TaskQueueIntegrationTest',
                                                  '.preview.PreviewPlatformIntegrationTest', '.agent.AgentLoopIntegrationTest',
                                                  '.agent.RoundFiveRegressionTest',
                                                  '.agent.RepairLoopIntegrationTest', '.agent.RepairBudgetRegressionTest',
                                                  '.agent.RepairPolicyTest', '.deploy.')):
            document = ET.fromstring(path.read_bytes())
            summary['keySuites'].append({**item, 'cases': [{'name': case.get('name'),
                'status': 'SKIPPED' if case.find('skipped') is not None else 'FAILED'
                if case.find('failure') is not None or case.find('error') is not None else 'PASSED'} for case in document.findall('testcase')]})
    remote = values.get('remoteFinal', {})
    counts = summary['stageCounts']
    counter_sets_ok = all({x['name']: x['value'] for x in counts.get(stage, {}).get('nodeCounters', [])}
                         == {'tests': total, 'pass': total, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
                         for stage, total in (('verify:static', 64), ('verify:runner', 285)))
    count_evidence_ok = (counter_sets_ok and counts.get('verify:static', {}).get('uiPassed') == [212]
                         and 80 in counts.get('verify:e2e', {}).get('playwrightPassed', [])
                         and {'status': 'PASSED', 'browserExitCode': 0} in counts.get('verify:e2e', {}).get('fullProduct', [])
                         and all(not c['nonzeroSkipOrDidNotRun'] for c in counts.values()))
    local_ok = (gate.get('status') == 'PASSED' and gate.get('exitCode') == 0 and count_evidence_ok
                and len(summary['stages']) == 4
                and {s['stage'] for s in summary['stages']} == {'verify:static', 'verify:api', 'verify:runner', 'verify:e2e'}
                and all(s['exitCode'] == 0 and s['signal'] is None and s['launchError'] is None for s in summary['stages'])
                and summary['junitTotals']['tests'] == 428
                and all(summary['junitTotals'][key] == 0 for key in ('failures', 'errors', 'skipped')))
    supplementary_ok = all(values.get(name, {}).get('exitCode') == 0
                           for name in ('build', 'checksumAndImports', 'candidateAttestation', 'live', 'releaseUnit', 'peerUnitOperator', 'harnessControls'))
    all_required = local_ok and supplementary_ok and remote.get('allRequiredSuccess') is True and not summary['provenanceMismatches']
    summary['criteria'] = {
        'D28-A-T1': {'status': 'FAILED' if gate.get('exitCode') not in (None, 0) or summary['junitTotals']['failures'] > 0
                     else 'PASSED_CANDIDATE_ONLY' if all_required else 'BLOCKED',
                     'localOriginalGatePassed': local_ok, 'supplementaryChecksPassed': supplementary_ok,
                     'countEvidenceCompleteWithoutSkip': count_evidence_ok,
                     'remoteExactCandidateSixSuccess': remote.get('allRequiredSuccess'),
                     'finalTaskCommitChecks': 'NOT_RUN_LOCAL_DRAFT'},
        'D28-A-T2': {'status': 'FAILED', 'reason': 'Unresolved serious release/quality blockers are not zero; see openBlockers'},
        'D28-A-T3': {'status': 'BLOCKED', 'reason': 'Source and sealed API verified; current authenticated deployment/worker/image not independently accessed; new candidate not deployed'},
        'D28-A-T4': {'status': 'BLOCKED_FOR_COMPLETE_ACCEPTANCE', 'reason': 'Executed checks have native receipts; D28-B and sealed B archives are missing; two B-declared log digests not reproduced by original GitHub downloads'}
    }
    summary['usage'] = {'developmentInputTokens': None, 'developmentOutputTokens': None, 'developmentTotalTokens': None,
                        'developmentMetering': 'UNKNOWN', 'runtimePaidModelRequests': 0,
                        'runtimeMockCalls': None, 'runtimeMockTokens': None, 'runtimeMetering': 'UNKNOWN',
                        'realModelQualityAccepted': False}
    if summary['provenanceMismatches']:
        summary.update(status='FAILED_EVIDENCE_INTEGRITY', exitCode=2)
    (BASE / 'evidence/d28/summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': summary['status'], 'exitCode': summary['exitCode'],
                      'junitTotals': summary['junitTotals'], 'criteria': summary['criteria'],
                      'provenanceMismatches': summary['provenanceMismatches']}))
    return summary['exitCode']


if __name__ == '__main__':
    sys.exit(main())
