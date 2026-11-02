"""One original full Windows API run with an owned, bounded file-metadata ETW trace.

No production instrumentation, retries, test selection, timeout or assertion changes.
Stops only its uniquely named trace; never stops another recording. ETL stays private.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import uuid
import xml.etree.ElementTree as ET
from d28_record import ROOT, clean_environment, git, snapshot, digest_manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worktree', required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--java-home', required=True)
    parser.add_argument('--external-trace', action='store_true', help='User-authorized admin controller owns ETW')
    args = parser.parse_args()
    work = Path(args.worktree).resolve()
    if os.name != 'nt' or not work.is_relative_to(ROOT / '.local-data/d28-a'):
        raise RuntimeError('Require original Windows host and owned worktree')
    if git(work, 'rev-parse', 'HEAD').decode().strip() != args.candidate or git(work, 'status', '--porcelain', '--untracked-files=no').strip():
        raise RuntimeError('Require exact clean candidate')
    stamp = datetime.now(timezone.utc).isoformat().replace(':', '-') + '-windows-api'
    private = ROOT / 'tests/release/api/.private/d28-fix' / stamp
    public = ROOT / 'tests/release/api/evidence/d28-fix' / stamp
    private.mkdir(parents=True)
    public.mkdir(parents=True)
    source = snapshot(work)
    (private / 'source-inputs.json').write_text(json.dumps(source, indent=2), encoding='utf-8')
    env = clean_environment(work, args.java_home, private / 'bin')
    prefix = [os.environ.get('COMSPEC', 'cmd.exe'), '/d', '/c', 'corepack', 'pnpm']
    report = {'task': 'D28-A-fix', 'candidate': args.candidate, 'status': 'RUNNING', 'exitCode': None,
              'startedAt': datetime.now(timezone.utc).isoformat(), 'sourceInputsSha256': digest_manifest(source),
              'commands': [], 'trace': {}, 'junit': [], 'paidModelRequests': 0, 'modelProvider': 'deterministic-mock'}
    def save():
        (public / 'command.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    def run(label, command):
        log = private / (label + '.log')
        with log.open('xb') as output:
            result = subprocess.run(command, cwd=work, env=env, stdout=output, stderr=subprocess.STDOUT)
        data = log.read_bytes()
        report['commands'].append({'operation': label, 'command': command, 'exitCode': result.returncode,
                                   'privateLog': log.relative_to(ROOT).as_posix(), 'logSha256': hashlib.sha256(data).hexdigest()})
        save()
        return result.returncode
    save()
    (ROOT / 'tests/release/api/.private/d28-fix/windows-current.json').write_text(json.dumps({
        'report': str(public / 'command.json'), 'pid': os.getpid(), 'startedAt': report['startedAt']}), encoding='utf-8')
    print(json.dumps({'evidence': public.relative_to(ROOT).as_posix(), 'status': 'RUNNING'}), flush=True)
    if run('docker-preflight', ['docker', 'version', '--format', '{{.Server.Version}}']) != 0:
        report.update(status='BLOCKED_DOCKER_NOT_READY', exitCode=1)
        save()
        return 1
    install = run('install', [*prefix, 'install', '--offline', '--frozen-lockfile'])
    if install != 0:
        report.update(status='FAILED', exitCode=install)
        save()
        return install
    session = 'CodeLess-D28-' + uuid.uuid4().hex[:16]
    trace_path = private / 'file-metadata.etl'
    started = False if args.external_trace else run('trace-start', ['logman', 'create', 'trace', session, '-p', 'Microsoft-Windows-Kernel-File',
                                 '0x18f0', '4', '-o', str(trace_path), '-f', 'bincirc', '-max', '128', '-bs', '64', '-nb', '16', '64', '-ets']) == 0
    report['trace'] = {'session': session, 'started': started, 'privateFile': trace_path.relative_to(ROOT).as_posix(),
                       'maximumMiB': 128, 'fileContentsCaptured': False, 'externalAdminController': args.external_trace,
                       'source': 'Microsoft-Windows-Kernel-File metadata; no driver installed'}
    bare = work / 'services/api/target/round-five-evidence/D24-A-r5-BARE.json'
    screenshots = {p: (work / p).read_bytes() for p in source if p.endswith('.png')}
    command = [*prefix, 'verify:api']
    log = private / 'api.log'
    try:
        with log.open('xb') as output:
            process = subprocess.Popen(command, cwd=work, env=env, stdout=output, stderr=subprocess.STDOUT)
            while process.poll() is None:
                if started and bare.exists():
                    try:
                        result = json.loads(bare.read_text(encoding='utf-8'))
                    except (ValueError, OSError):
                        result = None
                    if result is not None:
                        report['trace']['bareObserved'] = {k: result.get(k) for k in ('status', 'failureCode', 'repairAttempts', 'runs')}
                        run('trace-stop', ['logman', 'stop', session, '-ets'])
                        started = False
                        report['trace']['stopReason'] = 'BARE report retained; freeze surrounding metadata, original API continues'
                        save()
                time.sleep(0.5)
            report['exitCode'] = process.returncode
    finally:
        if started:
            report['trace']['stopExitCode'] = run('trace-stop', ['logman', 'stop', session, '-ets'])
        if trace_path.exists():
            report['trace'].update(bytes=trace_path.stat().st_size, sha256=hashlib.sha256(trace_path.read_bytes()).hexdigest())
        data = log.read_bytes() if log.exists() else b''
        report['commands'].append({'operation': 'api', 'command': command, 'exitCode': report['exitCode'],
                                   'privateLog': log.relative_to(ROOT).as_posix(), 'logSha256': hashlib.sha256(data).hexdigest()})
        for path in sorted((work / 'services/api/target/surefire-reports').glob('TEST-*.xml')):
            if path.stat().st_mtime < datetime.fromisoformat(report['startedAt']).timestamp():
                continue
            target = private / 'junit' / path.name
            target.parent.mkdir(exist_ok=True)
            shutil.copyfile(path, target)
            attributes = ET.fromstring(path.read_bytes()).attrib
            report['junit'].append({**{k: attributes.get(k) for k in ('name', 'tests', 'failures', 'errors', 'skipped')},
                                    'privateReport': target.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
        for path, original in screenshots.items():
            current = work / path
            if current.exists() and current.read_bytes() != original:
                target = private / 'screenshots-after' / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(current.read_bytes())
                current.write_bytes(original)
        report.update(sourceBytesUnchanged=snapshot(work) == source,
                      headUnchanged=git(work, 'rev-parse', 'HEAD').decode().strip() == args.candidate,
                      finishedAt=datetime.now(timezone.utc).isoformat())
        report['status'] = 'PASSED_NO_ROOT_CAUSE_CLOSURE' if report['exitCode'] == 0 and report['sourceBytesUnchanged'] and report['headUnchanged'] else 'FAILED'
        save()
    print(json.dumps({'status': report['status'], 'exitCode': report['exitCode'], 'evidence': public.relative_to(ROOT).as_posix()}))
    return report['exitCode'] if report['exitCode'] else (0 if report['sourceBytesUnchanged'] and report['headUnchanged'] else 1)


if __name__ == '__main__':
    sys.exit(main())
