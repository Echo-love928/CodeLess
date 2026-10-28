"""Storage half of the real application recovery fixture (never a production bypass).

The Windows/loopback integration fixture owns its API/preview processes and checks
their closed listening ports. Production CLI retains its Linux/systemd supervisor.
All fixture moves/copies are confined to tests/backup/.private/application/<run>.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'tests/backup/.private/application'
spec = importlib.util.spec_from_file_location('codeless_backup', ROOT / 'scripts/backup/backup.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


def confined(path, job):
    path = Path(os.path.abspath(path))
    b.require(path != job and path.is_relative_to(job), 'FIXTURE_PATH_ESCAPE')
    for p in (path, *path.parents):
        if p.exists():
            b.safe(p)
    return path


class ClosedOwnedProcesses:
    def __init__(self, state):
        self.state = state

    def check(self):
        b.require(self.state['sourceStopped'] is True, 'FIXTURE_SOURCE_NOT_STOPPED')
        for port in self.state['quiescedPorts']:
            with socket.socket() as client:
                client.settimeout(1)
                b.require(client.connect_ex(('127.0.0.1', port)) != 0, 'FIXTURE_WRITER_PORT_OPEN')


def prepare_release(state, job):
    """Use Git blob bytes, not autocrlf checkout bytes, for a fixed LF release."""
    release = confined(state['roots']['release'], job)
    repository = release / 'repository'
    repository.mkdir(parents=True)
    git = ['git', '-c', 'safe.directory=' + ROOT.as_posix()]
    revision = state['runtimeRevision']
    includes = ['templates/vue', 'services/runner', 'services/api/agent-runner.mjs',
                'services/api/src/main/resources/network', 'infra',
                'contracts', 'prompts', 'docs/generated-project-readme.md', 'package.json',
                'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tests/e2e/full/hosting-cli.mjs']
    names = subprocess.run(git + ['ls-tree', '-r', '--name-only', revision, '--', *includes],
                           cwd=ROOT, capture_output=True, check=True).stdout.decode().splitlines()
    request = ''.join(revision + ':' + name + '\n' for name in names).encode()
    blobs = subprocess.run(git + ['cat-file', '--batch'], input=request, cwd=ROOT,
                           capture_output=True, check=True).stdout
    position = 0
    for name in names:
        end = blobs.index(b'\n', position)
        header = blobs[position:end].split()
        b.require(header[1] == b'blob', 'FIXTURE_NOT_BLOB')
        length = int(header[2])
        data = blobs[end + 1:end + 1 + length]
        position = end + 2 + length
        target = confined(repository / name, job)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    # Resolve the real preview import graph before starting any writer; in
    # particular runner shares API's network/site-policy.json outside runner/.
    preflight = subprocess.run(['node', '--input-type=module', '-e',
                    "import {pathToFileURL} from 'node:url'; const target=process.argv[1]; process.argv[1]=''; await import(pathToFileURL(target));",
                    str(repository / 'services/runner/src/preview/main.mjs')],
                   cwd=ROOT, capture_output=True, check=False, timeout=30)
    (job / 'release-import-preflight.log').write_bytes(preflight.stdout + preflight.stderr)
    b.require(preflight.returncode == 0, 'FIXTURE_PREVIEW_IMPORT_FAILED')
    shutil.copy2(ROOT / 'services/api/target/codeless-api-0.0.0-SNAPSHOT.jar', release / 'api.jar')
    shutil.copytree(ROOT / '.local-data/d20-b/compiled/d20', release / 'fixture-classes/d20')
    return {'status': 'FIXED_RELEASE_PREPARED', 'revision': revision, 'repositoryFiles': len(names),
            'apiJarSha256': b.digest(release / 'api.jar')}


def main():
    os.umask(0o077)
    action, state_file = sys.argv[1:]
    state_file = Path(state_file).absolute()
    job = state_file.parent
    b.require(job.is_relative_to(BASE.absolute()) and job != BASE.absolute(), 'FIXTURE_JOB_ESCAPE')
    b.safe(job, True)
    state = json.loads(state_file.read_text(encoding='utf-8'))
    roots = {name: confined(path, job) for name, path in state['roots'].items()}
    config = {'database': state.get('sourceDatabase'), 'roots': roots, 'reserveBytes': 64 * 1024 * 1024}
    backup = job / 'backup'
    guard = ClosedOwnedProcesses(state)
    if action == 'prepare-release':
        result = prepare_release(state, job)
    elif action == 'seal-release':
        b.write_json(roots['release'] / 'release.json', {
            'revision': state['runtimeRevision'], 'apiJarSha256': b.digest(roots['release'] / 'api.jar'),
            'toolchain': {'node': '24.22.1', 'pnpm': '12.6.0', 'javaMajor': 21},
            'imageId': state['imageId'], 'repository': b.scan(roots['release'] / 'repository'),
            'web': b.scan(roots['release'] / 'web'), 'sourceComposition': 'D20 deterministic-mock + local HTTPS fixture',
            'restoreComposition': 'production API main; no task/deploy/sweep workers'})
        result = {'status': 'FIXED_RELEASE_SEALED', 'apiJarSha256': b.digest(roots['release'] / 'api.jar')}
    elif action == 'backup':
        result = b.backup(config, backup, guard)
    elif action == 'quarantine':
        guard.check()
        quarantine = job / 'source-quarantine'
        quarantine.mkdir()
        identities = {}
        for name, path in roots.items():
            source = confined(path, job)
            target = confined(quarantine / name, job)
            b.require(source.exists() and not target.exists(), 'FIXTURE_MOVE_TARGET_INVALID')
            identities[name] = source.stat().st_ino
            source.rename(target)
            b.require(not source.exists(), 'FIXTURE_SOURCE_STILL_PRESENT')
        b.write_json(job / 'source-root-identities.json', identities)
        result = {'status': 'SOURCE_ROOTS_QUARANTINED', 'roots': len(identities)}
    elif action == 'restore':
        b.require(all(not path.exists() for path in roots.values()), 'FIXTURE_SOURCE_ROOTS_PRESENT')
        result = b.restore(state['targetDatabase'], backup, job / 'restored-staging', config['reserveBytes'], guard)
    elif action == 'activate':
        guard.check()
        manifest = b.verify(backup)
        original = json.loads((job / 'source-root-identities.json').read_text())
        for name, path in roots.items():
            b.require(not path.exists(), 'FIXTURE_ACTIVATION_TARGET_EXISTS')
            source = confined(job / 'restored-staging' / name, job)
            shutil.copytree(source, path, copy_function=shutil.copy2)
            b.require(path.stat().st_ino != original[name], 'FIXTURE_REUSED_SOURCE_DIRECTORY')
        config['database'] = state['targetDatabase']
        result = b.check_restored(config, backup, guard)
        b.require({k: str(v) for k, v in roots.items()} == manifest['sourceRoots'], 'FIXTURE_PATH_BINDING_CHANGED')
    elif action == 'negative':
        config['database'] = state['targetDatabase']
        version = state['binding']['versionId']
        original = confined(roots['agent'] / 'versions' / version / 'outcome/artifact/index.html', job)
        hidden = confined(original.with_name('missing-index.canary'), job)
        b.require(original.exists() and not hidden.exists(), 'FIXTURE_CANARY_TARGET_INVALID')
        original.rename(hidden)
        try:
            try:
                b.check_restored(config, backup, guard)
                raise b.Failure('FIXTURE_MISSING_ARTIFACT_ACCEPTED')
            except b.Failure as error:
                b.require(str(error) == 'RESTORE_FILES_MISMATCH', 'FIXTURE_WRONG_CANARY_FAILURE')
        finally:
            hidden.rename(original)
        b.check_restored(config, backup, guard)
        result = {'status': 'NEGATIVE_CONTROL_PASSED', 'rejection': 'RESTORE_FILES_MISMATCH',
                  'restoredOriginalBytes': True}
    elif action == 'compare':
        manifest = b.verify(backup)
        expected = json.loads((backup / 'references.json').read_text(encoding='utf-8'))
        pg = b.Pg(state['targetDatabase'])
        b.require(pg.inventory() == expected, 'FIXTURE_POST_BROWSER_REFERENCES_CHANGED')
        b.require(b.roots_inventory(config) == manifest['roots'], 'FIXTURE_RESTORED_BYTES_CHANGED')
        b.require(pg.sql(b.IDENTITY_SQL).split(':')[0] != manifest['sourceDatabaseIdentity'].split(':')[0], 'FIXTURE_CLUSTER_REUSED')
        result = {'status': 'RESTORED_REFERENCES_AND_FILES_UNCHANGED', 'referenceTables': list(b.TABLES)}
    else:
        raise b.Failure('FIXTURE_ACTION_INVALID')
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'FAILED', 'code': str(error) if isinstance(error, b.Failure)
                          else type(error).__name__}), file=sys.stderr)
        sys.exit(1)
