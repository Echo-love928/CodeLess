"""D30-A collectors. Public receipts only; raw logs remain in ignored local data.

No model requests, deployment, tag, approval or merge operations.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'tests/delivery/final-backend/evidence'
PRIVATE = ROOT / '.local-data/d30-a'
BASE = '6998a42395004d3e358d1cb127261e815456b05e'
CANDIDATE = '1fe1389dee23efbb1b43c30f3ec1b8f546413087'
API = 'https://api.github.com/repos/Echo-love928/CodeLess'
REQUIRED = ['verify:static', 'verify:api', 'verify:runner', 'verify:e2e', 'infra-preflight', 'ci-gate']
DOCS = ['docs/delivery/final-backend.md', 'docs/release-notes.md', 'docs/handoffs/D30-A.md',
        'tests/delivery/final-backend/PR-DRAFT.md', 'tests/delivery/final-backend/review-D30-B.md']


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / (name + '.json')).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def git(*args):
    return subprocess.check_output(['git', '-c', 'safe.directory=' + ROOT.as_posix(), *args], cwd=ROOT)


def get(path):
    url = API + path
    req = urllib.request.Request(url, headers={'User-Agent': 'CodeLess-D30-anonymous-audit', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read(8 * 1024 * 1024 + 1)
        if len(raw) > 8 * 1024 * 1024:
            raise ValueError('Bounded response exceeded')
        return json.loads(raw), {'url': url, 'httpStatus': response.status, 'sha256': sha(raw), 'bytes': len(raw)}


def permissions():
    # Fixed host, existing Git credential helper, no credential output or persistence.
    env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'}
    credential = subprocess.run(['git', '-c', 'safe.directory=' + ROOT.as_posix(), 'credential', 'fill'],
                                input=b'protocol=https\nhost=github.com\n\n', cwd=ROOT,
                                capture_output=True, env=env)
    if credential.returncode:
        save('permissions', {'observedAt': now(), 'readAccess': 'See remote.json', 'authenticatedPermissions': 'UNKNOWN',
                             'credentialHelperExitCode': credential.returncode, 'exitCode': 1})
        return 1
    fields = dict(line.split('=', 1) for line in credential.stdout.decode().splitlines() if '=' in line)
    token = fields.get('password')
    if not token:
        raise ValueError('No existing Git credential')
    rows = []
    for url in ['https://api.github.com/user', API]:
        req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token,
                                                   'User-Agent': 'CodeLess-D30-permission-audit'})
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read(1024 * 1024)
            data = json.loads(raw)
            rows.append((data, {'url': url, 'httpStatus': response.status, 'sha256': sha(raw)}))
    user, repo = rows[0][0], rows[1][0]
    result = {'observedAt': now(), 'actor': user['login'], 'repository': repo['full_name'],
              'permissions': repo.get('permissions'), 'roleName': repo.get('role_name'),
              'readAccess': 'PASSED', 'requests': [row[1] for row in rows],
              'meaning': 'Authenticated repository role at observation; not independent approval of D30 or tag eligibility.',
              'exitCode': 0 if repo.get('permissions', {}).get('pull') else 1}
    save('permissions', result)
    print(json.dumps(result))
    return result['exitCode']


def check_ci(head, checks, total):
    """Fail closed on missing, stale, duplicate non-success, skipped or paginated checks."""
    return total == len(checks) and total <= 100 and all(any(c['name'] == name and c['head_sha'] == head for c in checks) for name in REQUIRED) and all(
        c['head_sha'] == head and c['status'] == 'completed' and c['conclusion'] == 'success'
        for c in checks if c['name'] in REQUIRED)


def ci(head):
    if not re.fullmatch('[a-f0-9]{40}', head):
        raise ValueError('Exact SHA required')
    data, request = get('/commits/' + head + '/check-runs?per_page=100')
    rows = [{k: c[k] for k in ['name', 'head_sha', 'status', 'conclusion', 'html_url']} for c in data['check_runs']]
    passed = check_ci(head, rows, data['total_count'])
    result = {'observedAt': now(), 'head': head, 'request': request, 'checks': rows,
              'required': REQUIRED, 'allRequiredSuccess': passed, 'collectorExitCode': 0 if passed else 1,
              'nativeStageExitCodes': None, 'meaning': 'GitHub check conclusions; not local process exits.'}
    save('ci-' + head[:7], result)
    print(json.dumps({'head': head, 'allRequiredSuccess': passed, 'checks': rows}))
    return result['collectorExitCode']


def online():
    repo, rr = get('')
    ref, mr = get('/git/ref/heads/main')
    main = ref['object']['sha']
    readme, ar = get('/contents/README.md?ref=' + main)
    readme_bytes = base64.b64decode(readme['content'])
    prs, prr = get('/pulls?state=all&sort=updated&direction=desc&per_page=100')
    matches = [p for p in prs if re.search(r'D30[- _｜|]*B|D30.*最终用户|最终用户流程交接', p['title'], re.I)]
    rows = []
    for number in sorted({95, 98, *(p['number'] for p in matches)}):
        p, request = get('/pulls/' + str(number))
        reviews, review_request = get('/pulls/' + str(number) + '/reviews?per_page=100')
        if len(reviews) >= 100:
            raise ValueError('Explicit review pagination required')
        rows.append({'number': number, 'url': p['html_url'], 'title': p['title'], 'head': p['head']['sha'],
                     'base': p['base']['sha'], 'author': p['user']['login'], 'state': p['state'],
                     'draft': p['draft'], 'merged': p['merged'], 'mergedAt': p['merged_at'],
                     'reviews': [{'author': r['user']['login'], 'state': r['state'], 'commit': r['commit_id'],
                                  'url': r['html_url']} for r in reviews], 'requests': [request, review_request]})
    tags, tr = get('/tags?per_page=100')
    result = {'observedAt': now(), 'anonymous': True, 'authenticationUsed': False,
              'repository': {k: repo[k] for k in ['full_name', 'private', 'visibility', 'html_url']},
              'main': main, 'localBase': BASE, 'readme': {'bytes': len(readme_bytes), 'sha256': sha(readme_bytes)},
              'pullRequests': rows, 'D30BSearch': {'scope': '100 most recently updated PRs only',
                  'matches': [{'number': p['number'], 'head': p['head']['sha'], 'url': p['html_url']} for p in matches]},
              'tags': [{'name': t['name'], 'commit': t['commit']['sha']} for t in tags],
              'tagPaginationComplete': len(tags) < 100,
              'requests': [rr, mr, ar, prr, tr], 'readAccess': 'PASSED' if repo['private'] is False and readme_bytes else 'FAILED',
              'reviewerWriteOrApprovePermission': 'UNKNOWN; anonymous read does not certify write or approve permission',
              'exitCode': 0 if repo['private'] is False and readme_bytes else 1}
    save('remote', result)
    print(json.dumps(result, ensure_ascii=True))
    return result['exitCode']


def identity():
    # All tracked non-documentation/non-test paths, including CI, locks and root configuration.
    paths = git('ls-tree', '-r', '--name-only', 'HEAD').decode().splitlines()
    runtime = [p for p in paths if not p.startswith(('docs/', 'tests/')) and p != 'README.md']
    diffs = git('diff', '--name-status', CANDIDATE, 'HEAD', '--', '.',
                ':(exclude)docs', ':(exclude)tests', ':(exclude)README.md').decode().splitlines()
    # Include additions/removals from the original candidate as well.
    all_diff = git('diff', '--name-only', CANDIDATE, 'HEAD').decode().splitlines()
    outside = [p for p in all_diff if not p.startswith(('docs/', 'tests/')) and p != 'README.md']
    dirty = git('diff', 'HEAD', '--name-only').decode().splitlines()
    dirty_runtime = [p for p in dirty if not p.startswith(('docs/', 'tests/')) and p != 'README.md']
    result = {'observedAt': now(), 'acceptedCandidate': CANDIDATE, 'checkoutHead': git('rev-parse', 'HEAD').decode().strip(),
              'base': BASE, 'branch': git('branch', '--show-current').decode().strip(),
              'trackedRuntimeFilesCompared': len(runtime), 'runtimeDiff': diffs, 'allNonMaterialChanges': outside,
              'dirtyRuntimePaths': dirty_runtime, 'allCandidateToHeadChanges': all_diff,
              'candidateAndCheckoutRuntimeIdentical': not (diffs or outside or dirty_runtime),
              'exitCode': 1 if diffs or outside or dirty_runtime else 0}
    save('identity', result)
    print(json.dumps({'runtimeFiles': len(runtime), 'changes': outside, 'dirty': dirty_runtime, 'exitCode': result['exitCode']}))
    return result['exitCode']


def legacy():
    spec = importlib.util.spec_from_file_location('d29', ROOT / 'tests/delivery/backend/audit.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.OUT = OUT
    return module


def materials():
    module = legacy()
    module.DOCS = DOCS
    if not (OUT / 'materials.json').exists():
        save('materials', {'status': 'RUNNING', 'exitCode': None})
    code = module.offline()
    receipt = json.loads((OUT / 'materials.json').read_bytes())
    findings = []
    files = [p for p in (ROOT / 'tests/delivery/final-backend').rglob('*')
             if p.is_file() and '__pycache__' not in p.parts]
    for path in files:
        raw = path.read_bytes()
        text = raw.decode('utf-8')
        rules = {'private-key': r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
                 'github-token': r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b',
                 'provider-key': r'\bsk-[A-Za-z0-9]{24,}\b',
                 'aws-key': r'\bAKIA[A-Z0-9]{16}\b',
                 'authenticated-url': r'https?://[^\s/:]+:[^\s/@]+@'}
        for rule, pattern in rules.items():
            findings += [{'path': path.relative_to(ROOT).as_posix(), 'rule': rule,
                          'line': text.count('\n', 0, m.start()) + 1} for m in re.finditer(pattern, text)]
    receipt['d30Scan'] = {'paths': [p.relative_to(ROOT).as_posix() for p in files], 'findings': findings,
                          'sourceHashes': {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in files
                                           if p != OUT / 'materials.json'},
                          'limitation': 'High-confidence format scan of indexed public delivery material, not whole-history or confidential-backup scan.'}
    receipt['exitCode'] = 1 if code or findings else 0
    save('materials', receipt)
    return receipt['exitCode']


def stage(mode):
    env = os.environ.copy()
    for key in list(env):
        if re.match(r'^(CODELESS_|VITE_|SPRING_|JAVA_TOOL_OPTIONS$|JDK_JAVA_OPTIONS$)', key):
            del env[key]
    n = int(env.get('GIT_CONFIG_COUNT', '0'))
    env.update({'GIT_CONFIG_COUNT': str(n + 1), f'GIT_CONFIG_KEY_{n}': 'safe.directory',
                f'GIT_CONFIG_VALUE_{n}': ROOT.as_posix()})
    folder = PRIVATE / (now().replace(':', '-') + '-' + mode)
    folder.mkdir(parents=True)
    command = ['corepack', 'pnpm', 'verify:' + mode]
    actual = [env.get('ComSpec', 'cmd.exe'), '/d', '/c', *command] if os.name == 'nt' else command
    originals = {p: (ROOT / p).read_bytes() for p in git('ls-files').decode().splitlines() if '/evidence/' in p}
    started = now()
    before = git('rev-parse', 'HEAD').decode().strip()
    with (folder / 'command.log').open('wb') as log:
        code = subprocess.run(actual, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT).returncode
    changed = []
    for path, original in originals.items():
        source = ROOT / path
        if source.exists() and source.read_bytes() == original:
            continue
        target = folder / 'historical-outputs' / path
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.exists():
            target.write_bytes(source.read_bytes())
        else:
            target.with_suffix(target.suffix + '.missing').write_text('Removed by stage', encoding='utf-8')
        source.write_bytes(original)
        changed.append(path)
    receipt = {'task': 'D30-A', 'startedAt': started, 'completedAt': now(), 'command': command,
               'actualCommand': actual, 'head': before, 'endHead': git('rev-parse', 'HEAD').decode().strip(),
               'revisionRole': 'Checkout plus current D30 material diff; not clean final PR proof',
               'exitCode': code, 'status': 'PASSED' if code == 0 else 'FAILED',
               'modelProvider': 'deterministic-mock/explicit fixtures; not REAL evaluation',
               'privateLog': (folder / 'command.log').relative_to(ROOT).as_posix(),
               'logSha256': sha((folder / 'command.log').read_bytes()), 'archivedHistoricalOutputs': changed}
    save('stage-' + mode, receipt)
    print(json.dumps(receipt))
    return code


def record(command, name, *, cwd=ROOT):
    PRIVATE.mkdir(parents=True, exist_ok=True)
    logfile = PRIVATE / (now().replace(':', '-') + '-' + name + '.log')
    with logfile.open('wb') as log:
        code = subprocess.run(command, cwd=cwd, stdout=log, stderr=subprocess.STDOUT).returncode
    result = {'observedAt': now(), 'command': command, 'exitCode': code,
              'privateLog': logfile.relative_to(ROOT).as_posix(), 'logSha256': sha(logfile.read_bytes())}
    save(name, result)
    print(json.dumps(result))
    return code


def originals():
    intake = ROOT / 'tests/release/api/.private/d28-final-review'
    prior = ROOT / 'tests/release/api/.private/d28-model-followup/original-batch'
    index = json.loads((intake / 'index.json').read_bytes())
    verified = 0
    for row in index.values():
        data = Path(row['local']).read_bytes()
        if len(data) != row['bytes'] or sha(data) != row['sha256']:
            raise ValueError('Original intake mismatch')
        verified += 1
    commands = [
        (['node', 'scripts/eval/report.mjs', str(prior), '--check'], 'eval-prior-report'),
        (['node', 'scripts/eval/report.mjs', str(intake / 'delta-batch'), '--check'], 'eval-delta-report'),
        ([sys.executable, '-B', 'tests/release/api/d28_final_quality_audit.py', '--root', str(intake),
          '--prior-batch', str(prior)], 'eval-quality'),
        ([sys.executable, '-B', 'tests/release/api/d28_final_source_budget_audit.py', '--root', str(intake),
          '--anchor', 'tests/release/api/evidence/d28-final-review/prior-budget-anchor.json'], 'eval-budget')]
    # Existing tools emit derived outputs; preserve pre-existing derivations as well as all raw originals.
    derived = [intake / 'quality-audit.json', intake / 'source-and-budget-audit.json']
    before = {p: p.read_bytes() if p.exists() else None for p in derived}
    codes = []
    quality = None
    try:
        for command, name in commands:
            codes.append(record(command, name))
        if codes[2] == 0:
            quality = json.loads(derived[0].read_bytes())
    finally:
        for path, data in before.items():
            if data is not None:
                path.write_bytes(data)
            elif path.exists():
                path.unlink()
    for row in index.values():
        data = Path(row['local']).read_bytes()
        if len(data) != row['bytes'] or sha(data) != row['sha256']:
            raise ValueError('Original changed during audit')
    result = {'observedAt': now(), 'originalFilesVerified': verified, 'indexSha256': sha((intake / 'index.json').read_bytes()),
              'originalsModified': False, 'commands': [name for _, name in commands], 'nativeExitCodes': codes,
              'quality': quality, 'newPaidModelRequests': 0, 'actualBill': None,
              'scope': 'Recompute retained REAL original reports and incremental composite; no new model or browser execution.',
              'exitCode': 0 if all(c == 0 for c in codes) else 1}
    save('originals', result)
    return result['exitCode']


def backup():
    path = ROOT / 'tests/backup/.private/application/2026-10-28T15-24-06.249Z-41390e6a-dccb-4f7c-9d72-a9752628549a/backup'
    code = record([sys.executable, '-B', 'scripts/backup/backup.py', 'verify', '--backup', str(path)], 'backup-verify')
    result = json.loads((OUT / 'backup-verify.json').read_bytes())
    result.update({'backupRole': 'Retained D23 genuine demo backup; not a newly created final-production backup',
                   'readableAndIntegrityVerified': code == 0, 'freshRestoreExecuted': False,
                   'confidentialDataPublished': False, 'secretScope': 'Backup verifier rejects forbidden secret filenames; public-material format scan is separate. Database and user data remain confidential.'})
    save('backup-verify', result)
    return code


def controls():
    return record([sys.executable, '-B', 'tests/delivery/final-backend/test_audit.py'], 'controls')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['online', 'permissions', 'identity', 'materials', 'originals', 'backup', 'controls', 'ci', 'static', 'api', 'runner', 'e2e'])
    parser.add_argument('--head')
    args = parser.parse_args()
    try:
        code = ci(args.head or '') if args.mode == 'ci' else stage(args.mode) if args.mode in ['static', 'api', 'runner', 'e2e'] else globals()[args.mode]()
    except Exception as error:
        save('error-' + args.mode, {'observedAt': now(), 'exceptionType': type(error).__name__, 'exitCode': 1})
        print(type(error).__name__ + ': see error receipt; no response bodies or credentials emitted', file=sys.stderr)
        code = 1
    sys.exit(code)
