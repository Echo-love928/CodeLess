"""D29-A evidence collector. Fixed repository, anonymous GETs, no model requests.

Raw stage logs stay in ignored .local-data/d29-a. Public receipts contain hashes,
native exit codes and public GitHub metadata, never credentials or log contents.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'tests/delivery/backend/evidence'
BASE = 'aefaca193af3019bcadbcf8fdf3f6424baee750c'
REPO = 'https://api.github.com/repos/Echo-love928/CodeLess'
DOCS = ['README.md', 'docs/delivery/backend.md', 'docs/demo/backend-script.md', 'docs/handoffs/D29-A.md']
STAGES = ['static', 'api', 'runner', 'e2e']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    result = subprocess.run(['git', '-c', 'safe.directory=' + ROOT.as_posix(), *args],
                            cwd=ROOT, capture_output=True, check=True)
    return result.stdout.decode('utf-8').strip()


def save(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / (name + '.json')).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def get(path):
    # No cookie jar, credential helper, Authorization or browser session.
    url = REPO + path
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'CodeLess-D29-anonymous-audit'}), timeout=30) as response:
        data = response.read(8 * 1024 * 1024 + 1)
        if len(data) > 8 * 1024 * 1024:
            raise ValueError('Response exceeds bounded read')
        return json.loads(data), {'url': url, 'httpStatus': response.status, 'sha256': sha(data), 'bytes': len(data)}


def online():
    import base64
    repo, rr = get('')
    commit, cr = get('/commits/main')
    readme, mr = get('/contents/README.md?ref=' + commit['sha'])
    content = base64.b64decode(readme['content'])
    public = repo['private'] is False and repo['visibility'] == 'public' and content.startswith(b'# CodeLess')
    save('access', {'observedAt': now(), 'anonymous': True, 'authenticationUsed': False,
                   'repository': {k: repo[k] for k in ['full_name', 'private', 'visibility', 'html_url']},
                   'main': commit['sha'], 'readme': {'sha256': sha(content), 'bytes': len(content), 'gitBlob': readme['sha']},
                   'requests': [rr, cr, mr], 'exitCode': 0 if public else 1})
    prs = []
    # D28 A/B task assignment is established by the PR titles, not invented from Git display names.
    for number in [94, 95]:
        p, receipt = get('/pulls/' + str(number))
        reviews, review_receipt = get('/pulls/' + str(number) + '/reviews?per_page=100')
        if len(reviews) >= 100:
            raise ValueError('Review pagination needs explicit handling')
        prs.append({'number': number, 'url': p['html_url'], 'title': p['title'], 'author': p['user']['login'],
                    'state': p['state'], 'draft': p['draft'], 'head': p['head']['sha'], 'base': p['base']['sha'],
                    'merged': p['merged'], 'mergeCommit': p['merge_commit_sha'], 'mergedAt': p['merged_at'],
                    'headCommit': git('show', '-s', '--format=%H|%an|%s', p['head']['sha']),
                    'reviews': [{'author': r['user']['login'], 'state': r['state'], 'commit': r['commit_id'],
                                 'url': r['html_url']} for r in reviews], 'requests': [receipt, review_receipt]})
    listed, lr = get('/pulls?state=all&sort=updated&direction=desc&per_page=100')
    matches = [p for p in listed if re.search(r'D29[- _]?B|D29.*彩排|完整演示彩排', p['title'], re.I)]
    history = {'observedAt': now(), 'base': BASE, 'head': git('rev-parse', 'HEAD'),
               'firstParent': git('log', '-6', '--first-parent', '--format=%H|%an|%s', BASE).splitlines(),
               'localAuthorCounts': git('shortlog', '-sn', BASE).splitlines(), 'pullRequests': prs,
               'contributionCaveat': 'main uses squashed daily commits; PR head and reviews retain contributor provenance. Git names are self-asserted, not verified legal identities.',
               'D29BSearch': {'request': lr, 'scope': '100 most recently updated PRs; not proof of absence outside this window',
                              'matches': [{'number': p['number'], 'head': p['head']['sha'], 'url': p['html_url'], 'title': p['title']} for p in matches]}}
    history['productDirectoryDiffFromPR95'] = git('diff', '--name-only', prs[1]['head'], BASE, '--',
                                                 'services', 'apps', 'templates', 'prompts', 'contracts', 'infra').splitlines()
    history['traceabilityCriterion'] = 'Both task PRs have identifiable authors and exact real head commits. merged=false remains a separate recorded fact, not a traceability failure.'
    history['initialCollectorFailure'] = 'history-initial.json required merged=true incorrectly; original native exit 1 preserved. This collector does not certify the historical integration process.'
    history['exitCode'] = 0 if all(p['author'] and p['headCommit'].startswith(p['head']) for p in prs) else 1
    save('history', history)
    print(json.dumps({'access': public, 'historyExit': history['exitCode'], 'D29B': history['D29BSearch']['matches']}))
    return max(0 if public else 1, history['exitCode'])


def offline():
    claims = json.loads((ROOT / 'tests/delivery/backend/claims.json').read_text(encoding='utf-8'))
    errors = []
    checked = []
    for claim in claims:
        for ref in claim['references']:
            p = ROOT / ref['path']
            data = p.read_bytes()
            if ref.get('symbol') and ref['symbol'] not in data.decode('utf-8'):
                errors.append(claim['id'] + ': missing symbol ' + ref['symbol'])
            checked.append({'claim': claim['id'], **ref, 'sha256': sha(data)})
    old = json.loads((ROOT / 'tests/release/api/evidence/d28-final-review/summary.json').read_text(encoding='utf-8'))
    for ref in old['receipts'] + old['verifierSources']:
        if sha((ROOT / ref['path']).read_bytes()) != ref['sha256']:
            errors.append('D28 receipt hash mismatch: ' + ref['path'])
    links = []
    for name in DOCS:
        text = (ROOT / name).read_text(encoding='utf-8')
        for target in re.findall(r'\]\(([^)]+)\)', text):
            if target.startswith(('http://', 'https://', '#')):
                continue
            target = target.split('#')[0]
            if not (ROOT / name).parent.joinpath(target).exists():
                errors.append('Broken local link: ' + name + ' -> ' + target)
            links.append({'from': name, 'target': target})
    # High-confidence patterns; no matched values are emitted. Not a full historical secret audit.
    patterns = {'private-key': r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
                'github-token': r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b',
                'provider-key': r'\bsk-[A-Za-z0-9]{24,}\b',
                'aws-key': r'\bAKIA[A-Z0-9]{16}\b',
                'authenticated-url': r'https?://[^\s/:]+:[^\s/@]+@'}
    scan_files = set(DOCS)
    scan_files.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'tests/delivery/backend').rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    findings = []
    for name in sorted(scan_files):
        text = (ROOT / name).read_text(encoding='utf-8')
        for rule, pattern in patterns.items():
            for m in re.finditer(pattern, text):
                findings.append({'path': name, 'line': text.count('\n', 0, m.start()) + 1, 'rule': rule})
    errors.extend('Secret candidate: ' + str(f) for f in findings)
    result = {'observedAt': now(), 'head': git('rev-parse', 'HEAD'), 'errors': errors, 'references': checked,
              'localLinks': links, 'd28HashesChecked': len(old['receipts'] + old['verifierSources']),
              'secretScan': {'paths': sorted(scan_files), 'rules': list(patterns), 'findings': findings,
                             'limitation': 'High-confidence scan of D29 delivery material only; no entropy scan, raw private logs or full historical blob scan.'},
              'scope': 'Evidence/index/link checks, not re-execution of historical tests or proof of model quality.',
              'exitCode': 1 if errors else 0}
    save('materials', result)
    print(json.dumps({'exitCode': result['exitCode'], 'errors': errors, 'references': len(checked), 'links': len(links)}))
    return result['exitCode']


def stage(mode):
    env = os.environ.copy()
    for key in list(env):
        if re.match(r'^(CODELESS_|VITE_|SPRING_|JAVA_TOOL_OPTIONS$|JDK_JAVA_OPTIONS$)', key):
            del env[key]
    # Process-local ownership exception; never change global Git configuration.
    n = int(env.get('GIT_CONFIG_COUNT', '0'))
    env.update({'GIT_CONFIG_COUNT': str(n + 1), f'GIT_CONFIG_KEY_{n}': 'safe.directory', f'GIT_CONFIG_VALUE_{n}': ROOT.as_posix()})
    private = ROOT / '.local-data/d29-a' / (now().replace(':', '-') + '-' + mode)
    private.mkdir(parents=True)
    command = ['node', '--test', 'tests/install/install.test.mjs'] if mode == 'docs' else ['corepack', 'pnpm', 'verify:' + mode]
    actual = [env.get('ComSpec', 'cmd.exe'), '/d', '/c', *command] if os.name == 'nt' and mode != 'docs' else command
    before = git('rev-parse', 'HEAD')
    # Existing tests write tracked historical receipts. Preserve original bytes, archive new observations.
    originals = {p: (ROOT / p).read_bytes() for p in git('ls-files').splitlines() if '/evidence/' in p}
    started = now()
    code = None
    launch_error = None
    with (private / 'command.log').open('wb') as log:
        try:
            code = subprocess.run(actual, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT).returncode
        except OSError as error:
            launch_error = type(error).__name__ + ':' + str(error.errno)
    changed = []
    for p, original in originals.items():
        source = ROOT / p
        if source.exists() and source.read_bytes() == original:
            continue
        target = private / 'historical-outputs' / p
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.exists():
            target.write_bytes(source.read_bytes())
        else:
            target.with_suffix(target.suffix + '.missing').write_text('Test removed this historical output', encoding='utf-8')
        source.write_bytes(original)
        changed.append(p)
    result = {'startedAt': started, 'completedAt': now(), 'command': command, 'actualCommand': actual,
              'revisionRole': 'checkout-reference; see worktree diff, not a claim of a clean final PR checkout',
              'head': before, 'endHead': git('rev-parse', 'HEAD'), 'exitCode': code, 'launchError': launch_error,
              'status': 'PASSED' if code == 0 else 'FAILED', 'modelProvider': 'deterministic-mock/explicit test fixtures; no REAL evaluation requested',
              'privateLog': (private / 'command.log').relative_to(ROOT).as_posix(), 'logSha256': sha((private / 'command.log').read_bytes()),
              'archivedHistoricalOutputs': changed}
    save('stage-' + mode, result)
    print(json.dumps(result))
    return code if code is not None and code >= 0 else 1


def ci(head):
    if not re.fullmatch('[a-f0-9]{40}', head):
        raise ValueError('Exact head SHA required')
    checks, receipt = get('/commits/' + head + '/check-runs?per_page=100')
    required = ['verify:static', 'verify:api', 'verify:runner', 'verify:e2e', 'infra-preflight', 'ci-gate']
    rows = [{k: c[k] for k in ['name', 'head_sha', 'status', 'conclusion', 'html_url']} for c in checks['check_runs']]
    passed = checks['total_count'] <= 100 and all(any(c['name'] == n and c['head_sha'] == head and c['status'] == 'completed' and c['conclusion'] == 'success' for c in rows) for n in required)
    # Duplicate or later non-success check of the same required name cannot be hidden by an older success.
    passed = passed and all(c['status'] == 'completed' and c['conclusion'] == 'success' for c in rows if c['name'] in required)
    result = {'observedAt': now(), 'head': head, 'request': receipt, 'checks': rows, 'required': required,
              'allRequiredSuccess': passed, 'exitCode': 0 if passed else 1}
    private = ROOT / '.local-data/d29-a'
    private.mkdir(parents=True, exist_ok=True)
    (private / ('ci-' + head + '.json')).write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))
    return result['exitCode']


def peer():
    p, receipt = get('/pulls/97')
    files, fr = get('/pulls/97/files?per_page=100')
    if p['changed_files'] > 100:
        raise ValueError('Peer file pagination required')
    head = git('rev-parse', 'origin/pr97-review')
    # Copy exact read-only PR blobs into a task-private fixture root. Never execute B gate recorder.
    paths = [f['filename'] for f in files]
    paths += ['docs/environment.md', 'docs/scope.md', 'docs/architecture.md', 'docs/install.md',
              'docs/troubleshooting.md', 'docs/demo/D25-B.md', 'docs/handoffs/D28-B.md', 'contracts/README.md',
              'tests/release/browser/evidence/d28/release-20261103/status.json']
    paths += ['apps/web/src/features/' + f for f in [
        'apps/AppsPage.vue', 'workbench/WorkbenchPage.vue', 'versions/VersionWorkspace.vue',
        'visual-edit/VisualEditSelector.vue', 'visual-edit/VisualComponentEditor.vue',
        'deploy/DeployPanel.vue', 'deploy/DeploymentCover.vue', 'source/SourceDownload.vue']]
    private = ROOT / '.local-data/d29-a' / ('peer97-' + head)
    private.mkdir(parents=True, exist_ok=True)
    blobs = []
    for name in sorted(set(paths)):
        if '..' in Path(name).parts or Path(name).is_absolute():
            raise ValueError('Unexpected peer path')
        data = subprocess.run(['git', '-c', 'safe.directory=' + ROOT.as_posix(), 'show', head + ':' + name],
                              cwd=ROOT, capture_output=True, check=True).stdout
        target = private / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        blobs.append({'path': name, 'sha256': sha(data)})
    with (private / 'docs-test.log').open('wb') as log:
        tested = subprocess.run(['node', '--test', 'tests/release/d29-docs.test.mjs'], cwd=private, stdout=log, stderr=subprocess.STDOUT)
    status = json.loads((private / 'tests/release/browser/evidence/d28/release-20261103/status.json').read_text(encoding='utf-8'))
    result = {'observedAt': now(), 'pr': 97, 'url': p['html_url'], 'head': head, 'liveHead': p['head']['sha'],
              'base': p['base']['sha'], 'draft': p['draft'], 'requests': [receipt, fr],
              'files': [{'path': f['filename'], 'status': f['status']} for f in files], 'blobs': blobs,
              'command': ['node', '--test', 'tests/release/d29-docs.test.mjs'], 'nativeExitCode': tested.returncode,
              'privateLog': (private / 'docs-test.log').relative_to(ROOT).as_posix(), 'logSha256': sha((private / 'docs-test.log').read_bytes()),
              'linkedHistoricalStatus': status,
              'limits': 'B documentation tests only: no human rehearsal, video playback or browser step validation. No B file changed, no PR approval.',
              'exitCode': 0 if tested.returncode == 0 and head == p['head']['sha'] else 1}
    save('peer97', result)
    print(json.dumps({'head': head, 'liveHead': p['head']['sha'], 'testExit': tested.returncode, 'exitCode': result['exitCode']}))
    return result['exitCode']


def now():
    return datetime.now(timezone.utc).isoformat()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['online', 'offline', 'ci', 'peer', 'docs', *STAGES])
    parser.add_argument('--head')
    args = parser.parse_args()
    try:
        result = online() if args.mode == 'online' else offline() if args.mode == 'offline' else ci(args.head or '') if args.mode == 'ci' else peer() if args.mode == 'peer' else stage(args.mode)
    except Exception as error:
        # Preserve failure without dumping response bodies, environment or credentials.
        save('error-' + args.mode, {'observedAt': now(), 'exceptionType': type(error).__name__, 'exitCode': 1})
        print(type(error).__name__ + ': collection failed; see error receipt', file=sys.stderr)
        result = 1
    sys.exit(result)
