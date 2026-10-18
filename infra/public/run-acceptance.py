#!/usr/bin/python3
"""Same-host operator launcher: credentials never leave this server.

The browser runs as a dedicated account with no Docker, IPC or private-volume access.
A controlled probe failure changes permissions only on a newly created, unpublished
attempt. Existing successful assets are never modified.
"""
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shlex
import signal
import stat
import subprocess
import time
import uuid

BASE = Path('/srv/codeless')
EVIDENCE = BASE / 'acceptance-private/run-20261018-02'
SITES = BASE / 'publication/sites'


def sql_status(identifier):
    assert str(uuid.UUID(identifier)) == identifier
    result = subprocess.run(['docker', 'exec', 'codeless-public-postgres-1', 'psql', '-U', 'codeless', '-d', 'codeless',
                             '-At', '-c', "SELECT status FROM publications WHERE id='" + identifier + "'"],
                            capture_output=True, text=True, check=True, timeout=5)
    return result.stdout.strip()


def main():
    os.umask(0o077)
    try:
        evaluator = pwd.getpwnam('codeless-evaluator')
    except KeyError:
        subprocess.run(['useradd', '--system', '--user-group', '--no-create-home', '--shell', '/usr/sbin/nologin', 'codeless-evaluator'], check=True)
        evaluator = pwd.getpwnam('codeless-evaluator')
    forbidden = {grp.getgrnam(name).gr_gid for name in ('docker', 'codeless-ipc', 'codeless-shared')}
    assert forbidden.isdisjoint(os.getgrouplist(evaluator.pw_name, evaluator.pw_gid))
    for path in (BASE / 'acceptance-private', EVIDENCE, BASE / 'acceptance-private/home', BASE / 'acceptance-private/home/tmp', BASE / 'public-evidence'):
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chown(path, evaluator.pw_uid, evaluator.pw_gid)
        path.chmod(0o700)
    credentials = {}
    for line in Path('/etc/codeless/api.env').read_text().splitlines():
        name, value = line.split('=', 1)
        if name in ('CODELESS_DEMO_PASSWORD', 'CODELESS_ADMIN_PASSWORD'):
            credentials[name] = shlex.split(value)[0]
    request = {'password': credentials['CODELESS_DEMO_PASSWORD'], 'adminPassword': credentials['CODELESS_ADMIN_PASSWORD'],
               'failedVersionApplicationId': 'd83b28da-198c-4477-85e3-420ecbf83582',
               'retryFailed': os.environ.get('CODELESS_ACCEPTANCE_RETRY_FAILED') == 'true'}
    env = {'PATH': '/opt/codeless/tools/node-v24.16.0-linux-x64/bin:/usr/bin:/bin',
           'HOME': str(BASE / 'acceptance-private/home'), 'TMPDIR': str(BASE / 'acceptance-private/home/tmp'),
           'PLAYWRIGHT_BROWSERS_PATH': '/opt/codeless/browsers', 'LANG': 'C.UTF-8'}
    child = subprocess.Popen(['/usr/sbin/runuser', '-u', evaluator.pw_name, '--',
                              '/opt/codeless/tools/node-v24.16.0-linux-x64/bin/node',
                              str(BASE / 'repository/infra/public/acceptance.mjs'), str(EVIDENCE), str(BASE / 'public-evidence/acceptance.json')],
                             stdin=subprocess.PIPE, env=env, start_new_session=True)
    child.stdin.write(json.dumps(request).encode())
    child.stdin.close()
    credentials.clear()
    request.clear()
    armed, injected, original_mode, modified = False, False, None, None
    baseline = set()
    plan = None
    started = time.monotonic()
    try:
        while child.poll() is None:
            if time.monotonic() - started > 900:
                os.killpg(child.pid, signal.SIGKILL)
                raise TimeoutError('Public browser acceptance deadline')
            plan_path = EVIDENCE / 'failure-plan.json'
            if not armed and plan_path.exists():
                plan = json.loads(plan_path.read_text())
                for key in ('versionId', 'oldPublicationId', 'applicationId'):
                    assert str(uuid.UUID(plan[key])) == plan[key]
                checkpoint = json.loads((EVIDENCE / 'checkpoint.json').read_text())
                assert plan['oldPublicationId'] == checkpoint['publication']['id']
                assert plan['versionId'] == checkpoint['editedVersionId']
                assert sql_status(plan['oldPublicationId']) == 'PUBLISHED'
                baseline = {path.name for path in SITES.iterdir()}
                (EVIDENCE / 'failure-armed.json').write_text(json.dumps({'armed': True}))
                (EVIDENCE / 'failure-armed.json').chmod(0o644)
                armed = True
            if armed and not injected:
                for directory in SITES.iterdir():
                    if directory.name in baseline or directory.is_symlink() or not re.fullmatch(r'[a-f0-9-]{36}', directory.name):
                        continue
                    receipt_path = directory / '__deployment.json'
                    if not receipt_path.exists():
                        continue
                    receipt = json.loads(receipt_path.read_text())
                    if receipt['versionId'] != plan['versionId']:
                        continue
                    assert receipt['deploymentId'] == directory.name
                    assert sql_status(directory.name) == 'REQUESTED'
                    name = next(item['path'] for item in receipt['files'] if re.fullmatch(r'assets/[A-Za-z0-9_-]+\.js', item['path']))
                    modified = directory / name
                    assert modified.resolve().is_relative_to(directory) and not modified.is_symlink()
                    original_mode = stat.S_IMODE(modified.stat().st_mode)
                    # Preserve the worker owner's read access for frozen-byte checks;
                    # deny only the public Nginx reader so the real HTTPS probe fails.
                    modified.chmod(0o640)
                    injected = True
                    (EVIDENCE / 'failure-injected.json').write_text(json.dumps({'publicationId': directory.name,
                        'path': name, 'injection': 'new_attempt_public_reader_denied', 'oldSuccessModified': False}))
                    (EVIDENCE / 'failure-injected.json').chmod(0o644)
                    break
            time.sleep(0.01)
        code = child.wait()
    finally:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=5)
        if modified:
            identifier = modified.parent.parent.name
            until = time.monotonic() + 35
            status = sql_status(identifier)
            while status == 'REQUESTED' and time.monotonic() < until:
                time.sleep(0.2)
                status = sql_status(identifier)
            if status != 'REQUESTED':
                modified.chmod(original_mode)
                if status == 'FAILED':
                    archive = BASE / 'private/deployment-checks'
                    archive.mkdir(mode=0o700, exist_ok=True)
                    (SITES / identifier).rename(archive / identifier)
    if code:
        raise SystemExit(code)
    report = json.loads((EVIDENCE / 'acceptance.json').read_text())
    assert report['status'] == 'PASSED'
    injection = json.loads((EVIDENCE / 'failure-injected.json').read_text())
    assert injection['publicationId'] == report['failedPublication']['id']
    print(json.dumps({'serverBrowserAcceptance': 'PASSED', 'credentialsExported': False, 'browserHasDockerOrIpcAccess': False,
                      'publicMilestoneReached': False, 'evidence': str(EVIDENCE)}))


if __name__ == '__main__':
    main()
