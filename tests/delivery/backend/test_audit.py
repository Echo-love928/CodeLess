"""Regression for Git evidence vs Windows checkout bytes; no product/runtime mocks."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('d29_audit', Path(__file__).with_name('audit.py'))
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


class HistoricalBytesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='d29-audit-')
        self.root = Path(self.tmp.name)
        self.previous = audit.ROOT
        audit.ROOT = self.root
        audit.git('init', '-q')
        audit.git('config', 'core.autocrlf', 'false')
        self.contents = {'verifier.py': b'print("fixture")\n', 'receipt.json': b'{"status":"FAILED"}\n',
                         'image.png': b'\x89PNG\r\n\x1a\n', 'export.zip': b'PK\x03\x04\0\r\n'}
        for name, content in self.contents.items():
            (self.root / name).write_bytes(content)
        audit.git('add', '.')
        self.tree = audit.git('write-tree')

    def tearDown(self):
        audit.ROOT = self.previous
        self.tmp.cleanup()

    def check(self, name='verifier.py', expected=None, source=True):
        ref = {'path': name, 'sha256': expected or audit.sha(self.contents[name])}
        return audit.historical_reference(ref, self.tree, source=source)

    def test_lf_source_is_exact(self):
        self.assertTrue(self.check()['passed'])
        self.assertEqual('EXACT', self.check()['worktreeComparison'])

    def test_actual_autocrlf_checkout_passes_without_rewriting_bytes(self):
        (self.root / 'verifier.py').unlink()
        audit.git('-c', 'core.autocrlf=true', 'checkout-index', '--all', '--force')
        before = (self.root / 'verifier.py').read_bytes()
        self.assertEqual(b'print("fixture")\r\n', before)
        self.assertEqual('LF_TO_CRLF_ONLY', self.check()['worktreeComparison'])
        self.assertTrue(self.check()['passed'])
        self.assertEqual(before, (self.root / 'verifier.py').read_bytes())

    def test_crlf_content_change_cannot_hide_behind_matching_git_blob(self):
        (self.root / 'verifier.py').write_bytes(b'print("changed")\r\n')
        self.assertTrue(self.check()['gitMatchesExpected'])
        self.assertFalse(self.check()['passed'])

    def test_extra_line_is_not_a_checkout_conversion(self):
        (self.root / 'verifier.py').write_bytes(b'print("fixture")\r\n\r\n')
        self.assertFalse(self.check()['passed'])

    def test_wrong_expected_digest_still_fails(self):
        self.assertFalse(self.check(expected='0' * 64)['passed'])

    def test_receipt_line_endings_are_never_normalized(self):
        (self.root / 'receipt.json').write_bytes(self.contents['receipt.json'].replace(b'\n', b'\r\n'))
        self.assertFalse(self.check('receipt.json', source=False)['passed'])

    def test_binary_evidence_is_exact_and_tampering_fails(self):
        for name in ['image.png', 'export.zip']:
            with self.subTest(name=name):
                self.assertTrue(self.check(name, source=False)['passed'])
                (self.root / name).write_bytes(self.contents[name].replace(b'\r\n', b'\n'))
                self.assertFalse(self.check(name, source=False)['passed'])

    def test_missing_worktree_or_git_object_does_not_pass(self):
        (self.root / 'verifier.py').unlink()
        with self.assertRaises(FileNotFoundError):
            self.check()
        with self.assertRaises(subprocess.CalledProcessError):
            audit.historical_reference({'path': 'missing.py', 'sha256': '0' * 64}, self.tree, source=True)


if __name__ == '__main__':
    unittest.main()
