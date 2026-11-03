"""Replay PR98's old and fixed offline commands in a real core.autocrlf=true clone.

No original worktree, global Git setting, historical receipt or product is changed.
Raw logs/reports remain in a unique task-private run directory. Exit 0 requires
the old failure, old Git-byte control, fixed pass and tamper rejection together.
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[3]
OLD = '3d15a920e189579d7c48b89961a986035bf81b3e'
SHA = lambda data: hashlib.sha256(data).hexdigest()
private = ROOT / '.local-data/d29-a' / ('crlf-' + uuid.uuid4().hex[:8])
private.mkdir(parents=True)
clone = private / 'checkout'


def git(directory, *args):
    result = subprocess.run(['git', '-c', 'safe.directory=' + directory.as_posix(), '-C', str(directory), *args],
                            capture_output=True)
    if result.returncode:
        (private / 'setup-error.log').write_bytes(result.stdout + result.stderr)
        (private / 'setup-error.json').write_text(json.dumps({'args': args, 'exitCode': result.returncode,
              'logSha256': SHA(result.stdout + result.stderr)}) + '\n', encoding='utf-8')
        result.check_returncode()
    return result.stdout


def run_case(name):
    command = [sys.executable, 'tests/delivery/backend/audit.py', 'offline']
    result = subprocess.run(command, cwd=clone, env=dict(os.environ, PYTHONIOENCODING='utf-8'),
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log = private / (name + '.log')
    log.write_bytes(result.stdout)
    data = (clone / 'tests/delivery/backend/evidence/materials.json').read_bytes()
    receipt = private / (name + '-materials.json')
    receipt.write_bytes(data)
    report = json.loads(data)
    return {'name': name, 'command': command, 'exitCode': result.returncode,
            'receiptExitCode': report['exitCode'], 'errors': report['errors'],
            'privateLog': log.relative_to(ROOT).as_posix(), 'logSha256': SHA(result.stdout),
            'privateReceipt': receipt.relative_to(ROOT).as_posix(), 'receiptSha256': SHA(data),
            'historicalReferences': report.get('historicalReferences')}


git(ROOT, 'clone', '--shared', '--no-checkout', str(ROOT), str(clone))
git(clone, 'config', 'core.autocrlf', 'true')
# Fixture-only setting for existing deep evidence paths; the original repo/global config stays unchanged.
git(clone, 'config', 'core.longpaths', 'true')
git(clone, 'checkout', '--detach', OLD)
summary = json.loads((clone / 'tests/release/api/evidence/d28-final-review/summary.json').read_text(encoding='utf-8'))
sources = summary['verifierSources']
originals = {ref['path']: (clone / ref['path']).read_bytes() for ref in sources}
comparisons = []
for ref in sources:
    blob = git(clone, 'show', OLD + ':' + ref['path'])
    working = originals[ref['path']]
    comparisons.append({'path': ref['path'], 'expectedSha256': ref['sha256'], 'gitBlobSha256': SHA(blob),
                        'worktreeSha256': SHA(working), 'onlyCrlfDifference': working != blob and working == blob.replace(b'\n', b'\r\n')})

rows = [run_case('old-default-crlf')]
try:
    for ref in sources:
        (clone / ref['path']).write_bytes(git(clone, 'show', OLD + ':' + ref['path']))
    rows.append(run_case('old-exact-git-bytes'))
finally:
    for name, data in originals.items():
        (clone / name).write_bytes(data)

fixed = (ROOT / 'tests/delivery/backend/audit.py').read_bytes()
(clone / 'tests/delivery/backend/audit.py').write_bytes(fixed)
rows.append(run_case('fixed-default-crlf'))
name = sources[0]['path']
try:
    (clone / name).write_bytes(originals[name] + b'# deliberate regression fixture tamper\r\n')
    rows.append(run_case('fixed-tampered-source'))
finally:
    (clone / name).write_bytes(originals[name])

regression = subprocess.run([sys.executable, 'tests/delivery/backend/test_audit.py', '-v'], cwd=ROOT,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
(private / 'regression-final.log').write_bytes(regression.stdout)
passed = (all(row['onlyCrlfDifference'] for row in comparisons)
          and [row['exitCode'] for row in rows] == [1, 0, 0, 1]
          and [row['receiptExitCode'] for row in rows] == [1, 0, 0, 1]
          and len(rows[0]['errors']) == 3 and len(rows[3]['errors']) == 1
          and all(row['passed'] for row in rows[2]['historicalReferences'])
          and sum(row['worktreeComparison'] == 'LF_TO_CRLF_ONLY' for row in rows[2]['historicalReferences']) == 3
          and all((clone / name).read_bytes() == data for name, data in originals.items())
          and regression.returncode == 0)
report = {'observedAt': datetime.now(timezone.utc).isoformat(), 'oldCandidate': OLD,
          'fixedAuditSha256': SHA(fixed), 'coreAutocrlf': True, 'comparisons': comparisons, 'cases': rows,
          'regressionCommand': ['python', 'tests/delivery/backend/test_audit.py', '-v'],
          'regressionExitCode': regression.returncode, 'regressionTests': 8,
          'regressionLog': (private / 'regression-final.log').relative_to(ROOT).as_posix(),
          'regressionLogSha256': SHA(regression.stdout),
          'initialRegressionFixture': json.loads((ROOT / '.local-data/d29-a/crlf-fix/regression-initial.json').read_text(encoding='utf-8'))
              if (ROOT / '.local-data/d29-a/crlf-fix/regression-initial.json').exists() else None,
          'exitCode': 0 if passed else 1}
out = ROOT / 'tests/delivery/backend/evidence/crlf-review'
out.mkdir(parents=True, exist_ok=True)
(out / 'replay.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'exitCode': report['exitCode'], 'caseExitCodes': [row['exitCode'] for row in rows],
                  'regressionExitCode': regression.returncode, 'evidence': 'tests/delivery/backend/evidence/crlf-review/replay.json'}))
sys.exit(report['exitCode'])
