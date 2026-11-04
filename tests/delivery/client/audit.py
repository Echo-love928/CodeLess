"""Read-only D30-B material audit; no credentials, deployment or model calls."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[3]
BASE = '6998a42395004d3e358d1cb127261e815456b05e'
FINAL = 'tests/release/api/evidence/d28-final-review/'
DOCS = ['docs/delivery/index.md', 'docs/delivery/final-client.md', 'docs/handoffs/D30-B.md']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def inspect_links(root, documents):
    checks = []
    for name in documents:
        text = (root / name).read_text(encoding='utf-8')
        for dest in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
            if re.match(r'https?://|#', dest):
                continue
            target = (root / name).parent / dest.split('#')[0]
            checks.append({'document': name, 'target': dest, 'passed': target.is_file()})
    return checks


def offline():
    checks = inspect_links(ROOT, DOCS)
    summary = json.loads((ROOT / FINAL / 'summary.json').read_text(encoding='utf-8'))
    receipts = []
    for ref in summary['receipts']:
        data = (ROOT / ref['path']).read_bytes()
        receipts.append({'path': ref['path'], 'expected': ref['sha256'], 'observed': sha(data), 'passed': sha(data) == ref['sha256']})
    readme = (ROOT / 'README.md').read_text(encoding='utf-8')
    requirements = {
        'repository_access': ['tests/delivery/backend/evidence/access.json'],
        'structure_and_conventions': ['docs/architecture.md', 'apps/web/eslint.config.js', 'services/runner/src/template/build.mjs'],
        'readme': ['README.md', 'docs/install.md'],
        'real_history': ['tests/delivery/backend/evidence/history.json'],
        'environment': ['.env.example', 'docs/environment.md', 'pnpm-lock.yaml', 'templates/vue/pnpm-lock.yaml', 'infra/build-image/Dockerfile'],
    }
    repository = {name: [{'path': p, 'bytes': (ROOT / p).stat().st_size, 'sha256': sha((ROOT / p).read_bytes())} for p in paths] for name, paths in requirements.items()}
    required_sections = ['CodeLess', '架构', '安装', '团队', '锁定版本']
    ledger = []
    for day in range(1, 31):
        for member in 'AB':
            path = f'docs/handoffs/D{day:02}-{member}.md'
            exists = (ROOT / path).is_file()
            ledger.append({'task': f'D{day:02}-{member}', 'handoff': path if exists else None,
                           'recordStatus': 'HANDOFF_EXISTS_NOT_BLANKET_ACCEPTANCE' if exists else 'NOT_DELIVERED_AT_BASELINE',
                           'input_tokens': None, 'output_tokens': None, 'total_tokens': None,
                           'measurement': 'UNKNOWN; original per-task receipt takes precedence, budget is not consumption'})
    return {'mode': 'offline', 'baseline': BASE, 'head': git('rev-parse', 'HEAD').decode().strip(),
            'documents': [{'path': p, 'bytes': (ROOT / p).stat().st_size, 'sha256': sha((ROOT / p).read_bytes())} for p in DOCS],
            'links': checks, 'historicalReceipts': receipts, 'repositoryRequirements': repository,
            'readmeSectionsPresent': all(x in readme for x in required_sections),
            'history': {'count': int(git('rev-list', '--count', BASE)), 'firstParent': git('log', '-8', '--format=%H|%an|%s', BASE).decode().splitlines(),
                        'authors': git('shortlog', '-sn', BASE).decode().splitlines(), 'interpretation': 'Main integration commits alone do not establish two human authors; see PR provenance.'},
            'ledger': ledger, 'failedRequirementIds': ['TASK-03'],
            'passed': all(c['passed'] for c in checks + receipts) and all(x in readme for x in required_sections)}


def public():
    platform = 'https://app.codeless-platform.top'
    site = 'https://dbb96bd04435f85609839d336c0d87aff.sites.codeless-publish.top'
    targets = [(platform + '/login', 200), (site + '/', 200), (site + '/tasks', 200), (site + '/catalog', 200),
               (platform + '/api/v0/publications/bb96bd04-435f-8560-9839-d336c0d87aff/cover', 401),
               (platform + '/api/v0/versions/bc53e8eb-08c3-4e1c-b41c-9667b98ac0fe/export', 401),
               ('https://api.github.com/repos/Echo-love928/CodeLess', 200)]
    checks = []
    for url, expected in targets:
        item = {'url': url, 'expectedHttpStatus': expected, 'authenticated': False, 'tlsVerification': True}
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'CodeLess-D30-B-anonymous-audit'})
            try:
                response = urllib.request.urlopen(request, timeout=25)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                data = response.read(2 * 1024 * 1024 + 1)
                if len(data) > 2 * 1024 * 1024:
                    raise ValueError('Response too large')
                item.update(httpStatus=response.code, bytes=len(data), sha256=sha(data), finalUrl=response.url, passed=response.code == expected)
                if url.endswith('/CodeLess'):
                    repo = json.loads(data)
                    item['repositoryPublic'] = repo['private'] is False
                    item['passed'] = item['passed'] and item['repositoryPublic']
        except Exception as error:
            item.update(passed=False, error=str(error), httpStatus=None)
        checks.append(item)
    return {'mode': 'public', 'checks': checks, 'passed': all(c['passed'] for c in checks),
            'scope': 'Anonymous current reachability and owner-only denial; not authenticated download or current deployed revision proof',
            'paidRequests': 0, 'stateChangingRequests': 0}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['offline', 'public'])
    parser.add_argument('--out', required=True, help='New receipt path; never overwritten')
    args = parser.parse_args()
    output = ROOT / args.out
    if output.exists():
        raise SystemExit('Use a fresh evidence filename')
    result = offline() if args.mode == 'offline' else public()
    result['observedAt'] = datetime.now(timezone.utc).isoformat()
    result['command'] = ['python', 'tests/delivery/client/audit.py', args.mode, '--out', args.out]
    result['nativeExitCode'] = 0 if result['passed'] else 1
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'passed': result['passed'], 'receipt': args.out}))
    raise SystemExit(result['nativeExitCode'])
