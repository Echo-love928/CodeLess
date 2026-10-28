"""Read-only Linux resource sidecar. Never starts workloads or reads credentials/argv."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import time
from datetime import datetime, timezone


def utc():
    return datetime.now(timezone.utc).isoformat()


def read_text(path):
    with path.open('rb') as stream:
        data = stream.read(65537)
    if len(data) > 65536:
        raise ValueError('resource file exceeds 64 KiB')
    return data.decode('utf8')


def counters(text):
    return {key: int(value) for key, value in (line.split() for line in text.splitlines())}


def proc_stat(text):
    # comm can contain spaces and parentheses; never emit comm or command arguments.
    values = text.rsplit(') ', 1)[1].split()
    return {'state': values[0], 'cpuTicks': int(values[11]) + int(values[12]),
            'startTicks': int(values[19])}


def cgroup_snapshot(path):
    result = {}
    errors = []
    for name in ['cpu.stat', 'cpu.max', 'memory.current', 'memory.peak', 'memory.max',
                 'memory.events', 'pids.current', 'pids.max']:
        try:
            text = read_text(path / name).strip()
            result[name] = counters(text) if name.endswith(('.stat', '.events')) else (
                text if text == 'max' or name == 'cpu.max' else int(text))
        except (OSError, ValueError) as error:
            result[name] = None
            errors.append({'metric': name, 'error': type(error).__name__})
    return {'metrics': result, 'errors': errors,
            'scope': 'entire process cgroup; may include processes other than selected PID'}


def process_snapshot(pid, expected_start=None, proc=Path('/proc'), groups=Path('/sys/fs/cgroup')):
    try:
        result = proc_stat(read_text(proc / str(pid) / 'stat'))
    except FileNotFoundError:
        return {'state': 'EXITED', 'cpuTicks': None, 'rssBytes': None, 'cgroup': None}
    if expected_start is not None and result['startTicks'] != expected_start:
        return {'state': 'PID_REUSED', 'cpuTicks': None, 'rssBytes': None, 'cgroup': None}
    try:
        status = read_text(proc / str(pid) / 'status')
        membership = read_text(proc / str(pid) / 'cgroup')
    except FileNotFoundError:
        return {'state': 'EXITED', 'cpuTicks': None, 'rssBytes': None, 'cgroup': None}
    rss = re.search(r'^VmRSS:\s+(\d+) kB$', status, re.M)
    result['rssBytes'] = int(rss[1]) * 1024 if rss else None
    result['cgroup'] = None
    for line in membership.splitlines():
        if line.startswith('0::'):
            relative = line[3:].lstrip('/')
            root = groups.resolve()
            path = (root / relative).resolve()
            if not path.is_relative_to(root):
                raise ValueError('cgroup path escapes cgroup root')
            result['cgroup'] = cgroup_snapshot(path)
            result['cgroup']['id'] = hashlib.sha256(relative.encode()).hexdigest()[:16]
            break
    return result


def scratch_snapshot(path, limit=10000):
    if path.is_symlink():
        raise ValueError('scratch root must not be a symlink')
    if not path.exists():
        return {'state': 'ABSENT', 'files': 0, 'bytes': 0, 'linksSkipped': 0}
    if not path.is_dir() or path.resolve() == Path(path.anchor):
        raise ValueError('scratch must be a specific non-root directory')
    result = {'state': 'PRESENT', 'files': 0, 'bytes': 0, 'linksSkipped': 0}
    pending = [(path, 0)]
    visited = 0
    while pending:
        current, depth = pending.pop()
        if depth > 32:
            raise ValueError('scratch depth exceeds limit')
        for item in current.iterdir():
            visited += 1
            if visited > limit:
                raise ValueError('scratch entry count exceeds limit')
            if item.is_symlink():
                result['linksSkipped'] += 1
            elif item.is_dir():
                pending.append((item, depth + 1))
            else:
                result['files'] += 1
                result['bytes'] += item.stat().st_size
    return result


DOCKER_FORMAT = ('{"id":{{json .Id}},"running":{{json .State.Running}},'
                 '"pid":{{json .State.Pid}},"oomKilled":{{json .State.OOMKilled}},'
                 '"exitCode":{{json .State.ExitCode}},"limits":{"memoryBytes":{{json .HostConfig.Memory}},'
                 '"memorySwapBytes":{{json .HostConfig.MemorySwap}},"nanoCpus":{{json .HostConfig.NanoCpus}},'
                 '"pids":{{json .HostConfig.PidsLimit}}}}')


def docker_snapshots(ids, run=subprocess.run):
    if not ids:
        return []
    if len(ids) > 16 or any(not re.fullmatch('[0-9a-f]{64}', item) for item in ids):
        raise ValueError('at most 16 explicit full container IDs required')
    try:
        value = run(['docker', 'inspect', '--format', DOCKER_FORMAT, *ids],
                    capture_output=True, text=True, timeout=3)
    except (OSError, subprocess.TimeoutExpired) as error:
        return [{'id': item, 'state': 'UNKNOWN', 'error': type(error).__name__} for item in ids]
    observed = {}
    for line in value.stdout.splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if not isinstance(row, dict):
            raise ValueError('unexpected Docker response')
        if row.get('id') not in ids:
            raise ValueError('unexpected Docker identity')
        # Explicit allowlist: do not save Env, command, mounts, labels or raw errors.
        observed[row['id']] = {key: row[key] for key in ['id', 'running', 'pid', 'oomKilled', 'exitCode']}
        observed[row['id']]['limits'] = {key: row['limits'][key] for key in [
            'memoryBytes', 'memorySwapBytes', 'nanoCpus', 'pids']}
        observed[row['id']]['state'] = 'RUNNING' if row['running'] else 'STOPPED'
    for item in ids:
        if item not in observed:
            absent = re.search(r'No such (?:object|container):\s*' + item + r'\b', value.stderr, re.I)
            observed[item] = {'id': item, 'state': 'REMOVED' if absent else 'UNKNOWN',
                              'inspectionExitCode': value.returncode}
    return [observed[item] for item in ids]


def host_snapshot(proc=Path('/proc')):
    memory = {}
    for line in read_text(proc / 'meminfo').splitlines():
        key, value = line.split(':', 1)
        if key in ['MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree']:
            memory[key + 'Bytes'] = int(value.split()[0]) * 1024
    ticks = [int(item) for item in read_text(proc / 'stat').splitlines()[0].split()[1:9]]
    return {'memory': memory, 'cpuTicks': ticks}


def monitor(pids, output, duration=300, interval=0.5, containers_file=None, scratch=(), stop_file=None):
    if not Path('/proc/self/stat').exists():
        raise ValueError('Linux /proc and cgroup v2 required; no simulated fallback')
    if not 0.1 <= interval <= 30 or not 1 <= duration <= 1800:
        raise ValueError('interval must be 0.1..30s and duration 1..1800s')
    if not pids or len(pids) > 16 or any(pid < 1 for pid in pids):
        raise ValueError('1..16 explicit positive PIDs required')
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    roots = {}
    errors = []
    started = time.monotonic_ns()
    report = {'kind': 'RESOURCE_OBSERVATIONS', 'status': 'RUNNING', 'startedAt': utc(),
              'clock': 'Linux CLOCK_MONOTONIC nanoseconds + UTC; not cross-process performance.now()',
              'sampleSemantics': 'non-atomic read window [monotonicNs, completedMonotonicNs]',
              'samplerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'intervalSeconds': interval, 'maximumDurationSeconds': duration,
              'workloadResult': 'NOT_EVALUATED', 'modelProvider': 'NOT_OBSERVED',
              'modelRequests': 'NOT_MEASURED', 'ticksPerSecond': os.sysconf('SC_CLK_TCK'),
              'samples': 0, 'errors': errors}
    stopped = []
    old_handlers = {}
    for sig in [signal.SIGINT, signal.SIGTERM]:
        old_handlers[sig] = signal.signal(sig, lambda number, _frame: stopped.append(number))
    sample_path = output / 'samples.jsonl'
    try:
        for index, pid in enumerate(pids):
            value = process_snapshot(pid)
            if value.get('startTicks') is None or value['cgroup'] is None or value['cgroup']['errors']:
                raise ValueError('selected PID unavailable or cgroup v2 metrics incomplete')
            roots['process-' + str(index + 1)] = (pid, value['startTicks'])
        with sample_path.open('xb') as stream:
            while True:
                at = time.monotonic_ns()
                sample = {'at': utc(), 'monotonicNs': at, 'elapsedNs': at - started,
                          'processes': {}, 'containers': [], 'scratch': {}, 'errors': []}
                try:
                    sample['host'] = host_snapshot()
                    usage = shutil.disk_usage(output)
                    sample['diskFreeBytes'] = usage.free
                    for label, (pid, identity) in roots.items():
                        value = process_snapshot(pid, identity)
                        sample['processes'][label] = value
                        if value['state'] == 'PID_REUSED' or (value.get('cgroup') or {}).get('errors'):
                            raise ValueError('PID identity changed or cgroup metrics incomplete')
                    if containers_file:
                        ids = list(dict.fromkeys(read_text(containers_file).split())) if containers_file.exists() else []
                        for value in docker_snapshots(ids):
                            if value['state'] == 'UNKNOWN':
                                raise ValueError('Docker resource state unknown')
                            if value['state'] == 'RUNNING':
                                value['process'] = process_snapshot(value['pid'])
                                if value['process']['state'] != 'EXITED' and (
                                        value['process'].get('cgroup') is None or value['process']['cgroup']['errors']):
                                    raise ValueError('container cgroup metrics incomplete')
                            value.pop('pid', None)
                            sample['containers'].append(value)
                    for index, path in enumerate(scratch):
                        sample['scratch']['scratch-' + str(index + 1)] = scratch_snapshot(path)
                except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
                    sample['errors'].append(type(error).__name__)
                    errors.append({'sample': report['samples'], 'error': type(error).__name__})
                sample['completedMonotonicNs'] = time.monotonic_ns()
                sample['completedAt'] = utc()
                stream.write((json.dumps(sample, separators=(',', ':')) + '\n').encode())
                stream.flush()
                report['samples'] += 1
                if not errors and report['samples'] == 1:
                    (output / 'ready.json').write_bytes(json.dumps({'at': sample['completedAt'],
                        'monotonicNs': sample['completedMonotonicNs'],
                        'meaning': 'collector sampled; does not prove workload or pressure started'}).encode())
                if errors:
                    report['endReason'] = 'SAMPLING_ERROR'
                    break
                if stopped:
                    report['endReason'] = 'SIGNAL'; report['signal'] = stopped[0]; break
                if stop_file and stop_file.exists():
                    report['endReason'] = 'STOP_FILE'; break
                if (time.monotonic_ns() - started) / 1e9 >= duration:
                    report['endReason'] = 'DURATION'; break
                remaining = duration - (time.monotonic_ns() - started) / 1e9
                time.sleep(max(0, min(interval, remaining)))
        report['status'] = 'INCOMPLETE' if errors else 'COMPLETE'
    except (OSError, ValueError) as error:
        errors.append({'error': type(error).__name__})
        report['status'] = 'INCOMPLETE'
    finally:
        for sig, handler in old_handlers.items():
            signal.signal(sig, handler)
        report['completedAt'] = utc()
        report['completedMonotonicNs'] = time.monotonic_ns()
        (output / 'summary.json').write_bytes((json.dumps(report, indent=2) + '\n').encode())
        files = {name: hashlib.sha256((output / name).read_bytes()).hexdigest()
                 for name in ['samples.jsonl', 'summary.json', 'ready.json'] if (output / name).exists()}
        (output / 'manifest.json').write_bytes((json.dumps({'files': files}, indent=2) + '\n').encode())
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', type=int, required=True, action='append')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--duration', type=float, default=300)
    parser.add_argument('--interval', type=float, default=0.5)
    parser.add_argument('--containers-file', type=Path)
    parser.add_argument('--scratch', type=Path, action='append', default=[])
    parser.add_argument('--stop-file', type=Path)
    args = parser.parse_args()
    result = monitor(args.pid, args.out, args.duration, args.interval, args.containers_file,
                     args.scratch, args.stop_file)
    print(json.dumps({'status': result['status'], 'samples': result['samples'],
                      'workloadResult': result['workloadResult']}))
    raise SystemExit(0 if result['status'] == 'COMPLETE' else 1)
