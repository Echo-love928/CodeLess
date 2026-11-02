"""D28-A native command receipts. Does not retry, edit tests, or select a green run.

Run on a fresh fixed-commit worktree; public receipts contain bounded projections,
while full command output and JUnit stay in the ignored private directory.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'tests/release/api'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def git(work, *args):
    return subprocess.check_output(['git', '-c', 'safe.directory=' + work.as_posix(), *args], cwd=work)


def snapshot(work):
    names = git(work, 'ls-files', '-z').decode().split('\0')
    return {name: sha((work / name).read_bytes()) if (work / name).is_file() else None
            for name in names if name}


def digest_manifest(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':')).encode())


def java21_home(env, explicit=None):
    executable = 'java.exe' if os.name == 'nt' else 'java'
    from_path = shutil.which('java', path=next((v for k, v in env.items() if k.lower() == 'path'), ''))
    candidates = [explicit] if explicit else [env.get('JAVA_HOME_21_X64'), env.get('JAVA_HOME'),
                                              str(Path(from_path).resolve().parent.parent) if from_path else None]
    for home in dict.fromkeys(p for p in candidates if p):
        binary = Path(home) / 'bin' / executable
        if not binary.is_file():
            continue
        result = subprocess.run([str(binary), '-version'], capture_output=True, timeout=5)
        if result.returncode == 0 and re.search(r'version\s+"21\.', (result.stdout + result.stderr).decode(errors='replace')):
            return Path(home).resolve()
    raise RuntimeError('Java21 required: pass --java-home or configure JAVA_HOME_21_X64/JAVA_HOME/PATH')


def clean_environment(work, explicit_java=None, bin_dir=None):
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(
        ('CODELESS_', 'SPRING_', 'NODE_OPTIONS', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', 'GIT_CONFIG_'))}
    jdk = java21_home(env, explicit_java)
    env['JAVA_HOME'] = str(jdk)
    path_key = next((k for k in env if k.lower() == 'path'), 'PATH')
    shim = Path(bin_dir) if bin_dir else work / '.local-data/d28-tools/bin'
    shim.mkdir(parents=True, exist_ok=True)
    (shim / ('pnpm.cmd' if os.name == 'nt' else 'pnpm')).write_text(
        '@echo off\ncall corepack pnpm %*\nexit /b %ERRORLEVEL%\n' if os.name == 'nt'
        else '#!/bin/sh\nexec corepack pnpm "$@"\n', encoding='utf-8')
    if os.name != 'nt':
        (shim / 'pnpm').chmod(0o755)
    env[path_key] = str(shim) + os.pathsep + str(jdk / 'bin') + os.pathsep + env.get(path_key, '')
    env.update(CI='true', CODELESS_MODEL_PROVIDER='deterministic-mock', NO_PROXY='127.0.0.1,localhost,::1',
               no_proxy='127.0.0.1,localhost,::1', GIT_CONFIG_COUNT='1',
               GIT_CONFIG_KEY_0='safe.directory', GIT_CONFIG_VALUE_0=work.as_posix())
    return env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('gate', 'api', 'e2e', 'release-unit', 'peer-unit', 'candidate-build', 'candidate-live', 'candidate-checksum'))
    parser.add_argument('--worktree', required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--package')
    parser.add_argument('--manifest-sha256')
    parser.add_argument('--java-home', help='Existing Java21 installation; validated before any command')
    args = parser.parse_args()
    work = Path(args.worktree).resolve()
    if not work.is_relative_to(ROOT / '.local-data/d28-a'):
        raise RuntimeError('Require task-owned D28 worktree')
    head = git(work, 'rev-parse', 'HEAD').decode().strip()
    if head != args.candidate:
        raise RuntimeError('Candidate HEAD mismatch')
    if git(work, 'status', '--porcelain', '--untracked-files=no').strip():
        raise RuntimeError('Require clean tracked candidate inputs')
    stamp = now().replace(':', '-') + '-' + args.mode
    private = BASE / '.private/d28' / stamp
    public = BASE / 'evidence/d28' / stamp
    private.mkdir(parents=True)
    public.mkdir(parents=True)
    shutil.copyfile(Path(__file__), private / 'recorder.py')
    before = snapshot(work)
    (private / 'inputs.json').write_text(json.dumps(before, indent=2), encoding='utf-8')
    report = {'task': 'D28-A', 'mode': args.mode, 'candidate': head, 'cwd': work.relative_to(ROOT).as_posix(),
              'startedAt': now(), 'status': 'RUNNING', 'exitCode': None,
              'trackedFiles': len(before), 'inputsSha256': digest_manifest(before),
              'recorderSha256': sha(Path(__file__).read_bytes()), 'commands': [],
              'modelProvider': 'deterministic-mock', 'paidModelRequests': 0,
              'runtimeMockTokens': None, 'realModelQuality': 'NOT_EVALUATED'}
    def save():
        (public / 'command.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    save()
    print(json.dumps({'evidence': public.relative_to(ROOT).as_posix(), 'status': 'RUNNING'}), flush=True)
    env = None
    corepack = [os.environ.get('COMSPEC', 'cmd.exe'), '/d', '/c', 'corepack'] if os.name == 'nt' else ['corepack']
    screenshots = {p: (work / p).read_bytes() for p in before if p.endswith('.png')}
    def run(label, command):
        started = now()
        log_path = private / (label + '.log')
        with log_path.open('xb') as log:
            result = subprocess.run(command, cwd=work, env=env, stdout=log, stderr=subprocess.STDOUT)
        raw = log_path.read_bytes()
        report['commands'].append({'operation': label, 'command': command, 'startedAt': started,
                                   'finishedAt': now(), 'exitCode': result.returncode,
                                   'privateLog': log_path.relative_to(ROOT).as_posix(),
                                   'logSha256': sha(raw), 'logBytes': len(raw)})
        save()
        print(json.dumps({'operation': label, 'exitCode': result.returncode}), flush=True)
        return result.returncode, raw
    try:
        env = clean_environment(work, args.java_home, private / 'bin')
        report['javaHome'] = env['JAVA_HOME']
        if args.mode in ('gate', 'peer-unit', 'api', 'e2e'):
            code, _ = run('install', [*corepack, 'pnpm', 'install', '--offline', '--frozen-lockfile'])
        else:
            code = 0
        if code == 0:
            if args.mode == 'gate':
                env['D26_STAGE_EXITS'] = str(private / 'stages.jsonl')
                observer = work / 'tests/regression/release-api/stage-observer.mjs'
                report['stageObserverSha256'] = sha(observer.read_bytes())
                code, raw = run('gate', ['node', '--import', observer.as_uri(), 'scripts/ci-gate.mjs'])
                report['stages'] = [json.loads(line) for line in (private / 'stages.jsonl').read_text().splitlines()] if (private / 'stages.jsonl').exists() else []
                report['summaries'] = [line for line in raw.decode(errors='replace').splitlines()
                    if any(word in line for word in ('Tests run:', 'BUILD SUCCESS', 'BUILD FAILURE', '[ci-gate]', ' passed (', '# tests ', '# pass ', '# fail ', '# cancelled ', '# skipped ', '# todo ', '[full-product]'))]
                report['junit'] = []
                for path in sorted((work / 'services/api/target/surefire-reports').glob('TEST-*.xml')):
                    if path.stat().st_mtime < datetime.fromisoformat(report['startedAt']).timestamp():
                        continue
                    attrs = ET.fromstring(path.read_bytes()).attrib
                    saved = private / 'junit' / path.name
                    saved.parent.mkdir(exist_ok=True)
                    shutil.copyfile(path, saved)
                    report['junit'].append({**{k: attrs.get(k) for k in ('name', 'tests', 'failures', 'errors', 'skipped')},
                                            'sha256': sha(saved.read_bytes()), 'privateReport': saved.relative_to(ROOT).as_posix()})
            elif args.mode in ('api', 'e2e'):
                code, raw = run(args.mode, [*corepack, 'pnpm', 'run', 'verify:' + args.mode])
            elif args.mode == 'release-unit':
                code, raw = run('release-unit', [sys.executable, '-B', 'tests/release/api/test_release.py'])
                (public / 'unit.log').write_bytes(raw)
            elif args.mode == 'peer-unit':
                code, raw = run('peer-unit', ['node', '--test', 'tests/release/browser/package.test.mjs'])
                (public / 'unit.log').write_bytes(raw)
            elif args.mode == 'candidate-build':
                command = [sys.executable, '-B', 'scripts/release/api_release.py', 'build', '--revision', head,
                           '--output', str(private / 'release/api'), '--log', str(private / 'build.log')]
                code, raw = run(args.mode, command)
                if code == 0:
                    report['artifact'] = {**json.loads(raw), 'package': (private / 'release/api').relative_to(ROOT).as_posix()}
                    for name in ('release.json', 'SHA256SUMS'):
                        shutil.copyfile(private / 'release/api' / name, public / name)
            else:
                package = Path(args.package).resolve() if args.package else None
                if package is None or not package.is_relative_to(BASE / '.private/d28') or not args.manifest_sha256:
                    raise RuntimeError('Require D28 sealed package and external manifest digest')
                manifest = json.loads((package / 'release.json').read_text(encoding='utf-8'))
                if manifest['sourceCommit'] != head:
                    raise RuntimeError('Sealed package does not match candidate')
                report['sealedSourceCommit'] = head
                report['sealedManifestSha256'] = args.manifest_sha256
                if args.mode == 'candidate-checksum':
                    command = [sys.executable, '-B', 'scripts/release/api_release.py', 'verify', '--package', str(package), '--manifest-sha256', args.manifest_sha256]
                else:
                    command = [sys.executable, '-B', str(BASE / 'live.py'), '--package', str(package), '--manifest-sha256', args.manifest_sha256, '--output', str(private / 'live')]
                code, raw = run(args.mode, command)
                if args.mode == 'candidate-checksum':
                    (public / 'verify.log').write_bytes(raw)
                    if code == 0:
                        targets = ['services/runner/src/preview/main.mjs', 'services/runner/src/verify/workflow.mjs',
                                   'services/runner/src/publish/frozen-gateway.mjs', 'services/runner/src/screenshot/capture.mjs']
                        for index, target in enumerate(targets):
                            command = ['node', '--input-type=module', '-e',
                                       "import {pathToFileURL} from 'node:url'; const target=process.argv[1]; process.argv[1]=''; await import(pathToFileURL(target));",
                                       str(package / 'repository' / target)]
                            code, _ = run('runtime-import-' + str(index + 1), command)
                            if code != 0:
                                break
                if (private / 'live/result.json').exists():
                    shutil.copyfile(private / 'live/result.json', public / 'result.json')
        report['exitCode'] = code
    except Exception as error:
        report['recorderError'] = type(error).__name__
        # No fabricated child exit code when orchestration fails.
        raise
    finally:
        report['generatedScreenshotsPreserved'] = []
        for name, data in screenshots.items():
            path = work / name
            if not path.exists() or path.read_bytes() != data:
                saved = private / 'screenshots-after' / name
                saved.parent.mkdir(parents=True, exist_ok=True)
                if path.exists():
                    saved.write_bytes(path.read_bytes())
                path.write_bytes(data)
                report['generatedScreenshotsPreserved'].append(name)
        after = snapshot(work)
        report.update(finishedAt=now(), sourceBytesUnchanged=after == before,
                      headUnchanged=git(work, 'rev-parse', 'HEAD').decode().strip() == head,
                      changedTrackedFiles=[p for p in before if before[p] != after[p]])
        report['status'] = 'PASSED' if report['exitCode'] == 0 and report['sourceBytesUnchanged'] and report['headUnchanged'] else 'FAILED'
        save()
    print(json.dumps({'evidence': public.relative_to(ROOT).as_posix(), 'status': report['status'], 'exitCode': report['exitCode']}))
    return report['exitCode'] if report['exitCode'] else (0 if report['status'] == 'PASSED' else 1)


if __name__ == '__main__':
    sys.exit(main())
