#!/usr/bin/python3
"""Operator check of DAC and the running services' actual mount namespaces.

Only an unrouteable dot-prefixed canary is modified. Existing publications are
checked for ownership/modes but never written. No credentials are read.
"""
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import tempfile

ROOT = Path('/srv/codeless/publication/sites')

# Fixed probe, run as the service account, optionally in its mount namespace.
PROBE = r'''
import errno,json,os,stat,sys
from pathlib import Path
root,canary=map(Path,sys.argv[1:])
assert canary.parent==root and canary.name.startswith('.permission-check-')
assert (canary/'index.html').read_bytes()==b'permission canary'
denied={}
for name,operation in (
    ('createAtRoot',lambda:(root/(canary.name+'-denied')).open('xb')),
    ('createInPublication',lambda:(canary/'new-file').open('xb')),
    ('overwrite',lambda:(canary/'index.html').open('wb')),
    ('unlink',lambda:(canary/'index.html').unlink()),
    ('renamePublication',lambda:canary.rename(root/(canary.name+'-moved')))):
    try:
        result=operation()
        if hasattr(result,'close'):result.close()
        denied[name]=False
    except OSError as error:
        if error.errno not in (errno.EACCES,errno.EPERM,errno.EROFS):raise
        denied[name]=True
assert all(denied.values()),denied
assert (canary/'index.html').read_bytes()==b'permission canary'
print(json.dumps({'readable':True,'writesDenied':denied,
                  'mountReadOnly':bool(os.statvfs(root).f_flag & os.ST_RDONLY)}))
'''


def run(args):
    return subprocess.run(args, check=True, text=True, capture_output=True, timeout=10).stdout.strip()


def check():
    assert os.getuid() == 0, 'Operator root required'
    worker = pwd.getpwnam('codeless-worker')
    assert ROOT.is_dir() and not ROOT.is_symlink()
    assert ROOT.stat().st_uid == worker.pw_uid
    assert stat.S_IMODE(ROOT.stat().st_mode) == 0o755
    checked = 0
    for path in ROOT.rglob('*'):
        info = path.lstat()
        assert not stat.S_ISLNK(info.st_mode), 'Published symlink rejected'
        assert stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)
        assert info.st_uid == worker.pw_uid, 'Only worker may own published content'
        assert not info.st_mode & 0o022, 'Published content must not be group/world writable'
        checked += 1
    # Dot names never match the UUID-only public host/path mapping.
    with tempfile.TemporaryDirectory(prefix='.permission-check-', dir=ROOT) as temporary:
        canary = Path(temporary)
        canary.chmod(0o755)
        os.chown(canary, worker.pw_uid, worker.pw_gid)
        page = canary / 'index.html'
        page.write_bytes(b'permission canary')
        page.chmod(0o644)
        os.chown(page, worker.pw_uid, worker.pw_gid)
        accounts, namespaces = {}, {}
        for role in ('codeless-api', 'codeless-preview'):
            command = ['/usr/sbin/runuser', '-u', role, '--', '/usr/bin/python3', '-c', PROBE, str(ROOT), str(canary)]
            accounts[role] = json.loads(run(command))
            pid = int(run(['systemctl', 'show', role, '--property=MainPID', '--value']))
            assert pid > 1
            namespaces[role] = json.loads(run(['/usr/bin/nsenter', '-t', str(pid), '-m', '--', *command]))
            assert namespaces[role]['mountReadOnly'], 'Publication must be read-only in the running service'
        worker_pid = int(run(['systemctl', 'show', 'codeless-worker', '--property=MainPID', '--value']))
        assert worker_pid > 1
        writer = "from pathlib import Path; import sys; p=Path(sys.argv[1]); f=p/'worker-write'; f.write_bytes(b'worker'); f.unlink(); print('WRITABLE')"
        assert run(['/usr/bin/nsenter', '-t', str(worker_pid), '-m', '--', '/usr/sbin/runuser', '-u', 'codeless-worker',
                    '--', '/usr/bin/python3', '-c', writer, str(canary)]) == 'WRITABLE'
    return {'status': 'PASSED', 'siteEntriesChecked': checked, 'onlyWorkerOwnsAndWritesSites': True,
            'accounts': accounts, 'runningNamespaces': namespaces, 'workerNamespaceWritable': True,
            'existingPublicationsModified': False, 'publicMilestoneReached': False}


if __name__ == '__main__':
    print(json.dumps(check()))
