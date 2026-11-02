"""Portable Java discovery controls; fake version probes are not JVM acceptance."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from d28_record import java21_home


class JavaDiscoveryTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='d28 java discovery ')
        self.home = Path(self.directory.name)
        (self.home / 'bin').mkdir()
        self.binary = self.home / 'bin' / ('java.exe' if os.name == 'nt' else 'java')
        self.binary.write_bytes(b'fixture, never executed')
        self.addCleanup(self.directory.cleanup)

    @patch('d28_record.shutil.which', return_value=None)
    @patch('d28_record.subprocess.run')
    def test_explicit_home_with_spaces_is_probed_and_selected(self, run, _which):
        run.return_value = subprocess.CompletedProcess([], 0, b'', b'openjdk version "21.0.12.1"')
        self.assertEqual(java21_home({}, str(self.home)), self.home.resolve())
        self.assertEqual(run.call_args.args[0], [str(self.binary), '-version'])

    @patch('d28_record.shutil.which', return_value=None)
    @patch('d28_record.subprocess.run')
    def test_explicit_wrong_major_or_failed_probe_cannot_fall_back(self, run, _which):
        for code, version in ((0, b'java version "17.0.1"'), (1, b'openjdk version "21.0.1"')):
            run.return_value = subprocess.CompletedProcess([], code, b'', version)
            with self.subTest(code=code), self.assertRaises(RuntimeError):
                java21_home({'JAVA_HOME_21_X64': str(self.home)}, str(self.home))

    @patch('d28_record.shutil.which', return_value=None)
    @patch('d28_record.subprocess.run')
    def test_standard_environment_home_is_supported(self, run, _which):
        run.return_value = subprocess.CompletedProcess([], 0, b'', b'openjdk version "21.0.12.1"')
        self.assertEqual(java21_home({'JAVA_HOME': str(self.home)}), self.home.resolve())

    @patch('d28_record.subprocess.run')
    def test_path_java_is_supported_without_a_machine_specific_directory(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, b'', b'openjdk version "21.0.12.1"')
        with patch('d28_record.shutil.which', return_value=str(self.binary)):
            self.assertEqual(java21_home({'PATH': str(self.binary.parent)}), self.home.resolve())


if __name__ == '__main__':
    unittest.main(verbosity=2)
