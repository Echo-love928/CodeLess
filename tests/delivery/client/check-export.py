"""Recheck previously delivered safe ZIP/PNG; no authenticated trace extraction."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
if len(sys.argv) != 3:
    raise SystemExit('Usage: python check-export.py <safe-artifacts-directory> <new-run-id>')
source = Path(sys.argv[1]).resolve()
run_id = sys.argv[2]
if not run_id.replace('-', '').replace('_', '').isalnum():
    raise SystemExit('Invalid run ID')
out = ROOT / 'tests/delivery/client/evidence' / run_id
out.mkdir()  # Preserve previous runs.
raw = ROOT / '.local-data/d30-b' / run_id
raw.mkdir(parents=True)
report = {'observedAt': datetime.now(timezone.utc).isoformat(), 'scope': 'Existing safe local delivery; no new authenticated HTTP', 'files': [], 'commands': []}
expected = {'source-current.zip': 'c4d094306dad2914acd577750df68e2b2050d692fc72335addf7583f077775c9',
            'production-cover.png': '473228039b33e71acdc389e703d0e3456747996361a5cd0ec495bfe2de0a2af6'}
for name, digest in expected.items():
    data = (source / name).read_bytes()
    observed = hashlib.sha256(data).hexdigest()
    if observed != digest:
        raise SystemExit('Wrong original bytes: ' + name)
    shutil.copyfile(source / name, raw / name)
    report['files'].append({'name': name, 'source': str(source / name), 'bytes': len(data), 'sha256': observed})

commands = [
    ['node', 'tests/export/verify-export.mjs', str(raw / 'source-current.zip'), '--version', 'bc53e8eb-08c3-4e1c-b41c-9667b98ac0fe',
     '--source-digest', 'sha256:2239f682cdf36d1fccd9adb61fe0c64736730a0d33191ec3364b09316179b9e9',
     '--artifact-digest', 'sha256:05dc193860ef0024013f76933f991b4603faa12d981d0b935877a9339d004393', '--out', str(out / 'verification.json')],
    ['node', 'tests/export/clean-build.mjs', str(raw / 'source-current.zip'), str(raw / 'clean-build')],
]
for number, command in enumerate(commands):
    log = raw / f'command-{number}.log'
    with log.open('xb') as stream:
        result = subprocess.run(command, cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT)
    data = log.read_bytes()
    report['commands'].append({'command': command, 'nativeExitCode': result.returncode, 'log': str(log), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    (out / 'receipt.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(f'command {number}: exit={result.returncode}', flush=True)
    if number == 1 and (raw / 'clean-build/clean-build.json').is_file():
        shutil.copyfile(raw / 'clean-build/clean-build.json', out / 'clean-build.json')
raise SystemExit(0 if all(c['nativeExitCode'] == 0 for c in report['commands']) else 1)
