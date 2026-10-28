"""Real Linux CPU/OOM/removal verification for B's read-only resource sidecar."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import uuid

COMMAND_LOG = None


def run(args, cwd=None, timeout=30):
    value = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if COMMAND_LOG:
        with COMMAND_LOG.open('ab') as stream:
            stream.write((json.dumps({'command': args, 'exitCode': value.returncode,
                'stdout': value.stdout, 'stderr': value.stderr}) + '\n').encode())
    if value.returncode:
        raise RuntimeError('command failed: ' + args[0] + '; details remain in private stderr')
    return value.stdout.strip()


def wait_for(predicate, seconds=10):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.05)
    raise TimeoutError('resource verification deadline')


def verify(repo, output, sampler):
    global COMMAND_LOG
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    COMMAND_LOG = output / 'commands.jsonl'  # Private: command mount paths are not part of public samples.
    scratch = output / 'scratch'
    (scratch / 'input/src/data').mkdir(parents=True)
    (scratch / 'output').mkdir()
    (scratch / 'input/src/data/Memory.ts').write_bytes(b'export const fixture=true\n')
    control = output / 'control'; control.mkdir()
    ids = control / 'containers'
    tag = 'codeless-d22-support:' + str(uuid.uuid4())
    name = 'codeless-d22-support-' + str(uuid.uuid4())
    report = {'kind': 'B_RESOURCE_SUPPORT_SMOKE', 'status': 'RUNNING', 'paidModelRequests': 0,
              'scope': 'real Linux CPU, bounded Docker cgroup OOM, read-only sampling and removal; not API/model throughput',
              'samplerSha256': hashlib.sha256(sampler.read_bytes()).hexdigest(), 'cleanupErrors': []}
    burner = collector = None
    container = None
    image_created = False
    def save():
        (output / 'smoke.json').write_bytes((json.dumps(report, indent=2) + '\n').encode())
    def samples():
        path = output / 'resources/samples.jsonl'
        if not path.exists():
            return []
        lines = path.read_bytes().splitlines()
        result = []
        for line in lines:
            try:
                result.append(json.loads(line))
            except json.JSONDecodeError:
                pass  # Concurrent final line may be incomplete; never treat it as a sample.
        return result
    save()
    try:
        run(['docker', 'build', '-f', 'tests/runner/build/fixtures/Dockerfile', '-t', tag, '.'], repo)
        image_created = True
        burner_code = '''import pathlib,time,sys
p=pathlib.Path(sys.argv[1])
while not (p/'cpu-start').exists():time.sleep(.01)
end=time.monotonic()+2
while time.monotonic()<end:pass
(p/'cpu-done').touch()
while not (p/'cpu-stop').exists():time.sleep(.01)
'''
        burner = subprocess.Popen([sys.executable, '-c', burner_code, str(control)])
        with (output / 'collector.log').open('wb') as log:
            collector = subprocess.Popen([sys.executable, str(sampler), '--pid', str(burner.pid),
                '--out', str(output / 'resources'), '--duration', '40', '--interval', '0.25',
                '--containers-file', str(ids), '--scratch', str(scratch), '--stop-file', str(control / 'stop')],
                stdout=log, stderr=subprocess.STDOUT)
            wait_for(lambda: (output / 'resources/ready.json').exists())
            report['cpuStartMonotonicNs'] = time.monotonic_ns()
            (control / 'cpu-start').touch()
            wait_for(lambda: (control / 'cpu-done').exists())
            container = run(['docker', 'run', '-d', '--name', name, '--label', 'codeless.test=d22-resource-support',
                '--network', 'none', '--read-only', '--user', '1000:1000', '--cpus', '1', '--memory', '96m',
                '--memory-swap', '96m', '--pids-limit', '128', '--cap-drop', 'ALL',
                '--security-opt', 'no-new-privileges', '--mount', 'type=bind,source=' + str(scratch / 'input') + ',target=/input,readonly',
                '--mount', 'type=bind,source=' + str(scratch / 'output') + ',target=/output', tag])
            pending = control / 'containers.tmp'; pending.write_text(container + '\n'); pending.replace(ids)
            def oom_sample():
                return any(value.get('oomKilled') and (value.get('process', {}).get('cgroup') or {}).get(
                    'metrics', {}).get('memory.events', {}).get('oom_kill', 0) > 0
                    for sample in samples() for value in sample['containers'])
            wait_for(oom_sample)
            report['guardianAcknowledgedMonotonicNs'] = time.monotonic_ns()
            run(['docker', 'kill', '--signal', 'USR2', container])
            report['containerExitCode'] = int(run(['docker', 'wait', container]))
            assert report['containerExitCode'] == 137
            run(['docker', 'rm', container])
            shutil.rmtree(scratch)
            wait_for(lambda: any(any(value['state'] == 'REMOVED' for value in sample['containers'])
                                  and sample['scratch'].get('scratch-1', {}).get('state') == 'ABSENT'
                                  for sample in samples()))
            (control / 'stop').touch()
            report['collectorExitCode'] = collector.wait(timeout=10)
        summary = json.loads((output / 'resources/summary.json').read_text())
        observed = samples()
        ticks = [s['processes']['process-1']['cpuTicks'] for s in observed]
        report['cpuTicksObserved'] = max(ticks) - min(ticks)
        assert report['cpuTicksObserved'] > 50
        assert summary['status'] == 'COMPLETE' and report['collectorExitCode'] == 0
        assert summary['workloadResult'] == 'NOT_EVALUATED' and summary['modelRequests'] == 'NOT_MEASURED'
        assert summary['errors'] == []
        oom = [s for s in observed if any(c.get('oomKilled') for c in s['containers'])]
        assert oom and oom[0]['completedMonotonicNs'] < report['guardianAcknowledgedMonotonicNs']
        assert all(s['monotonicNs'] <= s['completedMonotonicNs'] for s in observed)
        report['sampleCount'] = len(observed)
        report['oomObservedBeforeAcknowledgement'] = True
        report['removalObserved'] = True
        report['scratchAbsentObserved'] = True
        report['status'] = 'PASSED'
    except Exception as error:
        report['status'] = 'FAILED'; report['error'] = type(error).__name__
        raise
    finally:
        (control / 'stop').touch(); (control / 'cpu-stop').touch()
        for process in [collector, burner]:
            if process and process.poll() is None:
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.terminate(); process.wait(timeout=5)
        try:
            if container and run(['docker', 'ps', '-aq', '--filter', 'name=^/' + name + '$']):
                actual = run(['docker', 'inspect', container, '--format', '{{.Name}}'])
                assert actual == '/' + name
                run(['docker', 'rm', '-f', container])
            if image_created:
                run(['docker', 'image', 'rm', tag])
            report['ownedContainerAbsent'] = not run(['docker', 'ps', '-aq', '--filter', 'name=^/' + name + '$'])
        except Exception as error:
            report['cleanupErrors'].append(type(error).__name__)
        if report['cleanupErrors']:
            report['status'] = 'FAILED'
        save()
        files = ['smoke.json', 'resources/summary.json', 'resources/samples.jsonl', 'resources/manifest.json', 'commands.jsonl']
        (output / 'manifest.json').write_bytes((json.dumps({'files': {p: hashlib.sha256((output / p).read_bytes()).hexdigest()
            for p in files if (output / p).exists()}}, indent=2) + '\n').encode())
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--sampler', type=Path, default=Path(__file__).with_name('resource-monitor.py'))
    args = parser.parse_args()
    result = verify(args.repo.resolve(), args.out.resolve(), args.sampler.resolve())
    print(json.dumps(result))
    raise SystemExit(0 if result['status'] == 'PASSED' else 1)
