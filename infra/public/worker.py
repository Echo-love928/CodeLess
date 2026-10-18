#!/usr/bin/python3
"""Linux peer-credential IPC boundary for three fixed trusted operations.

No caller-selected executable, environment, output roots or Docker arguments.
One job at a time; disconnect/deadline kills its process group and labelled containers.
"""
import base64
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import re
import select
import signal
import socket
import struct
import subprocess
import time
import uuid

ROOT = Path('/srv/codeless')
REPOSITORY = ROOT / 'repository'
PRIVATE = ROOT / 'private/agent'
NODE = '/opt/codeless/tools/node-v24.16.0-linux-x64/bin/node'
SOCKET = '/run/codeless-worker/worker.sock'
CONFIG = '/etc/codeless/worker.json'
MAX_FRAME = 65 * 1024 * 1024


def receive(connection, length):
    result = bytearray()
    while len(result) < length:
        part = connection.recv(length - len(result))
        if not part:
            raise EOFError('Client disconnected')
        result.extend(part)
    return bytes(result)


def binding(request):
    if set(request) != {'argv', 'input'} or not isinstance(request['argv'], list):
        raise ValueError('Invalid envelope')
    args = request['argv']
    data = base64.b64decode(request['input'], validate=True)
    job = json.loads(data)
    if args == [str(REPOSITORY / 'services/api/agent-runner.mjs'),
                *[str(PRIVATE / name) for name in ('work', 'artifacts', 'evidence', 'receipts')]]:
        if len(data) > 128 * 1024 or set(job) != {'sourceDirectory', 'sourceDigest', 'actions'}:
            raise ValueError('Invalid build request')
        source = Path(job['sourceDirectory'])
        if (not source.is_absolute() or not source.resolve(strict=True).is_relative_to(PRIVATE / 'versions')
                or not re.fullmatch(r'sha256:[a-f0-9]{64}', job['sourceDigest'])):
            raise ValueError('Invalid frozen source')
        return args, data, 240, 2 * 1024 * 1024, 'build'
    if args == [str(REPOSITORY / 'services/runner/src/publish/gateway-cli.mjs')]:
        if len(data) > 48 * 1024 * 1024 or job.get('action') not in ('publish', 'probe'):
            raise ValueError('Invalid publication request')
        expected = {'action', 'payload', 'deadline'} | ({'url'} if job['action'] == 'probe' else set())
        if set(job) != expected:
            raise ValueError('Invalid publication fields')
        deadline = datetime.datetime.fromisoformat(job['deadline'].replace('Z', '+00:00')).timestamp()
        remaining = deadline - time.time()
        if not 3 < remaining <= 30:
            raise ValueError('Invalid publication deadline')
        return args, data, remaining, 8192, job['action']
    raise ValueError('Unsupported entry or roots')


def environment(config, job):
    return {'PATH': '/opt/codeless/ops/bin:/opt/codeless/tools/node-v24.16.0-linux-x64/bin:/usr/bin:/bin',
            'HOME': '/srv/codeless/worker-home', 'LANG': 'C.UTF-8',
            'PLAYWRIGHT_BROWSERS_PATH': '/opt/codeless/browsers', 'CODELESS_WORKER_JOB': job,
            'CODELESS_HOSTING_ROOT': '/srv/codeless/publication/sites',
            **{name: config[name] for name in ('CODELESS_PLATFORM_ORIGIN', 'CODELESS_PREVIEW_ORIGIN', 'CODELESS_PUBLICATION_ORIGIN')}}


def cleanup(job, deadline):
    def remaining():
        return max(0.05, min(1, deadline - time.monotonic()))
    result = subprocess.run(['/usr/bin/docker', 'ps', '-aq', '--filter', 'label=codeless.worker-job=' + job],
                            capture_output=True, text=True, timeout=remaining())
    identifiers = result.stdout.split()
    if result.returncode or any(not re.fullmatch(r'[a-f0-9]{12,64}', item) for item in identifiers):
        return False
    if identifiers:
        removed = subprocess.run(['/usr/bin/docker', 'rm', '-f', *identifiers], capture_output=True, timeout=remaining())
        if removed.returncode:
            return False
    final = subprocess.run(['/usr/bin/docker', 'ps', '-aq', '--filter', 'label=codeless.worker-job=' + job],
                           capture_output=True, text=True, timeout=remaining())
    return final.returncode == 0 and not final.stdout.strip()


def handle(connection, config):
    pid, uid, gid = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    if uid != config['apiUid']:
        raise PermissionError('Caller is not API account')
    connection.settimeout(5)
    length = struct.unpack('!I', receive(connection, 4))[0]
    if length > MAX_FRAME:
        raise ValueError('IPC frame limit')
    args, data, timeout, maximum, action = binding(json.loads(receive(connection, length)))
    job = uuid.uuid4().hex
    child = None
    output = b''
    code = 2
    reason = 'unknown'
    cleaned = False
    deadline = time.monotonic() + timeout
    try:
        child = subprocess.Popen([NODE, *args], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.DEVNULL, cwd=REPOSITORY, env=environment(config, job), start_new_session=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(child.communicate, data)
            end = deadline - 2.5  # Worker ownership cleanup stays inside the original deadline.
            try:
                while not pending.done():
                    if time.monotonic() >= end:
                        raise TimeoutError('Job deadline')
                    if select.select([connection], [], [], 0.05)[0]:
                        # No further request bytes are allowed; EOF is cancellation.
                        raise ConnectionError('Client disconnected or sent extra bytes')
                output, _ = pending.result()
                code = child.returncode
                reason = 'completed'
                if len(output) > maximum or code not in (0, 1, 2):
                    raise ValueError('Unexpected trusted result')
            finally:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
    except Exception as error:
        code, output, reason = 2, b'', type(error).__name__
    finally:
        try:
            cleaned = cleanup(job, min(deadline, time.monotonic() + 2.5))
        except Exception:
            cleaned = False
        if not cleaned:
            code, output = 2, b''
        print(json.dumps({'job': job, 'action': action, 'peerUid': uid, 'exit': code,
                          'reason': reason, 'containersCleaned': cleaned}), flush=True)
    response = json.dumps({'exit': code, 'output': base64.b64encode(output).decode('ascii')}).encode()
    connection.sendall(struct.pack('!I', len(response)) + response)


def main():
    os.umask(0o007)
    config = json.loads(Path(CONFIG).read_text())
    path = Path(SOCKET)
    if path.exists():
        if not path.is_socket():
            raise ValueError('Unexpected IPC path')
        path.unlink()
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
        server.bind(SOCKET)
        path.chmod(0o660)
        server.listen(8)
        notify = os.environ.get('NOTIFY_SOCKET')
        if notify:
            with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as readiness:
                readiness.sendto(b'READY=1', '\0' + notify[1:] if notify.startswith('@') else notify)
        print('Fixed-operation worker listening', flush=True)
        while True:
            connection, _ = server.accept()
            with connection:
                try:
                    handle(connection, config)
                except Exception as error:
                    print(json.dumps({'rejected': type(error).__name__}), flush=True)


if __name__ == '__main__':
    main()
