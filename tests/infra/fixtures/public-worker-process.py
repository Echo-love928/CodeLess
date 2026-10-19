#!/usr/bin/env python3
"""Linux process-ownership unit fixture; no Docker, server, or credentials."""
import argparse
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import time


def identity(pid):
    try:
        fields = Path('/proc', str(pid), 'stat').read_text().rsplit(') ', 1)[1].split()
        return {'pid': pid, 'ppid': int(fields[1]), 'sid': int(fields[3]), 'starttime': fields[19]}
    except (FileNotFoundError, ProcessLookupError):
        return None


def current(expected):
    value = identity(expected['pid']) if expected else None
    return value if value and value['starttime'] == expected['starttime'] else None


def write_identity(directory, name, pid):
    path = directory / name
    pending = path.with_suffix('.tmp')
    pending.write_text(json.dumps(identity(pid)))
    pending.replace(path)


def ready(directory, name):
    end = time.monotonic() + 5
    while time.monotonic() < end:
        path = directory / name
        if path.exists():
            return json.loads(path.read_text())
        time.sleep(0.01)
    raise TimeoutError('Fixture readiness: ' + name)


def subreaper():
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0):
        raise OSError(ctypes.get_errno(), 'Fixture subreaper')


def reap_exact(expected):
    if not current(expected):
        return
    try:
        descriptor = os.pidfd_open(expected['pid'], 0)
        try:
            if current(expected):
                signal.pidfd_send_signal(descriptor, signal.SIGKILL)
        finally:
            os.close(descriptor)
    except ProcessLookupError:
        pass
    end = time.monotonic() + 3
    while time.monotonic() < end:
        try:
            os.waitpid(expected['pid'], os.WNOHANG)
        except ChildProcessError:
            pass
        if not current(expected):
            return
        time.sleep(0.01)
    raise AssertionError('Fixture PID not reaped: ' + str(expected['pid']))


def parent(args):
    directory = args.directory
    output = subprocess.DEVNULL if args.case == 'completed' else None
    child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--detached',
                              '--directory', str(directory)],
                             stdin=subprocess.DEVNULL, stdout=output,
                             stderr=subprocess.DEVNULL, start_new_session=True)
    write_identity(directory, 'spawned.json', child.pid)
    write_identity(directory, 'parent.json', os.getpid())
    if args.case == 'completed':
        ready(directory, 'detached.json')
        print('{}', flush=True)
        return
    time.sleep(60)


def broker(args):
    spec = importlib.util.spec_from_file_location('fixture_worker', args.worker)
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    # Old-code comparisons still adopt test orphans without pretending that the
    # old daemon configured subreaping itself.
    worker.enable_subreaper() if hasattr(worker, 'enable_subreaper') else subreaper()
    worker.NODE = sys.executable
    worker.REPOSITORY = args.repository
    timeout = 4 if args.case == 'deadline' else 15
    worker.binding = lambda _: ([str(Path(__file__).resolve()), '--parent', '--directory',
                                 str(args.directory), '--case', args.case],
                                b'', timeout, 8192, 'build')
    worker.environment = lambda *_: {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}
    worker.cleanup = lambda *_: True  # Explicit Docker-free unit fixture.
    with socket.socket(fileno=args.socket_fd) as connection:
        try:
            worker.handle(connection, {'apiUid': os.getuid()})
        except (BrokenPipeError, ConnectionResetError):
            pass


