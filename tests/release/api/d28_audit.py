"""Read-only D28 identity/provenance audit; FAIL/BLOCKED is never success.

The process returns 1 for incomplete acceptance and 2 for a detected mismatch.
Public network operations are GET only; no cookies, credentials or TLS bypass.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'tests/release/api'
PEER = 'tests/release/browser/evidence/final-61df15e/'
DEPLOYED = '61df15eba456422762a667aaed7734b7d13b48e7'
CANDIDATE = '2be793dc3318c2308d18a7fd45afb201342206a7'
REQUIRED = {'verify:static', 'verify:api', 'verify:runner', 'verify:e2e', 'infra-preflight', 'ci-gate'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(['git', '-c', 'safe.directory=' + ROOT.as_posix(), *args], cwd=ROOT)


def blob(path, revision=CANDIDATE):
    return git('show', revision + ':' + path)


def all_checks_success(head, checks, expected):
    """Reject stale, absent, duplicate, cancelled, neutral and skipped checks."""
    if head != expected or len(checks) != len(REQUIRED) or {c['name'] for c in checks} != REQUIRED:
        return False
    return all(c.get('status') == 'completed' and c.get('conclusion') == 'success' for c in checks)


def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'CodeLess-D28-A-independent-acceptance'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read(4 * 1024 * 1024 + 1)
            if len(data) > 4 * 1024 * 1024:
                raise ValueError('Bounded read exceeded')
            return response.status, data
    except urllib.error.HTTPError as error:
        return error.code, error.read(65536)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--network', action='store_true')
    parser.add_argument('--public-only', action='store_true', help='Affected public GET checks only; do not repeat GitHub queries')
    args = parser.parse_args()
    stamp = datetime.now(timezone.utc).isoformat().replace(':', '-') + '-audit'
    public = BASE / 'evidence/d28' / stamp
    public.mkdir(parents=True)
    report = {'task': 'D28-A', 'candidate': CANDIDATE, 'deployedCandidate': DEPLOYED,
              'command': [sys.executable, '-B', 'tests/release/api/d28_audit.py',
                          *(['--network'] if args.network else []), *(['--public-only'] if args.public_only else [])],
              'startedAt': datetime.now(timezone.utc).isoformat(), 'checks': [], 'mismatches': [], 'blocked': [],
              'recorderSha256': sha(Path(__file__).read_bytes()), 'status': 'RUNNING'}
    def check(name, ok, **details):
        report['checks'].append({'name': name, 'status': 'PASSED' if ok else 'FAILED', **details})
        if not ok:
            report['mismatches'].append(name)
    def read(name):
        raw = blob(PEER + name)
        return json.loads(raw), sha(raw)
    try:
        selected, _ = read('selected.json')
        api, api_sha = read('api-manifest.json')
        client, client_sha = read('client-manifest.json')
        state, _ = read('current-status.json')
        live, _ = read('live-deployment.json')
        server, _ = read('server.json')
        check('MANIFEST_EXTERNAL_DIGESTS', api_sha == selected['apiManifestSha256'] and client_sha == selected['clientManifestSha256'],
              apiManifestSha256=api_sha, clientManifestSha256=client_sha,
              byteSource='immutable Git blobs; no line-ending normalization')
        check('ONE_DEPLOYED_SOURCE', all(x == DEPLOYED for x in (
            selected['sourceCommit'], api['sourceCommit'], client['commit'], state['sourceCommit'],
            live['sourceCommit'], server['sourceCommit'])))
        source_mismatches = []
        for item in api['sourceFiles']:
            path = item['path'].removeprefix('repository/')
            raw = blob(path, DEPLOYED)
            current = blob(path)
            blob_id = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
            if sha(raw) != item['sha256'] or blob_id != item['gitBlob'] or current != raw:
                source_mismatches.append(path)
        check('ALL_API_PACKAGE_SOURCE_BLOBS', not source_mismatches, files=len(api['sourceFiles']), mismatches=source_mismatches)
        roots = ['apps', 'services', 'templates', 'prompts', 'contracts', 'infra', 'scripts',
                 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.github']
        changed = git('diff', '--name-only', DEPLOYED, CANDIDATE, '--', *roots).decode().splitlines()
        check('PRODUCTION_SOURCE_EQUIVALENCE', changed == ['services/api/src/test/java/dev/codeless/api/agent/AgentLoopIntegrationTest.java'],
              allDifferences=changed, exception='test-only receipt preservation; full current gate required')
        for name in ('lockSha256', 'builderSha256', 'configSha256'):
            path = {'lockSha256': 'pnpm-lock.yaml', 'builderSha256': 'infra/release/client/package.mjs',
                    'configSha256': 'infra/release/client/config.json'}[name]
            check('CLIENT_' + name, sha(blob(path, DEPLOYED)) == client[name])
        live_files = {item['path']: item['sha256'] for item in live['liveWebFiles']}
        expected_files = {path: entry['sha256'] for path, entry in client['files'].items() if path.startswith('web/')}
        check('REPORTED_LIVE_WEB_MANIFEST', live_files == expected_files, files=len(live_files))
        worker = sha(blob('infra/public/worker.py', DEPLOYED))
        check('REPORTED_WORKER_SOURCE', worker == state['workerSha256'] == server['ipc']['workerSha256'], sha256=worker)
        flow = server['publicAcceptance']
        check('REPORTED_PUBLIC_VERSION_BINDING', flow['publication']['versionId'] == flow['versionId']
              and flow['publication']['applicationId'] == flow['applicationId']
              and flow['publication']['url'] == state['publicationUrl']
              and flow['failedPublication']['status'] == 'FAILED')
        check('MOCK_AND_HOLD_DISCLOSED', flow['modelProvider'] == 'deterministic-mock' and not flow['modelQualityAccepted']
              and state['releaseApproved'] is False and state['realModelQualityAccepted'] is False,
              unresolved=state['unresolved'])
        operator_items, _ = read('operator-harnesses.json')
        for item in operator_items:
            check('OPERATOR_PUBLISHED_BLOB_' + Path(item['path']).name,
                  sha(blob(item['path'])) == item['publishedGitLfSha256'],
                  executedFileSha256=item['executedFileSha256'],
                  limitation='executed bytes are on B host; published hash is independently checked; not execution proof')
        ci, _ = read('ci.json')
        check('PEER_RECORDED_EXACT_HEAD_CHECKS', all_checks_success(ci['headSha'], ci['jobs'], DEPLOYED),
              note='recorded historical metadata; native child exits remain null')
        report['peerRawLogs'] = []
        for label, entry in ci['logs'].items():
            path = ROOT / entry['path']
            report['peerRawLogs'].append({'stage': label, 'sha256': entry['sha256'], 'availableLocally': path.is_file()})
            if path.is_file():
                check('PEER_RAW_LOG_' + label, sha(path.read_bytes()) == entry['sha256'])
        report['peerArtifacts'] = [{'kind': key, 'sha256': selected[key]['sha256'],
                                    'availableLocally': (ROOT / selected[key]['path']).is_file()}
                                   for key in ('archive', 'imageArchive')]
        report['blocked'].extend(['Historical ENOTEMPTY and CLEANUP_FAILED root causes OPEN',
                                  'Real-model quality and production cover HOLD',
                                  'D28-B PR/contract diff/critical E2E report not present in local main',
                                  'Current authenticated deployment/API/worker identity not independently accessed',
                                  'B-host original execution logs and sealed archives not available locally'])
        if args.network or args.public_only:
            report['network'] = []
            repo = 'https://api.github.com/repos/Echo-love928/CodeLess'
            urls = {'openPRs': repo + '/pulls?state=open&per_page=100',
                    'branches': repo + '/branches?per_page=100',
                    'currentChecks': repo + '/commits/' + CANDIDATE + '/check-runs',
                    'deployedChecks': repo + '/commits/' + DEPLOYED + '/check-runs',
                    'pr92': repo + '/pulls/92', 'pr93': repo + '/pulls/93'}
            for label, url in ([] if args.public_only else urls.items()):
                try:
                    status, raw = get(url)
                    entry = {'name': label, 'url': url, 'httpStatus': status, 'responseSha256': sha(raw)}
                    value = json.loads(raw) if status == 200 else None
                    if label == 'openPRs' and value is not None:
                        entry['items'] = [{'number': p['number'], 'head': p['head']['sha'], 'title': p['title']} for p in value]
                        entry['paginationComplete'] = len(value) < 100
                    elif label == 'branches' and value is not None:
                        entry['d28Branches'] = [{'name': b['name'], 'sha': b['commit']['sha']} for b in value if '28' in b['name']]
                        entry['paginationComplete'] = len(value) < 100
                    elif label.endswith('Checks') and value is not None:
                        checks = value['check_runs']
                        entry['items'] = [{'name': c['name'], 'status': c['status'], 'conclusion': c['conclusion'],
                                           'headSha': c['head_sha'], 'url': c['html_url']} for c in checks]
                        expected = CANDIDATE if label == 'currentChecks' else DEPLOYED
                        entry['allRequiredSuccess'] = all_checks_success(expected, checks, expected) and all(c['head_sha'] == expected for c in checks)
                    elif value is not None:
                        entry.update(head=value['head']['sha'], state=value['state'], mergedAt=value['merged_at'], draft=value['draft'])
                    report['network'].append(entry)
                except Exception as error:
                    report['network'].append({'name': label, 'url': url, 'status': 'BLOCKED', 'errorType': type(error).__name__})
            # Anonymous bytes independently verify only public assets, never privileged backend identity.
            origin = client['config']['platformOrigin']
            for path, item in client['files'].items():
                if not path.startswith('web/'):
                    continue
                status, raw = get(origin + '/' + path[4:])
                check('PUBLIC_WEB_' + path, status == 200 and sha(raw) == item['sha256'], httpStatus=status,
                      actualSha256=sha(raw), expectedSha256=item['sha256'])
            publication = flow['publication']['url']
            for item in flow['publishedFiles']:
                status, raw = get(publication + item['path'])
                check('PUBLIC_NEW_SITE_' + item['path'], status == 200 and 'sha256:' + sha(raw) == item['digest'],
                      httpStatus=status, actualSha256=sha(raw), expectedDigest=item['digest'])
            for path, expected in (('/api/v0/auth/me', 401), ('/internal/preview/health', 404),
                                   ('/api/v0/versions/' + flow['versionId'] + '/export', 401)):
                status, _ = get(origin + path)
                check('ANONYMOUS_' + path, status == expected, httpStatus=status, expected=expected)
    except Exception as error:
        report['blocked'].append('Audit could not finish: ' + type(error).__name__)
        report['auditErrorType'] = type(error).__name__
    report['finishedAt'] = datetime.now(timezone.utc).isoformat()
    report['status'] = 'FAILED' if report['mismatches'] else 'BLOCKED' if report['blocked'] else 'PASSED'
    report['exitCode'] = 2 if report['mismatches'] else 1 if report['blocked'] else 0
    (public / 'result.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'evidence': public.relative_to(ROOT).as_posix(), 'status': report['status'],
                      'checks': len(report['checks']), 'mismatches': report['mismatches'], 'exitCode': report['exitCode']}))
    return report['exitCode']


if __name__ == '__main__':
    sys.exit(main())
