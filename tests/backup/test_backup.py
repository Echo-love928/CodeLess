"""Deterministic filesystem/failure tests. MockPg is NOT PostgreSQL acceptance."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('backup', ROOT / 'scripts/backup/backup.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class StoppedFixture:
    def check(self):
        pass


class MockPg:
    def __init__(self, identity='fixture-source:1'):
        self.identity = identity
        self.rows = {t: [{'id': 'fixture-id', 'status': 'FIXTURE'}] for t in b.TABLES}
        self.empty = True
        self.restored = False

    def idle(self):
        pass

    def capacity(self, needed, reserve):
        pass

    def inventory(self):
        return self.rows

    def sql(self, sql):
        if sql == b.IDENTITY_SQL:
            return self.identity
        if sql == b.EMPTY_SQL:
            return '0' if self.empty else '1'
        if sql == b.SIZE_SQL:
            return '100'
        if sql == 'SELECT 1':
            return '1'
        raise AssertionError(sql)

    def dump(self, path):
        path.write_bytes(b'EXPLICIT_MOCK_PG_ARCHIVE')

    def restore(self, path):
        self.restored = True


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='codeless-d23-')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.roots = {}
        for name in b.REQUIRED:
            root = self.home / name
            root.mkdir()
            (root / 'data.txt').write_text('original-' + name, encoding='utf-8')
            self.roots[name] = root
        (self.roots['agent'] / 'empty').mkdir()
        self.config = {'database': {'database': 'fixture', 'user': 'fixture'}, 'roots': self.roots,
                       'reserveBytes': 64 * 1024 * 1024}
        self.backup = self.home / 'backup'
        self.pg = MockPg()
        self.supervisor = StoppedFixture()

    def save(self):
        return b.backup(self.config, self.backup, self.supervisor, self.pg)

    def recover(self, target=None):
        target = target or MockPg('fixture-target:2')
        return b.restore({}, self.backup, self.home / 'restored', self.config['reserveBytes'], self.supervisor, target)

    def test_backup_restore_files_empty_directories_and_references_fixture_only(self):
        saved = self.save()
        result = self.recover()
        self.assertEqual(saved['backupId'], result['backupId'])
        self.assertEqual('NOT_RUN', result['applicationAcceptance'])
        for name in b.REQUIRED:
            self.assertEqual(b.scan(self.roots[name]), b.scan(self.home / 'restored' / name))
        self.assertTrue((self.home / 'restored/agent/empty').is_dir())

    def test_secrets_outside_allowlisted_roots_and_environment_never_enter_backup(self):
        secret = 'D23_SENTINEL_SECRET_DO_NOT_PUBLISH'
        (self.home / 'operator.env').write_text(secret, encoding='utf-8')
        with patch.dict(os.environ, {'CODELESS_MODEL_API_KEY': secret, 'PGPASSWORD': secret}):
            self.save()
        for f in self.backup.rglob('*'):
            if f.is_file():
                self.assertNotIn(secret.encode(), f.read_bytes())
        public = list((ROOT / 'infra/backup').glob('*.json'))
        for f in public:
            text = f.read_text(encoding='utf-8')
            self.assertNotIn(secret, text)
            self.assertNotRegex(text.lower(), r'password|api.key|signing.key|private.key')

    def test_secret_file_in_data_fails_closed(self):
        (self.roots['release'] / '.env').write_text('private', encoding='utf-8')
        with self.assertRaisesRegex(b.Failure, 'SECRET_FILE_REJECTED'):
            self.save()
        self.assertFalse(self.backup.exists())

    def test_low_disk_rejects_before_dump_and_preserves_previous_backup(self):
        self.save()
        original = (self.backup / 'manifest.json').read_bytes()
        with patch.object(b.shutil, 'disk_usage', return_value=type('Usage', (), {'free': 1})()):
            with self.assertRaisesRegex(b.Failure, 'DISK_SPACE_LOW'):
                b.backup(self.config, self.home / 'second', self.supervisor, self.pg)
        self.assertEqual(original, (self.backup / 'manifest.json').read_bytes())
        self.assertFalse((self.home / 'second').exists())

    def test_dump_failure_is_incomplete_and_cannot_be_verified(self):
        with patch.object(self.pg, 'dump', side_effect=b.Failure('PG_PG_DUMP_FAILED')):
            with self.assertRaisesRegex(b.Failure, 'PG_PG_DUMP_FAILED'):
                self.save()
        self.assertFalse((self.backup / 'manifest.json').exists())
        with self.assertRaisesRegex(b.Failure, 'BACKUP_INCOMPLETE'):
            b.verify(self.backup)

    def test_changed_source_after_dump_has_no_completion_marker(self):
        original = self.pg.dump
        def mutate(path):
            original(path)
            (self.roots['hosting'] / 'data.txt').write_text('changed', encoding='utf-8')
        with patch.object(self.pg, 'dump', side_effect=mutate):
            with self.assertRaisesRegex(b.Failure, 'SOURCE_CHANGED'):
                self.save()
        self.assertFalse((self.backup / 'manifest.json').exists())

    def test_running_service_is_rejected_before_backup(self):
        with patch.object(self.supervisor, 'check', side_effect=b.Failure('WRITER_NOT_STOPPED_AND_MASKED')):
            with self.assertRaisesRegex(b.Failure, 'WRITER_NOT_STOPPED'):
                self.save()
        self.assertFalse(self.backup.exists())

    def test_production_supervisor_rejects_active_unknown_services_and_container_check_errors(self):
        inactive = subprocess.CompletedProcess([], 0, b'LoadState=loaded\nActiveState=inactive\n', b'')
        active = subprocess.CompletedProcess([], 0, b'LoadState=loaded\nActiveState=active\n', b'')
        failed = subprocess.CompletedProcess([], 1, b'', b'private diagnostic')
        with patch.object(b.sys, 'platform', 'linux'), patch.object(b.subprocess, 'run', return_value=active):
            with self.assertRaisesRegex(b.Failure, 'WRITER_NOT_STOPPED'):
                b.Supervisor().check()
        with patch.object(b.sys, 'platform', 'linux'), patch.object(b.subprocess, 'run', side_effect=[inactive] * 5 + [failed]):
            with self.assertRaisesRegex(b.Failure, 'WORKER_CONTAINERS_PRESENT'):
                b.Supervisor().check()

    def test_changed_database_reference_rejects_backup(self):
        original = self.pg.dump
        def mutate(path):
            original(path)
            self.pg.rows = {}
        with patch.object(self.pg, 'dump', side_effect=mutate):
            with self.assertRaisesRegex(b.Failure, 'SOURCE_CHANGED'):
                self.save()
        self.assertFalse((self.backup / 'manifest.json').exists())

    def test_tampered_extra_missing_or_traversal_files_rejected_before_restore(self):
        self.save()
        victim = self.backup / 'data/hosting/data.txt'
        original = victim.read_bytes()
        victim.write_bytes(b'tampered')
        with self.assertRaisesRegex(b.Failure, 'BACKUP_HASH_MISMATCH'):
            self.recover()
        victim.write_bytes(original)
        victim.unlink()
        with self.assertRaisesRegex(b.Failure, 'BACKUP_FILES_MISMATCH'):
            self.recover()
        victim.write_bytes(original)
        manifest = self.backup / 'manifest.json'
        m = json.loads(manifest.read_text(encoding='utf-8'))
        m['roots']['hosting']['../../escape'] = m['roots']['hosting']['data.txt']
        manifest.write_text(json.dumps(m), encoding='utf-8')
        with self.assertRaisesRegex(b.Failure, 'BACKUP_FILES_MISMATCH'):
            self.recover()
        self.assertFalse((self.home / 'restored').exists())

    def test_restore_refuses_source_nonempty_database_and_existing_directory(self):
        self.save()
        with self.assertRaisesRegex(b.Failure, 'RESTORE_SOURCE_DATABASE_REJECTED'):
            self.recover(self.pg)
        with self.assertRaisesRegex(b.Failure, 'RESTORE_SOURCE_DATABASE_REJECTED'):
            self.recover(MockPg('fixture-source:999'))
        target = MockPg('target:1')
        target.empty = False
        with self.assertRaisesRegex(b.Failure, 'RESTORE_DATABASE_NOT_EMPTY'):
            self.recover(target)
        self.assertFalse(target.restored)
        (self.home / 'restored').mkdir()
        with self.assertRaisesRegex(b.Failure, 'DESTINATION_EXISTS'):
            self.recover()

    def test_pg_restore_or_reference_mismatch_has_no_success_marker(self):
        self.save()
        target = MockPg('target:1')
        target.rows = {}
        with self.assertRaisesRegex(b.Failure, 'RESTORE_REFERENCES_MISMATCH'):
            self.recover(target)
        self.assertTrue(target.restored)
        self.assertFalse((self.home / 'restored/restore-complete.json').exists())

    def test_native_restore_failure_never_writes_success_marker(self):
        self.save()
        target = MockPg('target:1')
        with patch.object(target, 'restore', side_effect=b.Failure('PG_PG_RESTORE_FAILED')):
            with self.assertRaisesRegex(b.Failure, 'PG_PG_RESTORE_FAILED'):
                self.recover(target)
        self.assertFalse((self.home / 'restored/restore-complete.json').exists())

    def test_preview_absolute_paths_must_match_before_offline_activation(self):
        self.save()
        target = MockPg('target:1')
        result = b.check_restored(self.config, self.backup, self.supervisor, target)
        self.assertEqual('RESTORED_DATA_VERIFIED', result['status'])
        self.assertEqual('NOT_RUN', result['applicationAcceptance'])
        config = dict(self.config, roots=dict(self.roots, agent=self.home / 'relocated-agent'))
        with self.assertRaisesRegex(b.Failure, 'RESTORE_RUNTIME_PATHS_MISMATCH'):
            b.check_restored(config, self.backup, self.supervisor, target)

    def test_destination_database_disk_failure_does_not_create_restore_tree(self):
        self.save()
        target = MockPg('target:1')
        with patch.object(target, 'capacity', side_effect=b.Failure('DATABASE_DISK_SPACE_LOW')):
            with self.assertRaisesRegex(b.Failure, 'DATABASE_DISK_SPACE_LOW'):
                self.recover(target)
        self.assertFalse((self.home / 'restored').exists())

    def test_links_and_overlapping_roots_rejected(self):
        # Hardlinks need no Windows developer-mode symlink privilege.
        os.link(self.roots['agent'] / 'data.txt', self.roots['hosting'] / 'alias')
        with self.assertRaisesRegex(b.Failure, 'PATH_HARDLINK_REJECTED'):
            self.save()
        with self.assertRaisesRegex(b.Failure, 'ROOTS_OVERLAP'):
            b.disjoint([self.home, self.roots['agent']])

    def test_cli_failure_is_nonzero_and_correlated_without_secret_error_text(self):
        r = subprocess.run([sys.executable, str(ROOT / 'scripts/backup/backup.py'), 'verify',
                            '--backup', str(self.home / 'absent')], capture_output=True, text=True)
        self.assertEqual(1, r.returncode)
        start = json.loads(r.stdout)
        fail = json.loads(r.stderr)
        self.assertEqual(start['operationId'], fail['operationId'])
        self.assertEqual('FAILED', fail['status'])
        self.assertNotIn(str(self.home), r.stderr)

    def test_cli_dump_failure_has_native_failure_status_and_no_completion_marker(self):
        out, err = io.StringIO(), io.StringIO()
        with patch.object(sys, 'argv', ['backup.py', 'backup', '--config', 'fixture.json', '--destination', str(self.backup)]), \
             patch.object(b, 'load_config', return_value=self.config), \
             patch.object(b, 'Supervisor', return_value=self.supervisor), \
             patch.object(b, 'Pg', return_value=self.pg), \
             patch.object(self.pg, 'dump', side_effect=b.Failure('PG_PG_DUMP_FAILED')), \
             contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            result = b.main()
        self.assertEqual(1, result)
        self.assertEqual('FAILED', json.loads(err.getvalue())['status'])
        self.assertEqual('PG_PG_DUMP_FAILED', json.loads(err.getvalue())['code'])
        self.assertEqual(json.loads(out.getvalue())['operationId'], json.loads(err.getvalue())['operationId'])
        self.assertFalse((self.backup / 'manifest.json').exists())

    def test_database_tools_never_use_shell_or_password_argv_and_failure_is_redacted(self):
        pg = b.Pg({'container': 'fixture-db', 'database': 'fixture', 'user': 'fixture'})
        failure = subprocess.CompletedProcess([], 1, b'', b'PASSWORD_SECRET_RAW_ERROR')
        with patch.object(b.subprocess, 'run', return_value=failure) as run:
            with self.assertRaisesRegex(b.Failure, '^PG_PSQL_FAILED$'):
                pg.sql('SELECT 1')
            self.assertNotIn('shell', run.call_args.kwargs)
            self.assertIn('--no-password', run.call_args.args[0])
        with self.assertRaisesRegex(b.Failure, 'DATABASE_CONFIG_INVALID'):
            b.Pg({'database': 'fixture', 'user': 'fixture', 'password': 'forbidden'})

    def test_health_does_not_claim_application_acceptance_or_hide_low_disk(self):
        self.assertEqual('NOT_RUN', b.health(self.config, self.pg)['applicationAcceptance'])
        with patch.object(b.shutil, 'disk_usage', return_value=type('Usage', (), {'free': 1})()):
            with self.assertRaisesRegex(b.Failure, 'DISK_SPACE_LOW'):
                b.health(self.config, self.pg)


if __name__ == '__main__':
    unittest.main(verbosity=2)
