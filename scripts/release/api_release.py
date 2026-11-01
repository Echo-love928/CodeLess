"""Offline operator API release builder/verifier. No model/user command interface."""
import argparse
import importlib.util
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
INPUTS = ('services/api/pom.xml', 'services/api/mvnw', 'services/api/mvnw.cmd',
          'services/api/.mvn', 'services/api/src/main', 'services/api/agent-runner.mjs',
          'services/runner/src', 'templates/vue', 'contracts/tools/registry.json',
          'contracts/plan', 'prompts/runtime', 'docs/generated-project-readme.md',
          'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
          'infra/build-image', 'infra/public', 'infra/preview', 'infra/hosting',
          'scripts/backup/backup.py', 'infra/backup', 'scripts/release',
          'infra/release/api', 'docs/operations.md', 'docs/release-notes.md')
CONTROL = {'release.json', 'SHA256SUMS'}


def require(ok, code):
    if not ok:
        raise ValueError(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()


def git(*args):
    r = subprocess.run(['git', '-c', 'safe.directory=' + ROOT.as_posix(), *args],
                       cwd=ROOT, capture_output=True, check=True)
    return r.stdout


def portable(name):
    p = PurePosixPath(name)
    require(bool(name) and str(p) == name and not p.is_absolute()
            and all(re.fullmatch(r'[A-Za-z0-9_.-]+', s) and s not in ('.', '..')
                    and not s.endswith('.') and not re.match(r'(?i)^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)', s)
                    for s in p.parts), 'RELEASE_PATH_REJECTED')
    require(not any(s.lower() in ('.git', 'node_modules', '.local-data', 'target', '.private')
                    or s.lower().startswith('.env') or s.lower().endswith(('.pem', '.key', '.p12', '.pfx'))
                    for s in p.parts), 'RELEASE_PRIVATE_PATH_REJECTED')
    return p


def safe(path):
    for p in (path, *path.parents):
        if p.exists() or p.is_symlink():
            st = p.lstat()
            require(not stat.S_ISLNK(st.st_mode) and not (getattr(st, 'st_file_attributes', 0) & 1024),
                    'RELEASE_LINK_REJECTED')
    if path.is_file():
        require(path.stat().st_nlink == 1, 'RELEASE_HARDLINK_REJECTED')


def inventory(directory):
    safe(directory)
    entries, aliases = [], set()
    for path in sorted(directory.rglob('*')):
        safe(path)
        name = path.relative_to(directory).as_posix()
        portable(name)
        require(name.lower() not in aliases, 'RELEASE_CASE_ALIAS')
        aliases.add(name.lower())
        if path.is_dir():
            continue
        require(path.is_file(), 'RELEASE_SPECIAL_FILE')
        if name in CONTROL:
            continue
        data = path.read_bytes()
        entries.append({'path': name, 'bytes': len(data), 'sha256': sha(data)})
    return entries


def checksums(entries, manifest):
    rows = [(e['path'], e['sha256']) for e in entries] + [('release.json', sha(manifest))]
    return ''.join(digest + '  ' + name + '\n' for name, digest in sorted(rows)).encode()


def verify(directory, expected):
    directory = Path(directory).absolute()
    safe(directory)
    require(re.fullmatch('[a-f0-9]{64}', expected or ''), 'TRUSTED_MANIFEST_SHA256_REQUIRED')
    manifest = (directory / 'release.json').read_bytes()
    require(sha(manifest) == expected, 'RELEASE_MANIFEST_MISMATCH')
    value = json.loads(manifest)
    require(value['schema'] == 'codeless-api-release-v1' and
            re.fullmatch('[a-f0-9]{40}', value['sourceCommit']), 'RELEASE_SCHEMA_REJECTED')
    actual = inventory(directory)
    require(actual == value['files'], 'RELEASE_FILES_MISMATCH')
    require((directory / 'SHA256SUMS').read_bytes() == checksums(actual, manifest), 'RELEASE_CHECKSUMS_MISMATCH')
    return value


def source_files(revision):
    require(re.fullmatch('[a-f0-9]{40}', revision or ''), 'FULL_COMMIT_REQUIRED')
    require(git('rev-parse', revision + '^{commit}').decode().strip() == revision, 'COMMIT_REQUIRED')
    lines = git('ls-tree', '-r', revision, '--', *INPUTS).decode().splitlines()
    require(bool(lines), 'EMPTY_SOURCE')
    result = []
    for line in lines:
        info, name = line.split('\t')
        mode, kind, blob = info.split()
        portable(name)
        require(kind == 'blob' and mode in ('100644', '100755'), 'SOURCE_LINK_REJECTED')
        result.append((name, blob, mode))
    return result


def build(revision, output, log):
    files = source_files(revision)
    output, log = Path(output).absolute(), Path(log).absolute()
    safe(output); safe(log)
    require(not output.exists() and not log.exists(), 'RELEASE_DESTINATION_EXISTS')
    require(not log.is_relative_to(output), 'BUILD_LOG_MUST_BE_OUTSIDE_PACKAGE')
    jdk = Path(os.environ.get('JAVA_HOME', ''))
    java = jdk / 'bin' / ('java.exe' if os.name == 'nt' else 'java')
    r = subprocess.run([str(java), '-version'], capture_output=True)
    require(r.returncode == 0 and re.search(rb'version "21\.', r.stdout + r.stderr), 'JAVA21_REQUIRED')
    output.mkdir(parents=True)
    repo = output / 'repository'
    request = ''.join(blob + '\n' for _, blob, _ in files).encode()
    blobs = git('cat-file', '--batch') if not request else subprocess.run(
        ['git', '-c', 'safe.directory=' + ROOT.as_posix(), 'cat-file', '--batch'],
        cwd=ROOT, input=request, capture_output=True, check=True).stdout
    position = 0
    provenance = []
    for name, blob, mode in files:
        end = blobs.index(b'\n', position)
        header = blobs[position:end].split()
        require(header[0].decode() == blob and header[1] == b'blob', 'GIT_BLOB_MISMATCH')
        size = int(header[2]); data = blobs[end + 1:end + 1 + size]; position = end + 2 + size
        path = repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        if mode == '100755': path.chmod(0o755)
        provenance.append({'path': 'repository/' + name, 'gitBlob': blob, 'sha256': sha(data)})
    # Build output goes outside the immutable package; no target/classes from the checkout.
    work = output.parent.parent / (output.name + '-build-' + revision[:12])
    require(not work.exists(), 'BUILD_DIRECTORY_EXISTS')
    shutil.copytree(repo, work)
    wrapper = work / 'services/api' / ('mvnw.cmd' if os.name == 'nt' else 'mvnw')
    command = ([os.environ.get('COMSPEC', 'cmd.exe'), '/d', '/c', str(wrapper)] if os.name == 'nt' else [str(wrapper)])
    command += ['-B', '-f', str(work / 'services/api/pom.xml'), '-DskipTests', 'package']
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open('xb') as stream:
        result = subprocess.run(command, cwd=work, stdout=stream, stderr=subprocess.STDOUT)
    require(result.returncode == 0, 'API_PACKAGE_BUILD_FAILED')
    jar = work / 'services/api/target/codeless-api-0.0.0-SNAPSHOT.jar'
    with zipfile.ZipFile(jar) as archive:
        require('BOOT-INF/classes/dev/codeless/api/CodeLessApiApplication.class' in archive.namelist(), 'API_MAIN_MISSING')
        require(not any('/test-classes/' in n or n.startswith('BOOT-INF/classes/d20/') for n in archive.namelist()), 'FIXTURE_IN_JAR')
    shutil.copyfile(jar, output / 'api.jar')
    # Maven must not have changed the committed input bytes.
    require(all(sha((work / e['path'].removeprefix('repository/')).read_bytes()) == e['sha256'] for e in provenance), 'BUILD_CHANGED_INPUT')
    entries = inventory(output)
    value = {'schema': 'codeless-api-release-v1', 'sourceCommit': revision,
             'component': 'api', 'status': 'CANDIDATE_HOLD', 'files': entries, 'sourceFiles': provenance,
             'build': {'command': ['mvnw', '-B', '-f', 'services/api/pom.xml', '-DskipTests', 'package'],
                       'exitCode': result.returncode, 'logSha256': sha(log.read_bytes()),
                       'javaVersion': (r.stdout + r.stderr).decode().strip(), 'tests': 'NOT_RUN_BY_PACKAGE_BUILD'},
             'toolchain': {'java': '21', 'maven': '3.9.11', 'springBoot': '4.1.1', 'springAi': '2.0.1',
                           'node': '24.22.1', 'pnpm': '12.6.0', 'postgres': '17.6'},
             'clientBundle': 'NOT_INCLUDED_D27_B_REQUIRED', 'activation': 'NOT_AUTHORIZED_BY_BUILD'}
    manifest = canonical(value)
    (output / 'release.json').write_bytes(manifest)
    (output / 'SHA256SUMS').write_bytes(checksums(entries, manifest))
    verify(output, sha(manifest))
    return {'sourceCommit': revision, 'manifestSha256': sha(manifest), 'apiJarSha256': sha(jar.read_bytes()),
            'fileCount': len(entries), 'status': value['status']}


def verify_backup(directory, expected):
    """Read-only binding. D23 verifies *all* DB/source/hosting assets before the API subset."""
    spec = importlib.util.spec_from_file_location('codeless_backup', ROOT / 'scripts/backup/backup.py')
    backup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backup)
    directory = Path(directory).absolute()
    saved = backup.verify(directory)
    release = verify(directory / 'data/release/api', expected)
    return {'status': 'BACKUP_BOUND_OFFLINE', 'backupId': saved['id'],
            'backupManifestSha256': sha((directory / 'manifest.json').read_bytes()),
            'sourceCommit': release['sourceCommit'], 'apiManifestSha256': expected,
            'applicationAcceptance': 'NOT_RUN', 'activation': 'NOT_AUTHORIZED'}


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='action', required=True)
    b = sub.add_parser('build')
    b.add_argument('--revision', required=True); b.add_argument('--output', required=True); b.add_argument('--log', required=True)
    v = sub.add_parser('verify')
    v.add_argument('--package', required=True); v.add_argument('--manifest-sha256', required=True)
    backup = sub.add_parser('verify-backup')
    backup.add_argument('--backup', required=True); backup.add_argument('--manifest-sha256', required=True)
    args = parser.parse_args()
    try:
        if args.action == 'build': result = build(args.revision, args.output, args.log)
        elif args.action == 'verify-backup': result = verify_backup(args.backup, args.manifest_sha256)
        else: result = verify(args.package, args.manifest_sha256)
        print(json.dumps({'status': 'VERIFIED', 'sourceCommit': result['sourceCommit']} if args.action == 'verify' else result))
    except (ValueError, OSError, KeyError, subprocess.SubprocessError, zipfile.BadZipFile) as error:
        # Logs can contain private paths; never echo subprocess output or credential data.
        print(json.dumps({'status': 'FAILED', 'code': str(error) if isinstance(error, ValueError) else type(error).__name__}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
