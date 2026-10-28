"""Read-only evidence audit of D23-B 37688c8. Never calls a paid provider."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
REVISION = '37688c82da25d0ec1184108a53fd3cbd719426ac'
PEER = ROOT / 'tests/backup/.private/peer-37688c8'
OUT = ROOT / 'tests/backup/evidence/peer-37688c8'
OUT.mkdir(parents=True, exist_ok=True)
PRIVATE = ROOT / 'tests/backup/.private/peer-review-37688c8'
PRIVATE.mkdir(parents=True, exist_ok=True)
GIT = ['git', '-c', 'safe.directory=' + ROOT.as_posix()]


def sha(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


evidence = PEER / 'tests/install/evidence/2026-10-28'
peer = read(evidence / 'peer-D23-A/result.json')
sources = {}
for name, expected in peer['sources'].items():
    blob = subprocess.run(GIT + ['show', peer['revision'] + ':' + name], capture_output=True, check=True, cwd=ROOT).stdout
    windows = blob.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
    assert expected in (sha(blob), sha(windows)), name
    sources[name] = {'reported': expected, 'gitBlob': sha(blob), 'CRLFCheckout': sha(windows),
                     'match': 'GIT_BLOB' if sha(blob) == expected else 'ONLY_LF_TO_CRLF_CONVERSION'}
for row in peer['commands']:
    original = (evidence / 'peer-D23-A' / (row['mode'] + '.log')).read_bytes()
    assert sha(original) == row['logDigest']
    assert row['exitCode'] == 0 and row['signal'] is None
    (OUT / ('A-' + row['mode'] + '.log')).write_bytes(original)
(OUT / 'B-peer-result.json').write_bytes((evidence / 'peer-D23-A/result.json').read_bytes())

started = datetime.now(timezone.utc).isoformat()
result = subprocess.run(['node', '--test', 'tests/install/install.test.mjs'], cwd=PEER,
                        capture_output=True, check=False)
assert result.returncode == 0, result.stderr.decode(errors='replace')
native_log = result.stdout + result.stderr
(OUT / 'independent-install-tests.log').write_bytes(native_log)
clean = read(ROOT / 'tests/backup/.private/peer-export-build-37688c8/clean-build.json')
assert clean['exitCode'] == 0 and clean['signal'] is None and clean['status'] == 'PASSED'
assert clean['archiveDigest'] == sha((evidence / 'export-sample.zip').read_bytes())
assert clean['hostProjectUnchanged'] is True and clean['hostNodeModulesCreated'] is False
raw_clean_log = (ROOT / 'tests/backup/.private/peer-export-build-37688c8/clean-build.log').read_bytes()
assert clean['logDigest'] == sha(raw_clean_log)
(OUT / 'independent-clean-build.json').write_text(json.dumps(clean, indent=2) + '\n', encoding='utf-8', newline='\n')
(OUT / 'independent-clean-build.log').write_bytes(raw_clean_log)

real = read(evidence / 'real-model.json')
assert real['provider'] == 'deepseek' and real['status'] == 'SUCCEEDED'
assert real['requestId'] and real['responseId'] and real['actualModel']
assert real['usage']['inputTokens'] + real['usage']['outputTokens'] == real['usage']['totalTokens']
commands = read(evidence / 'commands.json')
real_commands = [row for row in commands if row['mode'] == 'real']
assert len(real_commands) == 1 and real_commands[0]['exitCode'] == 0
missing = [row for row in commands if row['mode'] == 'real-missing']
assert len(missing) == 1 and missing[0]['exitCode'] == 2
remote = read(ROOT / 'tests/backup/.private/pr-77-review.json')
assert remote['head'] == REVISION and len(remote['checks']) == 6
assert all(row['status'] == 'completed' and row['conclusion'] == 'success' for row in remote['checks'])

audit = {'task': 'D23-A read-only peer review', 'peerRevision': REVISION, 'startedAt': started,
         'finishedAt': datetime.now(timezone.utc).isoformat(), 'status': 'PASSED',
         'sourceByteAttribution': sources, 'AUnitAndLiveOriginalLogDigestsVerified': True,
         'independentInstallTests': {'command': ['node', '--test', 'tests/install/install.test.mjs'],
                                     'exitCode': result.returncode, 'tests': 5, 'logDigest': sha(native_log)},
         'independentExportBuild': {'exitCode': clean['exitCode'], 'archiveDigest': clean['archiveDigest'],
                                    'logDigest': clean['logDigest'], 'reproduction': clean['reproduction']},
         'reportedRealRequest': {'source': 'B committed provider evidence; not independently re-issued',
                                 'requests': 1, 'actualModel': real['actualModel'], 'usage': real['usage']},
         'newPaidRequestsByA': 0, 'remoteChecks': remote['checks']}
(OUT / 'audit.json').write_text(json.dumps(audit, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'status': audit['status'], 'revision': REVISION, 'installTests': 5,
                  'independentExportExitCode': clean['exitCode'], 'newPaidRequests': 0}))
