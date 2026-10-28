"""Record native commands privately; publish only safe command metadata + digests."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[2]
mode = sys.argv[1]
commands = {
    'unit': [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests/backup', '-p', 'test_backup.py', '-v'],
    'live': [sys.executable, '-B', 'tests/backup/test_live.py'],
    'application': ['node', 'tests/backup/test_application.mjs'],
    'gate': ['node', 'scripts/ci-gate.mjs'],
}
command = commands[mode]
now = datetime.now(timezone.utc).isoformat().replace(':', '-')
private = root / 'tests/backup/.private/runs' / (now + '-' + mode)
private.mkdir(parents=True)
public = root / 'tests/backup/evidence' / (now + '-' + mode)
public.mkdir(parents=True)
env = dict(os.environ)
env['CODELESS_MODEL_PROVIDER'] = 'deterministic-mock'
env['CODELESS_BACKUP_PYTHON'] = sys.executable
env['NO_PROXY'] = env['no_proxy'] = '127.0.0.1,localhost,::1'
for key in ('CODELESS_MODEL_API_KEY', 'CODELESS_MODEL_NAME', 'CODELESS_PLAYWRIGHT_CHANNEL'):
    env.pop(key, None)
jdk = root / '.local-data/d07-a/tools/java21/jdk-21.0.12.1+1'
if jdk.is_dir():
    env['JAVA_HOME'] = str(jdk)
    env['PATH'] = str(jdk / 'bin') + os.pathsep + env['PATH']
git = ['git', '-c', 'safe.directory=' + root.as_posix()]
head = subprocess.run(git + ['rev-parse', 'HEAD'], capture_output=True, text=True, cwd=root).stdout.strip()
sources = [p for pattern in ('scripts/backup/*.py', 'tests/backup/*.py', 'tests/backup/*.mjs', 'infra/backup/*.json') for p in root.glob(pattern)]
metadata = {'mode': mode, 'command': command, 'head': head, 'startedAt': now,
            'modelProvider': 'deterministic-mock', 'sourceDigests': {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}}
screenshots = {}
if mode == 'gate':
    env['D23_STAGE_EXITS'] = str(private / 'stages.jsonl')
    # Only the ci-gate parent needs observation. Descendants keep real commands.
    command = ['node', '--import', (root / 'tests/backup/gate-observer.mjs').as_uri(), 'scripts/ci-gate.mjs']
    metadata['command'] = command
    tracked = subprocess.run(git + ['ls-files', '*.png'], capture_output=True, text=True, cwd=root, check=True)
    for relative in tracked.stdout.splitlines():
        p = root / relative
        screenshots[relative] = p.read_bytes()
        backup = private / 'screenshots-before' / relative
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_bytes(screenshots[relative])
with (private / 'command.log').open('wb') as log:
    r = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=False)
raw = (private / 'command.log').read_bytes()
metadata.update(exitCode=r.returncode, finishedAt=datetime.now(timezone.utc).isoformat(),
                logSha256=hashlib.sha256(raw).hexdigest())
if mode == 'gate':
    text = raw.decode('utf-8', errors='replace')
    records = [json.loads(line) for line in (private / 'stages.jsonl').read_text(encoding='utf-8').splitlines()]
    metadata['stages'] = {entry['stage']: entry for entry in records}
    changed = []
    for relative, original in screenshots.items():
        p = root / relative
        current = p.read_bytes()
        if current != original:
            after = private / 'screenshots-after' / relative
            after.parent.mkdir(parents=True, exist_ok=True)
            after.write_bytes(current)
            p.write_bytes(original)
            changed.append({'path': relative, 'beforeSha256': hashlib.sha256(original).hexdigest(),
                            'afterSha256': hashlib.sha256(current).hexdigest(), 'restored': p.read_bytes() == original})
    metadata['screenshotsPreserved'] = changed
(public / 'command.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
if mode in ('unit', 'live'):
    (public / 'command.log').write_bytes(raw)
print(json.dumps({'exitCode': r.returncode, 'evidence': str(public)}, ensure_ascii=False))
sys.exit(r.returncode if r.returncode >= 0 else 1)
