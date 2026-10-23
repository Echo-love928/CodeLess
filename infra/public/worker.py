#!/usr/bin/python3
"""Linux peer-credential IPC boundary for three fixed trusted operations.

No caller-selected executable, environment, output roots or Docker arguments.
One job at a time; disconnect/deadline reclaims descendants and labelled containers.
"""
import base64
import concurrent.futures
import ctypes
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
import sys
import time
import uuid

ROOT = Path('/srv/codeless')
REPOSITORY = ROOT / 'repository'
PRIVATE = ROOT / 'private/agent'
NODE = '/opt/codeless/tools/node-v24.22.1-linux-x64/bin/node'
SOCKET = '/run/codeless-worker/worker.sock'
CONFIG = '/etc/codeless/worker.json'
MAX_FRAME = 65 * 1024 * 1024



class ProcessCleanupFailure(RuntimeError):
    """Fail-stop: systemd must reclaim the broker cgroup before another job."""


def enable_subreaper():
    # Required Linux ownership primitives; never fall back to a reusable PID kill.
    if sys.platform != 'linux' or not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        raise RuntimeError('Linux pidfd process ownership is required')
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
        raise OSError(ctypes.get_errno(), 'Cannot adopt worker job orphans')


def process_identity(pid):
    try:
        fields = Path('/proc', str(pid), 'stat').read_text().rsplit(') ', 1)[1].split()
        return int(fields[1]), fields[19]  # Parent TGID and kernel starttime.
    except (FileNotFoundError, ProcessLookupError):
        return None


def process_children(pid, deadline):
    children = set()
    try:
        for thread in Path('/proc', str(pid), 'task').iterdir():
            if time.monotonic() >= deadline:
                raise TimeoutError('Process cleanup deadline')
            try:
                children.update(int(value) for value in (thread / 'children').read_text().split())
            except (FileNotFoundError, ProcessLookupError):
                pass
    except (FileNotFoundError, ProcessLookupError):
        pass
    return children


def owned_processes(deadline):
    # The serial broker has no other in-flight jobs. Enumerate only its own
    # descendants, including detached sessions reparented to this subreaper.
    owner = os.getpid()
    queue = [(pid, owner) for pid in process_children(owner, deadline)]
    found = {}
    while queue:
        if time.monotonic() >= deadline:
            raise TimeoutError('Process cleanup deadline')
        pid, parent = queue.pop()
        if pid in found:
            continue
        identity = process_identity(pid)
        if identity is None or identity[0] != parent:
            continue
        # A former parent's PID must not have been reused between observations.
        if parent != owner and process_identity(parent) != found.get(parent):
            continue
        found[pid] = identity
        queue.extend((child, pid) for child in process_children(pid, deadline))
    return found


def signal_owned_process(pid, identity):
    try:
        descriptor = os.pidfd_open(pid, 0)
    except ProcessLookupError:
        return
    try:
        # Pin first, then compare starttime: PID reuse cannot target another task.
        current = process_identity(pid)
        if current == identity:
            signal.pidfd_send_signal(descriptor, signal.SIGKILL)
    except ProcessLookupError:
        pass
    finally:
        os.close(descriptor)


def reclaim_processes(child, deadline):
    empty = False
    try:
        while time.monotonic() < deadline:
            owned = owned_processes(deadline)
            # Popen/communicate alone owns waitpid for the direct child.
            if child is not None:
                child.poll()
            if not owned:
                if empty:
                    return True
                empty = True
            else:
                empty = False
                for pid, identity in reversed(list(owned.items())):
                    if time.monotonic() >= deadline:
                        return False
                    signal_owned_process(pid, identity)
                for pid, identity in owned.items():
                    if child is not None and pid == child.pid:
                        continue
                    current = process_identity(pid)
                    if current is not None and current[1] == identity[1] and current[0] == os.getpid():
                        try:
                            os.waitpid(pid, os.WNOHANG)  # Reap this job's adopted orphan only.
                        except ChildProcessError:
                            pass
            time.sleep(min(0.01, max(0, deadline - time.monotonic())))
    except (OSError, TimeoutError):
        return False
    return False


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
    return {'PATH': '/opt/codeless/ops/bin:/opt/codeless/tools/node-v24.22.1-linux-x64/bin:/usr/bin:/bin',
            'HOME': '/srv/codeless/worker-home', 'LANG': 'C.UTF-8',
            'PLAYWRIGHT_BROWSERS_PATH': '/opt/codeless/browsers', 'CODELESS_WORKER_JOB': job,
            'CODELESS_HOSTING_ROOT': '/srv/codeless/publication/sites',
            **{name: config[name] for name in ('CODELESS_PLATFORM_ORIGIN', 'CODELESS_PREVIEW_ORIGIN', 'CODELESS_PUBLICATION_ORIGIN')}}


def cleanup(job, deadline):
    def remaining():
        budget = deadline - time.monotonic()
        if budget <= 0:
            raise TimeoutError('Container cleanup deadline')
        return min(1, budget)
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
    child = pool = None
    output = b''
    code = 2
    reason = 'unknown'
    cleaned = processes_cleaned = False
    deadline = time.monotonic() + timeout
    try:
        child = subprocess.Popen([NODE, *args], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.DEVNULL, cwd=REPOSITORY, env=environment(config, job), start_new_session=True)
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        pending = pool.submit(child.communicate, data)
        end = deadline - 2.5  # Both host-process and Docker cleanup share this reserve.
        while not pending.done():
            if time.monotonic() >= end:
                raise TimeoutError('Job deadline')
            if select.select([connection], [], [], 0.05)[0]:
                raise ConnectionError('Client disconnected or sent extra bytes')
        output, _ = pending.result()
        code = child.returncode
        reason = 'completed'
        if len(output) > maximum or code not in (0, 1, 2):
            raise ValueError('Unexpected trusted result')
    except Exception as error:
        code, output, reason = 2, b'', type(error).__name__
    finally:
        cleanup_deadline = min(deadline, time.monotonic() + 2.5)
        # Detached verifier/browser sessions may own pipes. Kill/reap them before
        # any executor shutdown; a context-manager close could wait forever.
        processes_cleaned = reclaim_processes(child, cleanup_deadline)
        if pool is not None:
            pool.shutdown(wait=False, cancel_futures=True)
        try:
            cleaned = cleanup(job, cleanup_deadline)
        except Exception:
            cleaned = False
        if not cleaned or not processes_cleaned:
            code, output = 2, b''
        print(json.dumps({'job': job, 'action': action, 'peerUid': uid, 'exit': code,
                          'reason': reason, 'containersCleaned': cleaned,
                          'processesCleaned': processes_cleaned}), flush=True)
    if not processes_cleaned:
        raise ProcessCleanupFailure('Host job cleanup could not be confirmed')
    response = json.dumps({'exit': code, 'output': base64.b64encode(output).decode('ascii')}).encode()
    connection.sendall(struct.pack('!I', len(response)) + response)


def main():
    enable_subreaper()
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
                except ProcessCleanupFailure:
                    # Bypass ThreadPoolExecutor's atexit join on inherited pipes.
                    # Existing systemd KillMode=control-group reclaims this service.
                    os._exit(2)
                except Exception as error:
                    print(json.dumps({'rejected': type(error).__name__}), flush=True)


if __name__ == '__main__':
    main()
