"""Same original E2E command in a clean, task-owned fixed-commit worktree."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
base = ROOT / 'tests/release/api'
candidate = json.loads((base / 'candidate.json').read_text(encoding='utf-8'))
work = ROOT / '.local-data/d27-a/e2e-1f072dc'
git = ['git', '-c', 'safe.directory=' + work.as_posix()]
head = subprocess.check_output([*git, 'rev-parse', 'HEAD'], cwd=work).decode().strip()
assert head == candidate['sourceCommit']
stamp = datetime.now(timezone.utc).isoformat().replace(':', '-') + '-clean-e2e'
private = base / '.private/runs' / stamp
public = base / 'evidence' / stamp
private.mkdir(parents=True); public.mkdir(parents=True)
env = {k: v for k, v in os.environ.items() if not k.upper().startswith(('CODELESS_', 'SPRING_', 'NODE_OPTIONS', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS'))}
env['JAVA_HOME'] = str(ROOT / '.local-data/d07-a/tools/java21/jdk-21.0.12.1+1')
key = next((k for k in env if k.lower() == 'path'), 'PATH')
env[key] = str(ROOT / '.local-data/d07-a/bin') + os.pathsep + str(Path(env['JAVA_HOME']) / 'bin') + os.pathsep + env.get(key, '')
env.update(CI='true', CODELESS_MODEL_PROVIDER='deterministic-mock', NO_PROXY='127.0.0.1,localhost,::1', no_proxy='127.0.0.1,localhost,::1')
sha = lambda data: hashlib.sha256(data).hexdigest()
paths = subprocess.check_output([*git, 'ls-files'], cwd=work).decode().splitlines()
source = {p: sha((work / p).read_bytes()) for p in paths}
prefix = [os.environ.get('COMSPEC', 'cmd.exe'), '/d', '/c', 'corepack'] if os.name == 'nt' else ['corepack']
report = {'task': 'D27-A', 'sourceCommit': head, 'status': 'RUNNING', 'worktree': work.relative_to(ROOT).as_posix(),
          'sourceBefore': source, 'modelProvider': 'deterministic-mock', 'paidModelRequests': 0,
          'purpose': 'same original E2E command without untracked old peer checkouts; no test/config/timeout modifications',
          'startedAt': datetime.now(timezone.utc).isoformat(), 'commands': []}
(public / 'started.json').write_text(json.dumps(report, indent=2) + '\n')
for name, arguments in [('install', ['pnpm', 'install', '--offline', '--frozen-lockfile']), ('e2e', ['pnpm', 'run', 'verify:e2e'])]:
    command = [*prefix, *arguments]
    with (private / (name + '.log')).open('xb') as log:
        result = subprocess.run(command, env=env, cwd=work, stdout=log, stderr=subprocess.STDOUT)
    raw = (private / (name + '.log')).read_bytes()
    report['commands'].append({'operation': name, 'command': command, 'exitCode': result.returncode,
                               'logSha256': sha(raw), 'logBytes': len(raw), 'privateLog': (private / (name + '.log')).relative_to(ROOT).as_posix()})
    print(json.dumps({'operation': name, 'exitCode': result.returncode, 'evidence': public.relative_to(ROOT).as_posix()}), flush=True)
    if result.returncode != 0: break
# Only this fresh worktree's generated PNG changes are allowed; outer checkout is untouched.
changed = [p for p, digest in source.items() if not (work / p).exists() or sha((work / p).read_bytes()) != digest]
report['changedFiles'] = changed
report['lockBytesUnchanged'] = sha((work / 'pnpm-lock.yaml').read_bytes()) == source['pnpm-lock.yaml']
report['headUnchanged'] = subprocess.check_output([*git, 'rev-parse', 'HEAD'], cwd=work).decode().strip() == head
report['status'] = 'PASSED' if result.returncode == 0 and report['lockBytesUnchanged'] and report['headUnchanged'] and all(p.endswith('.png') for p in changed) else 'FAILED'
report['exitCode'] = result.returncode
report['finishedAt'] = datetime.now(timezone.utc).isoformat()
raw = (private / ('e2e.log' if (private / 'e2e.log').exists() else 'install.log')).read_text(encoding='utf-8', errors='replace')
report['summaries'] = [line for line in raw.splitlines() if ' passed (' in line or line.startswith('Running ') or '[full-product]' in line]
for line in raw.splitlines():
    if line.startswith('{'):
        try: value = json.loads(line)
        except ValueError: continue
        if 'browserExitCode' in value:
            report['fullProduct'] = {k: value.get(k) for k in ('status', 'browserExitCode', 'signal', 'retries', 'publicAcceptance', 'canonical', 'changedSources', 'cleanupErrors')}
(public / 'command.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'status': report['status'], 'exitCode': result.returncode, 'evidence': public.relative_to(ROOT).as_posix()}))
sys.exit(result.returncode if result.returncode else (0 if report['status'] == 'PASSED' else 1))
