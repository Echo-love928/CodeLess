"""GET-only exact-head CI evidence. Credentials and raw job logs stay private."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from d28_audit import ROOT, all_checks_success


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--head', required=True)
    parser.add_argument('--run', type=int, required=True)
    parser.add_argument('--private-only', action='store_true', help='Final HEAD receipt stays private to avoid a self-changing evidence commit')
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{40}', args.head) or args.run <= 0:
        parser.error('Require exact SHA and positive run ID')
    credential = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                                text=True, capture_output=True, check=True,
                                env=dict(os.environ, GIT_TERMINAL_PROMPT='0', GCM_INTERACTIVE='never'))
    fields = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
    base = 'https://api.github.com/repos/Echo-love928/CodeLess'
    headers = {'Authorization': 'Bearer ' + fields['password'], 'User-Agent': 'CodeLess-D28-A-acceptance'}
    opener = urllib.request.build_opener(NoRedirect())

    def get(path, raw=False):
        request = urllib.request.Request(base + path, headers=headers)
        try:
            response = opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            if error.code != 302 or not raw:
                raise RuntimeError('GitHub GET failed: ' + str(error.code)) from None
            location = error.headers['Location']
            url = urllib.parse.urlparse(location)
            if url.scheme != 'https' or not url.hostname or not url.hostname.endswith(('.blob.core.windows.net', '.actions.githubusercontent.com')):
                raise RuntimeError('Unexpected log redirect')
            # Never forward GitHub authorization to artifact storage.
            response = opener.open(location, timeout=30)
        with response:
            data = response.read(64 * 1024 * 1024 + 1)
        if len(data) > 64 * 1024 * 1024:
            raise RuntimeError('Bounded read exceeded')
        return data if raw else json.loads(data)

    run = get('/actions/runs/' + str(args.run))
    if run['head_sha'] != args.head:
        raise RuntimeError('Run HEAD mismatch')
    jobs = get('/actions/runs/' + str(args.run) + '/jobs?per_page=100')
    checks = get('/commits/' + args.head + '/check-runs?per_page=100')
    if jobs['total_count'] > 100 or checks['total_count'] > 100:
        raise RuntimeError('Unexpected pagination; refusing incomplete evidence')
    stamp = 'ci-' + args.head[:7] + '-' + datetime.now(timezone.utc).isoformat().replace(':', '-')
    private = ROOT / 'tests/release/api/.private/d28-fix' / stamp
    public = private if args.private_only else ROOT / 'tests/release/api/evidence/d28-fix' / stamp
    private.mkdir(parents=True)
    if public != private:
        public.mkdir(parents=True)
    report = {'task': 'D28-A-fix', 'head': args.head, 'runId': args.run,
              'status': run['status'], 'conclusion': run['conclusion'],
              'observedAt': datetime.now(timezone.utc).isoformat(),
              'command': [sys.executable, __file__, *sys.argv[1:]], 'jobs': [],
              'checks': [{k: c.get(k) for k in ('name', 'head_sha', 'status', 'conclusion', 'html_url')}
                         for c in checks['check_runs']]}
    for job in jobs['jobs']:
        row = {k: job.get(k) for k in ('id', 'name', 'status', 'conclusion', 'started_at', 'completed_at')}
        row['nativeExitCode'] = None  # GitHub conclusion is not a child process exit code.
        if job['status'] == 'completed':
            data = get('/actions/jobs/' + str(job['id']) + '/logs', raw=True)
            path = private / (re.sub('[^a-zA-Z0-9_-]', '-', job['name']) + '.log')
            path.write_bytes(data)
            row.update(privateLog=path.relative_to(ROOT).as_posix(), logSha256=hashlib.sha256(data).hexdigest(), logBytes=len(data))
            lines = data.decode('utf-8', errors='replace').splitlines()
            patterns = ('Tests run: 428', '80 passed', '212 passed', 'tests 285', 'pass 285', 'tests 64', 'pass 64',
                        'cancelled 0', 'skipped 0', 'todo 0', '"browserExitCode":0', 'BUILD SUCCESS')
            row['observedTokens'] = [p for p in patterns if any(p in line for line in lines)]
        report['jobs'].append(row)
    success = (run['status'] == 'completed' and run['conclusion'] == 'success'
               and all_checks_success(args.head, report['checks'], args.head)
               and all(c['head_sha'] == args.head for c in report['checks']))
    report['exitCode'] = 0 if success else 1
    (public / 'result.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'head': args.head, 'allRequiredSuccess': success, 'exitCode': report['exitCode'],
                      'evidence': public.relative_to(ROOT).as_posix()}))
    return report['exitCode']


if __name__ == '__main__':
    sys.exit(main())
