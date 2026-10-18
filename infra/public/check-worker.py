#!/usr/bin/python3
"""Operator-only real IPC checks. Test assets are archived outside public sites."""
import base64
import datetime
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import uuid

subprocess.run(['systemctl', 'start', 'codeless-worker.service'], check=True)
client = '/opt/codeless/ops/worker-client.py'
entry = '/srv/codeless/repository/services/runner/src/publish/gateway-cli.mjs'
files, assets = [], []
for name, content in sorted({'index.html': '<div>IPC fixture only</div><script src="/assets/app.js"></script>',
                             'assets/app.js': 'document.documentElement.dataset.fixture="ipc"'}.items()):
    data = content.encode()
    digest = 'sha256:' + hashlib.sha256(data).hexdigest()
    files.append({'path': name, 'bytes': len(data), 'digest': digest})
    assets.append({'path': name, 'digest': digest, 'bytes': base64.b64encode(data).decode()})
identifier = str(uuid.uuid4())
payload = {'publicationId': identifier, 'versionId': str(uuid.uuid4()),
           'artifactDigest': 'sha256:' + hashlib.sha256(json.dumps(files, separators=(',', ':')).encode()).hexdigest(),
           'assets': assets}
body = {'action': 'publish', 'payload': payload, 'deadline':
        (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=30)).isoformat()}
result = subprocess.run(['runuser', '-u', 'codeless-api', '--', client, entry], input=json.dumps(body),
                        text=True, capture_output=True, timeout=35)
if result.returncode:
    raise RuntimeError('Valid IPC publish failed: ' + result.stderr)
response = json.loads(result.stdout)
assert response['url'] == 'https://d' + identifier.replace('-', '') + '.sites.codeless-publish.top/'
source = Path('/srv/codeless/publication/sites') / identifier
receipt = json.loads((source / '__deployment.json').read_text())
assert receipt['artifactDigest'] == payload['artifactDigest']
archive = Path('/srv/codeless/private/deployment-checks')
archive.mkdir(mode=0o700, exist_ok=True)
source.rename(archive / identifier)
invalid = subprocess.run(['runuser', '-u', 'codeless-api', '--', client, '-e', 'console.log(1)'],
                         input='{}', text=True, capture_output=True, timeout=8)
assert invalid.returncode == 2
no_docker = subprocess.run(['runuser', '-u', 'codeless-api', '--', '/usr/bin/docker', 'ps'],
                           capture_output=True, text=True, timeout=5)
assert no_docker.returncode != 0 and 'permission denied' in no_docker.stderr.lower()
with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
    connection.settimeout(3)
    connection.connect('/run/codeless-worker/worker.sock')
    assert connection.recv(1) == b''
print(json.dumps({'fixedPublishIPC': 'PASSED', 'receiptDigestMatched': True, 'arbitraryEntryRejected': True,
                  'apiDockerDenied': True, 'rootPeerRejected': True, 'fixtureArchivedOutsidePublicSites': True,
                  'publicMilestoneReached': False}))
