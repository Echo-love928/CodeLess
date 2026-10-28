"""Real PG 17 dump/restore in two isolated containers. Fail, never skip, without Docker.

This checks D23-A-T1 plus restored file bytes; it does not claim authenticated
version preview/source export (T4). No production services or volumes are touched.
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('backup', ROOT / 'scripts/backup/backup.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
IMAGE = 'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94'


def docker(*args):
    r = subprocess.run(['docker', *args], capture_output=True, timeout=180, check=False)
    b.require(r.returncode == 0, 'DOCKER_UNAVAILABLE_OR_COMMAND_FAILED')
    return r.stdout.decode().strip()


class ExclusiveFixture:
    """Only in this import-based test: no API/worker exists; containers network=none."""
    def check(self):
        for name in names:
            b.require(docker('inspect', '--format', '{{.HostConfig.NetworkMode}}', name) == 'none', 'FIXTURE_NETWORK_NOT_ISOLATED')


names = ['codeless-d23-' + str(uuid.uuid4()) for _ in range(2)]
created = []
error = None
try:
    docker('info', '--format', '{{.ServerVersion}}')
    with tempfile.TemporaryDirectory(prefix='codeless-d23-live-') as temp:
        home = Path(temp)
        for name in names:
            docker('run', '-d', '--network', 'none', '--name', name,
                   '--label', 'codeless.d23-fixture=true', '--memory', '384m', '--cpus', '0.5',
                   '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', IMAGE)
            created.append(name)
        source, target = [b.Pg({'container': name, 'database': 'postgres', 'user': 'postgres'}) for name in names]
        for pg in (source, target):
            deadline = time.monotonic() + 60
            while True:
                try:
                    b.require(pg.sql('SELECT 1') == '1', 'PG_NOT_READY')
                    break
                except b.Failure:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.5)
        for migration in sorted((ROOT / 'services/api/src/main/resources/db/migration').glob('V*.sql')):
            with migration.open('rb') as src:
                source.run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', '-'], stdin=src)
        user, app, task, version, build, publication = [str(uuid.uuid4()) for _ in range(6)]
        sql = f"""
INSERT INTO platform_users(id,email,display_name,status) VALUES ('{user}','fixture@example.test','Backup fixture','ACTIVE');
INSERT INTO applications(id,owner_id,name,template,data_mode,status) VALUES ('{app}','{user}','Backup fixture','VUE','MOCK','ACTIVE');
INSERT INTO generation_tasks(id,application_id,prompt,status) VALUES ('{task}','{app}','Explicit backup fixture','PLAN');
INSERT INTO application_versions(id,application_id,number,source_digest,status,source_task_id)
 VALUES ('{version}','{app}',1,'sha256:'||repeat('a',64),'DRAFT','{task}');
INSERT INTO builds(id,task_id,version_id,status,exit_code,artifact_digest,completed_at)
 VALUES ('{build}','{task}','{version}','SUCCEEDED',0,'sha256:'||repeat('b',64),now());
UPDATE application_versions SET status='VERIFIED',build_id='{build}' WHERE id='{version}';
UPDATE applications SET latest_ready_version_id='{version}' WHERE id='{app}';
INSERT INTO publications(id,application_id,version_id,requested_by,status,url,published_at)
 VALUES ('{publication}','{app}','{version}','{user}','PUBLISHED','https://fixture.example.test/',now());
"""
        source.sql(sql)
        roots = {name: home / name for name in b.REQUIRED}
        for name, path in roots.items():
            path.mkdir()
            (path / 'fixture.txt').write_text('D23 immutable fixture: ' + name, encoding='utf-8')
        config = {'database': source.database, 'roots': roots, 'reserveBytes': 64 * 1024 * 1024}
        guard = ExclusiveFixture()
        saved = b.backup(config, home / 'backup', guard)
        result = b.restore(target.database, home / 'backup', home / 'restored', config['reserveBytes'], guard)
        b.require(source.inventory() == target.inventory(), 'REFERENCE_ASSERTION_FAILED')
        b.require(all(b.scan(path) == b.scan(home / 'restored' / name) for name, path in roots.items()), 'FILE_ASSERTION_FAILED')
        print(json.dumps({'status': 'PG_RESTORE_AND_FILES_PASSED', 'backupId': saved['backupId'],
                          'image': IMAGE, 'applicationAcceptance': result['applicationAcceptance'],
                          'D23-A-T1': 'PASSED', 'D23-A-T4': 'NOT_RUN'}))
except Exception as failure:
    error = failure
    print(json.dumps({'status': 'FAILED', 'code': str(failure) if isinstance(failure, b.Failure) else type(failure).__name__,
                      'D23-A-T1': 'NOT_PASSED', 'D23-A-T4': 'NOT_RUN'}), file=sys.stderr)
finally:
    for name in created:
        try:
            docker('rm', '-f', '-v', name)
        except Exception:
            print(json.dumps({'status': 'CLEANUP_FAILED', 'fixtureContainer': name}), file=sys.stderr)
            error = error or b.Failure('FIXTURE_CLEANUP_FAILED')
sys.exit(1 if error else 0)
