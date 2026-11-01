"""Native receipts; raw JVM/session/SQL and screenshots stay in ignored private runs."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
mode = sys.argv[1]
stamp = datetime.now(timezone.utc).isoformat().replace(':', '-') + '-' + mode
private = ROOT / 'tests/release/api/.private/runs' / stamp
public = ROOT / 'tests/release/api/evidence' / stamp
private.mkdir(parents=True); public.mkdir(parents=True)
git = ['git', '-c', 'safe.directory=' + ROOT.as_posix()]
def git_text(*args): return subprocess.check_output([*git, *args], cwd=ROOT).decode().strip()
def sha(data): return hashlib.sha256(data).hexdigest()
sources = git_text('ls-files', '--cached', '--others', '--exclude-standard', '--',
                   'services/api/src/main', 'services/api/pom.xml', 'services/runner/src', 'prompts/runtime', 'templates',
                   'contracts', 'scripts', 'infra', 'package.json', 'pnpm-lock.yaml', 'tests/release/api').splitlines()
sources = [name for name in sources if '/evidence/' not in name and name != 'tests/release/api/candidate.json']
def source_hashes(): return {name: sha((ROOT / name).read_bytes()) for name in sources}
env = {k: v for k, v in os.environ.items() if not k.upper().startswith(('CODELESS_', 'SPRING_', 'NODE_OPTIONS', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS'))}
env['CODELESS_MODEL_PROVIDER'] = 'deterministic-mock'
env['NO_PROXY'] = env['no_proxy'] = '127.0.0.1,localhost,::1'
jdk = ROOT / '.local-data/d07-a/tools/java21/jdk-21.0.12.1+1'
if jdk.exists():
    env['JAVA_HOME'] = str(jdk)
    key = next((k for k in env if k.lower() == 'path'), 'PATH')
    env[key] = str(ROOT / '.local-data/d07-a/bin') + os.pathsep + str(jdk / 'bin') + os.pathsep + env.get(key, '')
candidate = json.loads((ROOT / 'tests/release/api/candidate.json').read_text()) if mode in ('live', 'checksum') else None
if mode == 'unit': command = [sys.executable, '-B', 'tests/release/api/test_release.py']
elif mode == 'build':
    commit = git_text('rev-parse', 'HEAD')
    command = [sys.executable, '-B', 'scripts/release/api_release.py', 'build', '--revision', commit,
               '--output', str(private / 'release/api'), '--log', str(private / 'build.log')]
elif mode == 'live':
    command = [sys.executable, '-B', 'tests/release/api/live.py', '--package', str(ROOT / candidate['package']),
               '--manifest-sha256', candidate['manifestSha256'], '--output', str(private / 'live')]
elif mode == 'checksum':
    command = [sys.executable, '-B', 'scripts/release/api_release.py', 'verify', '--package', str(ROOT / candidate['package']),
               '--manifest-sha256', candidate['manifestSha256']]
elif mode == 'gate':
    # Existing passive D26 parent-only observer returns the original spawnSync result unchanged.
    env['D26_STAGE_EXITS'] = str(private / 'stages.jsonl')
    observer = (ROOT / 'tests/regression/release-api/stage-observer.mjs').as_uri()
    command = ['node', '--import', observer, 'scripts/ci-gate.mjs']
else: raise ValueError('Unregistered mode')
head = git_text('rev-parse', 'HEAD')
before = source_hashes()
receipt = {'task': 'D27-A', 'mode': mode, 'head': head, 'branch': git_text('branch', '--show-current'),
           'command': command, 'startedAt': datetime.now(timezone.utc).isoformat(), 'modelProvider': 'deterministic-mock',
           'paidModelRequests': 0, 'realModelQuality': 'NOT_EVALUATED', 'sourceBefore': before}
(public / 'started.json').write_text(json.dumps(receipt, indent=2) + '\n')
screenshots = {name: (ROOT / name).read_bytes() for name in git_text('ls-files', '*.png').splitlines()} if mode == 'gate' else {}
print(json.dumps({'mode': mode, 'evidence': public.relative_to(ROOT).as_posix()}), flush=True)
with (private / 'command.log').open('xb') as log:
    process = subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
raw = (private / 'command.log').read_bytes()
receipt.update(exitCode=process.returncode, finishedAt=datetime.now(timezone.utc).isoformat(),
               logSha256=sha(raw), logBytes=len(raw), privateLog=(private / 'command.log').relative_to(ROOT).as_posix(),
               sourceBytesUnchanged=source_hashes() == before, headUnchanged=head == git_text('rev-parse', 'HEAD'))
receipt['screenshotsPreserved'] = []
for name, data in screenshots.items():
    current = ROOT / name
    if not current.exists() or current.read_bytes() != data:
        saved = private / 'screenshots-after' / name; saved.parent.mkdir(parents=True, exist_ok=True)
        if current.exists(): saved.write_bytes(current.read_bytes())
        current.write_bytes(data); receipt['screenshotsPreserved'].append(name)
if mode == 'gate':
    receipt['stages'] = [json.loads(line) for line in (private / 'stages.jsonl').read_text().splitlines()] if (private / 'stages.jsonl').exists() else []
    receipt['summaries'] = [line for line in raw.decode(errors='replace').splitlines() if
                            any(word in line for word in ('Tests run:', 'BUILD SUCCESS', 'BUILD FAILURE', '[ci-gate]', ' passed ('))]
    reports = ROOT / 'services/api/target/surefire-reports'
    receipt['junit'] = []
    import xml.etree.ElementTree as ET
    for path in reports.glob('TEST-*.xml'):
        if path.stat().st_mtime < datetime.fromisoformat(receipt['startedAt']).timestamp(): continue
        attrs = ET.fromstring(path.read_bytes()).attrib
        receipt['junit'].append({k: attrs.get(k) for k in ('name', 'tests', 'failures', 'errors', 'skipped')})
if mode in ('unit', 'checksum'): (public / 'command.log').write_bytes(raw)
if mode == 'build' and process.returncode == 0:
    result = json.loads(raw)
    receipt['artifact'] = {**result, 'package': (private / 'release/api').relative_to(ROOT).as_posix()}
    for name in ('release.json', 'SHA256SUMS'): (public / name).write_bytes((private / 'release/api' / name).read_bytes())
if mode == 'live' and (private / 'live/result.json').exists():
    (public / 'result.json').write_bytes((private / 'live/result.json').read_bytes())
receipt['status'] = 'PASSED' if process.returncode == 0 and receipt['sourceBytesUnchanged'] and receipt['headUnchanged'] else 'FAILED'
(public / 'command.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({k: receipt[k] for k in ('mode', 'status', 'exitCode', 'sourceBytesUnchanged', 'headUnchanged')}))
sys.exit(process.returncode if process.returncode else (0 if receipt['status'] == 'PASSED' else 1))