def run(args):
    if sys.platform != 'linux':
        raise RuntimeError('Linux-only fixture')
    subreaper()  # Harness owns exact teardown even when testing broken code.
    report = {'kind': 'UNIT_FIXTURE_ONLY', 'case': args.case, 'publicMilestoneReached': False}
    parent_id = detached_id = broker_id = control_id = None
    broker_child = control_child = None
    with tempfile.TemporaryDirectory(prefix='codeless-worker-process-') as temporary:
        directory = Path(temporary)
        left, right = socket.socketpair()
        try:
            control_child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()),
                                              '--control', '--directory', str(directory)],
                                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                             stderr=subprocess.DEVNULL)
            control_id = ready(directory, 'control.json')
            broker_child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()),
                                             '--broker', '--repository', str(args.repository),
                                             '--worker', str(args.worker), '--directory', str(directory),
                                             '--socket-fd', str(left.fileno()), '--case', args.case],
                                            pass_fds=(left.fileno(),), stdin=subprocess.DEVNULL,
                                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            broker_id = identity(broker_child.pid)
            left.close()
            right.sendall(struct.pack('!I', 2) + b'{}')
            parent_id = ready(directory, 'parent.json')
            detached_id = ready(directory, 'detached.json')
            assert detached_id['sid'] == detached_id['pid']
            if args.case == 'disconnect':
                right.close()
            started = time.monotonic()
            try:
                stdout, stderr = broker_child.communicate(timeout=6)
            except subprocess.TimeoutExpired:
                report['handlerBounded'] = False
                raise AssertionError('Broker blocked on detached inherited stdout')
            report.update({'handlerBounded': True, 'afterReadySeconds': time.monotonic() - started,
                           'brokerExit': broker_child.returncode, 'brokerStderr': stderr,
                           'parentGone': current(parent_id) is None,
                           'detachedGone': current(detached_id) is None,
                           'sameUidSiblingAlive': current(control_id) is not None})
            events = [json.loads(line) for line in stdout.splitlines() if line]
            report['workerEvent'] = next(value for value in events if 'job' in value)
            if args.case != 'disconnect':
                right.settimeout(1)
                header = right.recv(4)
                length = struct.unpack('!I', header)[0]
                body = b''
                while len(body) < length:
                    body += right.recv(length - len(body))
                report['response'] = json.loads(body)
            assert report['brokerExit'] == 0, report
            assert report['parentGone'] and report['detachedGone'], report
            assert report['sameUidSiblingAlive'], report
            assert report['workerEvent']['processesCleaned'] is True, report
            assert report['workerEvent']['containersCleaned'] is True, report
            assert report['workerEvent']['exit'] == (0 if args.case == 'completed' else 2), report
            if args.case == 'deadline':
                assert report['workerEvent']['reason'] == 'TimeoutError', report
                assert report['afterReadySeconds'] < 4, report
        finally:
            left.close()
            right.close()
            # Kill only fixture PID identities, never an account or broad group.
            for name in ('parent.json', 'detached.json', 'spawned.json'):
                if (directory / name).exists():
                    value = json.loads((directory / name).read_text())
                    if name == 'parent.json':
                        parent_id = parent_id or value
                    else:
                        detached_id = detached_id or value
            for value in (broker_id, parent_id, detached_id, control_id):
                reap_exact(value)
            if broker_child:
                broker_child.communicate(timeout=2)
            if control_child:
                control_child.wait(timeout=2)
            report['exactFixturePidsReaped'] = all(
                current(value) is None for value in (broker_id, parent_id, detached_id, control_id))
    print(json.dumps(report))
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository', type=Path)
    parser.add_argument('--worker', type=Path)
    parser.add_argument('--case', choices=('disconnect', 'deadline', 'completed'), default='disconnect')
    parser.add_argument('--directory', type=Path)
    parser.add_argument('--socket-fd', type=int)
    for mode in ('broker', 'parent', 'detached', 'control'):
        parser.add_argument('--' + mode, action='store_true')
    args = parser.parse_args()
    args.repository = args.repository or Path(__file__).resolve().parents[3]
    args.worker = args.worker or args.repository / 'infra/public/worker.py'
    if args.broker:
        broker(args)
    elif args.parent:
        parent(args)
    elif args.detached or args.control:
        write_identity(args.directory, 'detached.json' if args.detached else 'control.json', os.getpid())
        time.sleep(60)
    else:
        sys.exit(run(args))

