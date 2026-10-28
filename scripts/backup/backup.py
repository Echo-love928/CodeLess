#!/usr/bin/env python3
"""Offline operator utility. No shell, passwords, automatic deletion or service start.

Backup data is confidential, even though the configuration example is public.
Python 3.10+ stdlib; PostgreSQL 17 tools (host or existing DB container).
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import uuid
from datetime import datetime, timezone

PROTOCOL = 'codeless-offline-backup/v1'
REQUIRED = {'agent', 'workspaces', 'modelAudit', 'fileAudit', 'hosting', 'release'}
OPTIONAL = {'versions', 'deployments', 'adminAudit'}
UNITS = ('codeless-api.service', 'codeless-preview.service', 'codeless-worker.service',
         'codeless-reap.timer', 'codeless-reap.service')
TABLES = ('applications', 'generation_tasks', 'application_versions', 'builds', 'publications')
IDENTITY_SQL = "SELECT (SELECT system_identifier::text FROM pg_control_system()) || ':' || (SELECT oid::text FROM pg_database WHERE datname=current_database())"
EMPTY_SQL = "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'"
SIZE_SQL = 'SELECT pg_database_size(current_database())'
CONNECTION_SQL = "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'"


class Failure(Exception):
    pass


def require(ok, code):
    if not ok:
        raise Failure(code)


def stamp():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, data):
    with path.open('x', encoding='utf-8', newline='\n') as out:
        json.dump(data, out, ensure_ascii=False, indent=2)
        out.write('\n')
        out.flush()
        os.fsync(out.fileno())
    sync_directory(path.parent)


def sync_directory(path):
    if os.name == 'posix':
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def safe(path, directory=None):
    """Reject ancestor aliases, junctions, symlinks, special files and hardlinks."""
    path = Path(os.path.abspath(path))
    for p in (path, *path.parents):
        s = p.lstat()
        require(not stat.S_ISLNK(s.st_mode) and not getattr(p, 'is_junction', lambda: False)(), 'PATH_LINK_REJECTED')
        require(not getattr(s, 'st_file_attributes', 0) & 0x400, 'PATH_LINK_REJECTED')
    s = path.stat()
    require(stat.S_ISDIR(s.st_mode) or stat.S_ISREG(s.st_mode), 'PATH_TYPE_REJECTED')
    if path.is_file():
        require(s.st_nlink == 1, 'PATH_HARDLINK_REJECTED')
    if directory is not None:
        require(path.is_dir() == directory, 'PATH_TYPE_REJECTED')
    return path


def digest(path):
    safe(path, False)
    h = hashlib.sha256()
    with path.open('rb') as src:
        for block in iter(lambda: src.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def scan(root):
    root = safe(root, True)
    result = {}
    for parent, dirs, files in os.walk(root, followlinks=False):
        for name in sorted(dirs + files):
            p = safe(Path(parent) / name)
            relative = p.relative_to(root).as_posix()
            # These files never belong in platform data/release roots. Fail closed,
            # rather than silently producing a restore with missing content.
            require(not (name.lower() == '.env' or name.lower().startswith('.env.')
                         or name.lower() in ('pgpass', 'id_rsa', 'id_ed25519')
                         or name.lower().endswith(('.env', '.pem', '.key', '.p12', '.pfx', '.pgpass'))), 'SECRET_FILE_REJECTED')
            mode = stat.S_IMODE(p.stat().st_mode)
            require(not mode & (0o5000 if p.is_dir() else 0o7000), 'SPECIAL_MODE_REJECTED')
            result[relative] = {'type': 'dir', 'mode': mode} if p.is_dir() else {
                'type': 'file', 'mode': mode, 'bytes': p.stat().st_size, 'sha256': digest(p)}
    return dict(sorted(result.items()))


def space(parent, needed, reserve):
    require(shutil.disk_usage(parent).free >= needed + reserve, 'DISK_SPACE_LOW')


def disjoint(paths):
    for i, a in enumerate(paths):
        for b in paths[i + 1:]:
            require(a != b and a not in b.parents and b not in a.parents, 'ROOTS_OVERLAP')


def load_config(path):
    c = json.loads(safe(Path(path), False).read_text(encoding='utf-8'))
    require(set(c) == {'database', 'roots', 'reserveBytes'}, 'CONFIG_KEYS_INVALID')
    require(REQUIRED <= set(c['roots']) <= REQUIRED | OPTIONAL, 'ROOTS_INVALID')
    require(type(c['reserveBytes']) is int and c['reserveBytes'] >= 64 * 1024 * 1024, 'RESERVE_INVALID')
    c['roots'] = {k: safe(Path(v), True) for k, v in c['roots'].items()}
    disjoint(list(c['roots'].values()))
    # Never copy credentials/config or a live checkout containing ignored data.
    for p in c['roots'].values():
        require(p.parent != p and p.name not in ('etc', '.local-data', 'repository'), 'ROOT_TOO_BROAD')
        if os.name == 'posix':
            require(not any(Path(blocked) == p or Path(blocked) in p.parents
                            for blocked in ('/etc', '/root', '/proc', '/sys', '/dev', '/run')), 'PROTECTED_ROOT_REJECTED')
    return c


class Pg:
    def __init__(self, database):
        require(set(database) <= {'container', 'database', 'user'} and {'database', 'user'} <= set(database), 'DATABASE_CONFIG_INVALID')
        for value in database.values():
            require(isinstance(value, str) and re.fullmatch(r'[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,100}', value), 'DATABASE_VALUE_INVALID')
        self.database = database

    def run(self, tool, args, stdin=None, stdout=None):
        d = self.database
        command = ([tool] if 'container' not in d else
                   ['docker', 'exec', '-i', '--user', 'postgres', d['container'], tool])
        command += ['--no-password', '--username', d['user'], '--dbname', d['database'], *args]
        try:
            r = subprocess.run(command, stdin=stdin, stdout=stdout or subprocess.PIPE,
                               stderr=subprocess.PIPE, timeout=1800, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise Failure('PG_TOOL_UNAVAILABLE') from None
        # Never echo pg stderr, environment, DB URL, source contents or credential paths.
        require(r.returncode == 0, 'PG_' + tool.upper() + '_FAILED')
        return r.stdout

    def sql(self, sql):
        return self.run('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c',
                                "SET timezone='UTC'; SET datestyle='ISO, YMD'; " + sql]).decode().strip()

    def inventory(self):
        # All rows of reference-bearing tables, canonically ordered. Private payload.
        return {t: json.loads(self.sql(
            f"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) FROM {t} t")) for t in TABLES}

    def idle(self):
        require(170000 <= int(self.sql('SHOW server_version_num')) < 180000, 'POSTGRES_VERSION_MISMATCH')
        require(self.sql(CONNECTION_SQL) == '0', 'DATABASE_CLIENTS_PRESENT')

    def capacity(self, needed, reserve):
        location = self.sql('SHOW data_directory')
        if 'container' not in self.database:
            space(safe(Path(location), True), needed, reserve)
        else:
            try:
                r = subprocess.run(['docker', 'exec', '--user', 'postgres', self.database['container'],
                                    'stat', '-f', '-c', '%a:%S', location],
                                   capture_output=True, timeout=10, check=False)
                require(r.returncode == 0, 'DATABASE_DISK_CHECK_FAILED')
                blocks, block_size = map(int, r.stdout.decode().strip().split(':'))
                require(blocks * block_size >= needed + reserve, 'DATABASE_DISK_SPACE_LOW')
            except (OSError, ValueError, subprocess.TimeoutExpired):
                raise Failure('DATABASE_DISK_CHECK_FAILED') from None

    def dump(self, path):
        with path.open('xb') as out:
            self.run('pg_dump', ['--format=custom', '--no-owner', '--no-acl'], stdout=out)
            out.flush()
            os.fsync(out.fileno())

    def restore(self, path):
        with path.open('rb') as src:
            self.run('pg_restore', ['--single-transaction', '--exit-on-error', '--no-owner', '--no-acl'], stdin=src)


class Supervisor:
    def check(self):
        require(sys.platform.startswith('linux'), 'LINUX_OFFLINE_OPERATOR_REQUIRED')
        for unit in UNITS:
            try:
                r = subprocess.run(['systemctl', 'show', unit, '--property=LoadState,ActiveState', '--no-pager'],
                                   capture_output=True, timeout=10, check=False)
            except (OSError, subprocess.TimeoutExpired):
                raise Failure('SERVICE_CHECK_UNAVAILABLE') from None
            require(r.returncode == 0 and b'LoadState=loaded\n' in r.stdout
                    and b'ActiveState=inactive\n' in r.stdout, 'WRITER_NOT_STOPPED')
        try:
            r = subprocess.run(['docker', 'ps', '-q', '--filter', 'label=codeless.worker-job'],
                               capture_output=True, timeout=10, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise Failure('WORKER_CONTAINER_CHECK_UNAVAILABLE') from None
        require(r.returncode == 0 and not r.stdout.strip(), 'WORKER_CONTAINERS_PRESENT')


def roots_inventory(config):
    return {name: scan(path) for name, path in config['roots'].items()}


def copy_tree(source, target):
    # Source scanned first; target is exclusively created under a fresh private root.
    def copy_file(src, dst):
        safe(Path(src), False)
        with open(src, 'rb') as original, open(dst, 'xb') as out:
            shutil.copyfileobj(original, out, 1024 * 1024)
            out.flush()
            os.fsync(out.fileno())
        return dst
    shutil.copytree(source, target, copy_function=copy_file, symlinks=False)
    for parent, _, _ in os.walk(target, topdown=False):
        sync_directory(parent)
    sync_directory(target.parent)


def byte_count(inventory):
    return sum(e.get('bytes', 0) for entries in inventory.values() for e in entries.values())


def backup(config, destination, supervisor=None, pg=None):
    supervisor = supervisor or Supervisor()
    pg = pg or Pg(config['database'])
    supervisor.check()
    pg.idle()
    destination = Path(os.path.abspath(destination))
    safe(destination.parent, True)
    require(not destination.exists(), 'DESTINATION_EXISTS')
    disjoint([*config['roots'].values(), destination])
    initial = roots_inventory(config)
    identity = pg.sql(IDENTITY_SQL)
    before = pg.inventory()
    space(destination.parent, byte_count(initial) + 2 * int(pg.sql(SIZE_SQL)), config['reserveBytes'])
    destination.mkdir(mode=0o700)
    try:
        pg.dump(destination / 'database.dump')
        data = destination / 'data'
        data.mkdir(mode=0o700)
        for name, root in config['roots'].items():
            copy_tree(root, data / name)
        supervisor.check()
        pg.idle()
        require(initial == roots_inventory(config) and before == pg.inventory(), 'SOURCE_CHANGED')
        # File modes/owners are restored by the deployment operator, not copyfile.
        copied = {k: scan(data / k) for k in initial}
        for k in initial:
            for name, entry in initial[k].items():
                require({a: v for a, v in entry.items() if a != 'mode'} ==
                        {a: v for a, v in copied[k][name].items() if a != 'mode'}, 'COPY_MISMATCH')
        write_json(destination / 'references.json', before)
        manifest = {'protocol': PROTOCOL, 'id': str(uuid.uuid4()), 'createdAt': stamp(),
                    'sourceDatabaseIdentity': identity, 'postgresMajor': 17,
                    'consistency': 'all-writers-stopped', 'roots': initial,
                    'sourceRoots': {name: str(root) for name, root in config['roots'].items()},
                    'dumpSha256': digest(destination / 'database.dump'),
                    'referencesSha256': digest(destination / 'references.json')}
        # Completion marker last. A partial directory never qualifies as a backup.
        write_json(destination / 'manifest.json', manifest)
        verify(destination)
        return {'status': 'BACKUP_COMPLETE', 'backupId': manifest['id']}
    except BaseException:
        # Keep failed data private for diagnosis; never delete/overwrite old backups.
        raise


def verify(directory):
    directory = safe(Path(directory), True)
    require({p.name for p in directory.iterdir()} == {'manifest.json', 'database.dump', 'references.json', 'data'}, 'BACKUP_INCOMPLETE')
    m = json.loads(safe(directory / 'manifest.json', False).read_text(encoding='utf-8'))
    require(m['protocol'] == PROTOCOL and m['postgresMajor'] == 17 and m['consistency'] == 'all-writers-stopped', 'MANIFEST_INVALID')
    require(REQUIRED <= set(m['roots']) <= REQUIRED | OPTIONAL, 'MANIFEST_ROOTS_INVALID')
    require(set(m['sourceRoots']) == set(m['roots'])
            and all(isinstance(p, str) and Path(p).is_absolute() for p in m['sourceRoots'].values()), 'MANIFEST_PATHS_INVALID')
    require(digest(directory / 'database.dump') == m['dumpSha256'] and
            digest(directory / 'references.json') == m['referencesSha256'], 'BACKUP_HASH_MISMATCH')
    safe(directory / 'data', True)
    require({p.name for p in (directory / 'data').iterdir()} == set(m['roots']), 'BACKUP_ROOTS_MISMATCH')
    for name, entries in m['roots'].items():
        actual = scan(directory / 'data' / name)
        require(actual.keys() == entries.keys(), 'BACKUP_FILES_MISMATCH')
        for path, entry in entries.items():
            # Compare actual files before ever using a manifest path for a write.
            require({k: v for k, v in actual[path].items() if k != 'mode'} ==
                    {k: v for k, v in entry.items() if k != 'mode'}, 'BACKUP_HASH_MISMATCH')
            require(type(entry['mode']) is int and 0 <= entry['mode'] <= 0o2777
                    and not entry['mode'] & (0o5000 if entry['type'] == 'dir' else 0o7000), 'MODE_INVALID')
    return m


def restore(database, directory, destination, reserve, supervisor=None, pg=None):
    supervisor = supervisor or Supervisor()
    pg = pg or Pg(database)
    m = verify(directory)
    supervisor.check()
    pg.idle()
    require(pg.sql(IDENTITY_SQL).split(':')[0] != m['sourceDatabaseIdentity'].split(':')[0], 'RESTORE_SOURCE_DATABASE_REJECTED')
    require(pg.sql(EMPTY_SQL) == '0', 'RESTORE_DATABASE_NOT_EMPTY')
    destination = Path(os.path.abspath(destination))
    safe(destination.parent, True)
    require(not destination.exists(), 'DESTINATION_EXISTS')
    disjoint([safe(Path(directory), True), destination])
    # Custom dumps can expand; explicit reserve plus 2x archive is a preflight,
    # not a guarantee. ENOSPC still fails closed without a completion marker.
    space(destination.parent, byte_count(m['roots']) + 2 * (Path(directory) / 'database.dump').stat().st_size, reserve)
    pg.capacity(2 * (Path(directory) / 'database.dump').stat().st_size, reserve)
    destination.mkdir(mode=0o700)
    for name in m['roots']:
        copy_tree(Path(directory) / 'data' / name, destination / name)
        for relative, entry in m['roots'][name].items():
            os.chmod(destination / name / relative, entry['mode'])
    require({k: scan(destination / k) for k in m['roots']} == m['roots'], 'RESTORE_FILES_MISMATCH')
    supervisor.check()
    pg.idle()
    require(pg.sql(EMPTY_SQL) == '0', 'RESTORE_DATABASE_NOT_EMPTY')
    pg.restore(Path(directory) / 'database.dump')
    expected = json.loads((Path(directory) / 'references.json').read_text(encoding='utf-8'))
    require(pg.inventory() == expected, 'RESTORE_REFERENCES_MISMATCH')
    supervisor.check()
    write_json(destination / 'restore-complete.json', {'protocol': PROTOCOL, 'backupId': m['id'],
               'status': 'RESTORED_OFFLINE', 'finishedAt': stamp(), 'applicationAcceptance': 'NOT_RUN'})
    return {'status': 'RESTORED_OFFLINE', 'backupId': m['id'], 'applicationAcceptance': 'NOT_RUN'}


def check_restored(config, directory, supervisor=None, pg=None):
    """Read-only offline verification after placement on the independent host.

    Preview receipts bind absolute paths; relocating/re-writing them is forbidden.
    """
    m = verify(directory)
    supervisor = supervisor or Supervisor()
    pg = pg or Pg(config['database'])
    supervisor.check()
    pg.idle()
    require(pg.sql(IDENTITY_SQL).split(':')[0] != m['sourceDatabaseIdentity'].split(':')[0], 'RESTORE_SOURCE_DATABASE_REJECTED')
    require({name: str(root) for name, root in config['roots'].items()} == m['sourceRoots'], 'RESTORE_RUNTIME_PATHS_MISMATCH')
    require(roots_inventory(config) == m['roots'], 'RESTORE_FILES_MISMATCH')
    expected = json.loads((Path(directory) / 'references.json').read_text(encoding='utf-8'))
    require(pg.inventory() == expected, 'RESTORE_REFERENCES_MISMATCH')
    return {'status': 'RESTORED_DATA_VERIFIED', 'backupId': m['id'], 'applicationAcceptance': 'NOT_RUN'}


def health(config, pg=None):
    pg = pg or Pg(config['database'])
    require(pg.sql('SELECT 1') == '1', 'DATABASE_NOT_READY')
    inventory = roots_inventory(config)
    for root in config['roots'].values():
        space(root, 0, config['reserveBytes'])
    return {'status': 'STORAGE_DATABASE_READY', 'files': sum(len(x) for x in inventory.values()),
            'applicationAcceptance': 'NOT_RUN'}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('backup', 'verify', 'restore', 'check-restored', 'health'))
    parser.add_argument('--config', type=Path)
    parser.add_argument('--backup', type=Path)
    parser.add_argument('--destination', type=Path)
    parser.add_argument('--database-config', type=Path, help='Restore destination DB only; no passwords')
    parser.add_argument('--reserve-bytes', type=int, default=1024 * 1024 * 1024)
    args = parser.parse_args()
    operation = str(uuid.uuid4())
    print(json.dumps({'operationId': operation, 'action': args.action, 'status': 'STARTED', 'at': stamp()}), flush=True)
    try:
        if args.action in ('backup', 'health', 'check-restored'):
            require(args.config is not None, 'CONFIG_REQUIRED')
            config = load_config(args.config)
            if args.action == 'backup':
                require(args.destination is not None, 'DESTINATION_REQUIRED')
                result = backup(config, args.destination)
            elif args.action == 'health':
                result = health(config)
            else:
                require(args.backup is not None, 'BACKUP_REQUIRED')
                result = check_restored(config, args.backup)
        elif args.action == 'verify':
            require(args.backup is not None, 'BACKUP_REQUIRED')
            result = {'status': 'BACKUP_VERIFIED', 'backupId': verify(args.backup)['id']}
        else:
            require(args.database_config is not None and args.backup is not None and args.destination is not None, 'RESTORE_ARGUMENTS_REQUIRED')
            require(args.reserve_bytes >= 64 * 1024 * 1024, 'RESERVE_INVALID')
            db = json.loads(safe(args.database_config, False).read_text(encoding='utf-8'))
            result = restore(db, args.backup, args.destination, args.reserve_bytes)
        print(json.dumps({'operationId': operation, 'action': args.action, **result, 'at': stamp()}), flush=True)
        return 0
    except Exception as error:
        code = str(error) if isinstance(error, Failure) else ('DISK_SPACE_LOW' if isinstance(error, OSError) and error.errno == 28 else 'OPERATION_FAILED')
        print(json.dumps({'operationId': operation, 'action': args.action, 'status': 'FAILED', 'code': code, 'at': stamp()}), file=sys.stderr, flush=True)
        return 1


if __name__ == '__main__':
    sys.exit(main())
