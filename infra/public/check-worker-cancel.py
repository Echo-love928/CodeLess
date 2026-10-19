#!/usr/bin/python3
"""Cancel a real build over IPC and assert owned Docker cleanup and isolation."""
import grp
import json
import os
from pathlib import Path
import pwd
import shutil
import signal
import subprocess
import time
import uuid

repository = Path('/srv/codeless/repository')
source = Path('/srv/codeless/private/agent/versions') / ('ipc-cancel-' + uuid.uuid4().hex) / 'source'
shutil.copytree(repository / 'templates/vue/fixtures/tasks', source)
api, shared = pwd.getpwnam('codeless-api'), grp.getgrnam('codeless-shared')
os.chown(source.parent, api.pw_uid, shared.gr_gid)
source.parent.chmod(0o750)
for folder, _, files in os.walk(source):
    os.chown(folder, api.pw_uid, shared.gr_gid)
    Path(folder).chmod(0o750)
    for name in files:
        target = Path(folder) / name
        os.chown(target, api.pw_uid, shared.gr_gid)
        target.chmod(0o640)
node = '/opt/codeless/tools/node-v24.16.0-linux-x64/bin/node'
digest = json.loads(subprocess.run([node, '--input-type=module', '-e',
    "import {readSnapshot} from './services/runner/src/artifacts/snapshot.mjs'; console.log(JSON.stringify((await readSnapshot(process.argv[1], {source:true})).manifest.digest))",
    str(source)], cwd=repository, capture_output=True, text=True, check=True).stdout)
args = ['runuser', '-u', 'codeless-api', '--', '/opt/codeless/ops/worker-client.py',
        str(repository / 'services/api/agent-runner.mjs'),
        *['/srv/codeless/private/agent/' + name for name in ('work', 'artifacts', 'evidence', 'receipts')]]
before = set(subprocess.run(['docker', 'ps', '-aq', '--filter', 'label=codeless.worker-job'], capture_output=True, text=True, check=True).stdout.split())
client = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
client.stdin.write(json.dumps({'sourceDirectory': str(source), 'sourceDigest': digest, 'actions': []}).encode())
client.stdin.close()
observed = None
try:
    until = time.monotonic() + 20
    while time.monotonic() < until and client.poll() is None:
        now = set(subprocess.run(['docker', 'ps', '-aq', '--filter', 'label=codeless.worker-job'], capture_output=True, text=True, check=True).stdout.split())
        if now - before:
            observed = json.loads(subprocess.run(['docker', 'inspect', sorted(now - before)[0]], capture_output=True, text=True, check=True).stdout)[0]
            break
        time.sleep(0.05)
    if not observed:
        raise AssertionError('No live owned build container observed')
    host = observed['HostConfig']
    assert host['NetworkMode'] == 'none' and host['ReadonlyRootfs'] and not host['Privileged']
    assert host['CapDrop'] == ['ALL'] and host['PidsLimit'] <= 128 and host['Memory'] > 0
    assert observed['Config']['User'].split(':')[0] not in ('', '0', 'root')
    assert all('docker.sock' not in item['Source'] and '/etc/codeless' not in item['Source'] for item in observed['Mounts'])
    job = observed['Config']['Labels']['codeless.worker-job']
    assert client.poll() is None, 'Client finished before cancellation'
    os.killpg(client.pid, signal.SIGKILL)
    client.wait(timeout=5)
    until = time.monotonic() + 8
    while time.monotonic() < until:
        left = subprocess.run(['docker', 'ps', '-aq', '--filter', 'label=codeless.worker-job=' + job], capture_output=True, text=True, check=True).stdout.strip()
        if not left:
            break
        time.sleep(0.1)
    assert not left, 'Owned container survived IPC cancellation'
    print(json.dumps({'ipcDisconnectedDuringRealBuild': True, 'ownedContainerRemoved': True,
                      'containerIsolationVerified': True, 'workerJob': job, 'publicMilestoneReached': False}))
finally:
    if client.poll() is None:
        os.killpg(client.pid, signal.SIGKILL)
        client.wait(timeout=5)
