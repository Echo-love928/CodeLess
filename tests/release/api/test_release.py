import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/release'))
import api_release as r


class PackageIntegrity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='d27-release-')
        self.addCleanup(self.temp.cleanup)
        self.package = Path(self.temp.name) / 'api'; self.package.mkdir()
        (self.package / 'api.jar').write_bytes(b'explicit integrity-only fixture, not a real JAR')
        entries = r.inventory(self.package)
        value = {'schema': 'codeless-api-release-v1', 'sourceCommit': 'a' * 40, 'files': entries}
        data = r.canonical(value); self.expected = r.sha(data)
        (self.package / 'release.json').write_bytes(data)
        (self.package / 'SHA256SUMS').write_bytes(r.checksums(entries, data))

    def verify(self): return r.verify(self.package, self.expected)

    def test_valid_and_cli_native_exit(self):
        self.assertEqual(self.verify()['sourceCommit'], 'a' * 40)
        process = subprocess.run([sys.executable, '-B', str(ROOT / 'scripts/release/api_release.py'),
                                  'verify', '--package', str(self.package), '--manifest-sha256', self.expected], capture_output=True)
        self.assertEqual(process.returncode, 0)
        self.assertEqual(json.loads(process.stdout)['status'], 'VERIFIED')

    def test_bytes_tampered(self):
        (self.package / 'api.jar').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'RELEASE_FILES_MISMATCH'): self.verify()

    def test_missing_asset(self):
        (self.package / 'api.jar').unlink()
        with self.assertRaisesRegex(ValueError, 'RELEASE_FILES_MISMATCH'): self.verify()

    def test_extra_asset(self):
        (self.package / 'extra').write_bytes(b'extra')
        with self.assertRaisesRegex(ValueError, 'RELEASE_FILES_MISMATCH'): self.verify()

    def test_manifest_rewritten_with_forged_checksums(self):
        value = json.loads((self.package / 'release.json').read_bytes())
        (self.package / 'api.jar').write_bytes(b'forged')
        value['files'] = r.inventory(self.package)
        data = r.canonical(value)
        (self.package / 'release.json').write_bytes(data)
        (self.package / 'SHA256SUMS').write_bytes(r.checksums(value['files'], data))
        with self.assertRaisesRegex(ValueError, 'RELEASE_MANIFEST_MISMATCH'): self.verify()

    def test_checksums_tampered(self):
        (self.package / 'SHA256SUMS').write_bytes(b'forged')
        with self.assertRaisesRegex(ValueError, 'RELEASE_CHECKSUMS_MISMATCH'): self.verify()

    def test_trusted_digest_required(self):
        with self.assertRaisesRegex(ValueError, 'TRUSTED_MANIFEST_SHA256_REQUIRED'): r.verify(self.package, '')

    def test_path_and_secret_rejection(self):
        for path in ('../escape', '/etc/passwd', 'foo\\bar', 'foo//bar', 'foo/./bar', 'foo/../bar', 'C:/foo', 'CON', 'a.',
                     'repository/.env.example', 'repository/.git/config', 'secret.key', 'node_modules/foo'):
            with self.subTest(path=path), self.assertRaises(ValueError): r.portable(path)

    def test_hardlink_rejected(self):
        os.link(self.package / 'api.jar', self.package / 'alias')
        with self.assertRaisesRegex(ValueError, 'HARDLINK'): self.verify()

    def test_cli_failure_native_nonzero(self):
        (self.package / 'api.jar').write_bytes(b'corrupted')
        process = subprocess.run([sys.executable, '-B', str(ROOT / 'scripts/release/api_release.py'),
                                  'verify', '--package', str(self.package), '--manifest-sha256', self.expected], capture_output=True)
        self.assertEqual(process.returncode, 1)
        self.assertEqual(json.loads(process.stderr)['status'], 'FAILED')

    def test_full_commit_required_and_source_modes(self):
        with self.assertRaisesRegex(ValueError, 'FULL_COMMIT_REQUIRED'): r.source_files('HEAD')
        head = r.git('rev-parse', 'HEAD').decode().strip()
        files = r.source_files(head)
        self.assertTrue(any(name.endswith('V5__version_source_tasks.sql') for name, _, _ in files))
        self.assertFalse(any('/src/test/' in name for name, _, _ in files))

    def test_build_refuses_existing_destination_before_maven(self):
        head = r.git('rev-parse', 'HEAD').decode().strip()
        with self.assertRaisesRegex(ValueError, 'RELEASE_DESTINATION_EXISTS'):
            r.build(head, self.package, Path(self.temp.name) / 'build.log')


class NotesAndConfiguration(unittest.TestCase):
    def test_documented_versions_match_actual_lock(self):
        notes = (ROOT / 'docs/release-notes.md').read_text(encoding='utf-8')
        package = json.loads((ROOT / 'package.json').read_text())
        for value in (package['engines']['node'], package['engines']['pnpm'], '3.9.11', '4.1.1', '2.0.1'):
            self.assertIn(value, notes)
        pom = (ROOT / 'services/api/pom.xml').read_text()
        for value in ('4.1.1', '2.0.1', '<java.version>21</java.version>'): self.assertIn(value, pom)

    def test_defaults_and_no_activation_claim(self):
        notes = (ROOT / 'docs/release-notes.md').read_text(encoding='utf-8')
        config = json.loads((ROOT / 'infra/release/api/configuration.json').read_text())
        app = (ROOT / 'services/api/src/main/resources/application.yml').read_text()
        self.assertIn('CANDIDATE / HOLD', notes)
        for name in ('CODELESS_COVER_ENABLED', 'CODELESS_PUBLICATION_ENABLED'):
            self.assertEqual(config['defaults'][name], False)
            self.assertIn(name + ':false', app)
            self.assertIn(name + '=false', notes)
        self.assertIn('deterministic-mock', app)
        for name in ('codeless.tasks.enabled', 'codeless.agent.enabled', 'codeless.deploy.worker-enabled',
                     'codeless.recovery.sweep-enabled', 'codeless.cover.enabled'):
            self.assertIn('--' + name + '=false', config['recoveryFirstStartArguments'])

    def test_claimed_routes_present_and_scope_exclusions_retained(self):
        api = json.loads((ROOT / 'contracts/openapi.v0.json').read_text(encoding='utf-8'))['paths']
        for path in ('/api/v0/auth/login', '/api/v0/applications', '/api/v0/versions/{versionId}',
                     '/api/v0/versions/{versionId}/files', '/api/v0/publications'):
            self.assertIn(path, api)
        notes = (ROOT / 'docs/release-notes.md').read_text(encoding='utf-8')
        for name in ('React', 'AST', 'RAG', '多Agent', '开放shell', '实际运营演示库备份尚未提供', '6/9', 'RTO'):
            self.assertIn(name, notes)


if __name__ == '__main__': unittest.main(verbosity=2)
