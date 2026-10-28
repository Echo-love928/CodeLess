import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

sys.dont_write_bytecode = True
TEST_WORKSPACE = Path.cwd().resolve()
assert TEST_WORKSPACE != Path(TEST_WORKSPACE.anchor)
TEST_ROOT = TEST_WORKSPACE / '.local-data/d22-b/resource-monitor-tests'
TEST_ROOT.mkdir(parents=True, exist_ok=True)
assert TEST_ROOT.resolve().is_relative_to(TEST_WORKSPACE)
spec = importlib.util.spec_from_file_location('resource_monitor', Path(__file__).with_name('resource-monitor.py'))
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class ResourceMonitorTest(unittest.TestCase):
    def test_stat_identity_and_cpu_do_not_depend_on_process_name(self):
        values = ['R'] + ['0'] * 18 + ['12345']
        values[11], values[12] = '30', '12'
        parsed = monitor.proc_stat('99 (private (name) with spaces) ' + ' '.join(values))
        self.assertEqual(parsed, {'state': 'R', 'cpuTicks': 42, 'startTicks': 12345})
        self.assertNotIn('private', json.dumps(parsed))

    def test_missing_pid_is_unknown_measurement_not_zero_memory(self):
        with tempfile.TemporaryDirectory(dir=TEST_ROOT) as root:
            value = monitor.process_snapshot(123, proc=Path(root))
        self.assertEqual(value['state'], 'EXITED')
        self.assertIsNone(value['rssBytes'])
        self.assertIsNone(value['cpuTicks'])

    def test_reused_pid_cannot_be_attributed_to_original_workload(self):
        with tempfile.TemporaryDirectory(dir=TEST_ROOT) as root:
            directory = Path(root) / '123'
            directory.mkdir()
            values = ['R'] + ['0'] * 18 + ['200']
            (directory / 'stat').write_text('123 (changed) ' + ' '.join(values))
            value = monitor.process_snapshot(123, expected_start=100, proc=Path(root))
        self.assertEqual(value['state'], 'PID_REUSED')
        self.assertIsNone(value['cgroup'])

    def test_cgroup_unlimited_and_missing_metrics_stay_distinct(self):
        with tempfile.TemporaryDirectory(dir=TEST_ROOT) as root:
            path = Path(root)
            for name, content in {'cpu.stat': 'usage_usec 123\nnr_throttled 2\n', 'cpu.max': 'max 100000',
                                  'memory.current': '96', 'memory.max': 'max', 'memory.events': 'oom_kill 1\n',
                                  'pids.current': '2', 'pids.max': '128'}.items():
                (path / name).write_text(content)
            value = monitor.cgroup_snapshot(path)
        self.assertEqual(value['metrics']['memory.max'], 'max')
        self.assertEqual(value['metrics']['memory.events']['oom_kill'], 1)
        self.assertIsNone(value['metrics']['memory.peak'])
        self.assertEqual(value['errors'], [{'metric': 'memory.peak', 'error': 'FileNotFoundError'}])

    def test_scratch_only_counts_metadata_and_does_not_follow_links(self):
        with tempfile.TemporaryDirectory(dir=TEST_ROOT) as root:
            directory = Path(root) / 'scratch'; directory.mkdir()
            (directory / 'file').write_bytes(b'abcd')
            secret = Path(root) / 'secret'; secret.write_bytes(b'credential-never-read')
            try:
                (directory / 'link').symlink_to(secret)
            except OSError:
                self.skipTest('symlinks unavailable on this host; Linux smoke still exercises real resources')
            value = monitor.scratch_snapshot(directory)
            self.assertEqual(value, {'state': 'PRESENT', 'files': 1, 'bytes': 4, 'linksSkipped': 1})
            with self.assertRaises(ValueError):
                monitor.scratch_snapshot(directory, limit=1)

    def test_docker_records_only_explicit_allowlisted_fields(self):
        identifier = 'a' * 64
        captured = []
        def run(args, **kwargs):
            captured.append(args)
            return SimpleNamespace(returncode=0, stderr='', stdout=json.dumps({'id': identifier,
                'running': True, 'pid': 99, 'oomKilled': False, 'exitCode': 0,
                'limits': {'memoryBytes': 96, 'memorySwapBytes': 96, 'nanoCpus': 1000000000, 'pids': 128,
                           'privateMount': '/private'}, 'Env': ['KEY=must-not-leak'], 'Cmd': ['secret']}))
        value = monitor.docker_snapshots([identifier], run)
        self.assertNotIn('must-not-leak', json.dumps(value))
        self.assertNotIn('/private', json.dumps(value))
        self.assertNotIn('Config.Env', captured[0][3])
        self.assertEqual(value[0]['state'], 'RUNNING')

    def test_docker_permission_failure_is_not_container_cleanup_success(self):
        identifier = 'b' * 64
        def run(*_args, **_kwargs):
            return SimpleNamespace(returncode=1, stdout='', stderr='permission denied: private daemon endpoint')
        value = monitor.docker_snapshots([identifier], run)
        self.assertEqual(value[0]['state'], 'UNKNOWN')
        self.assertNotIn('endpoint', json.dumps(value))
        with self.assertRaises(ValueError):
            monitor.docker_snapshots(['arbitrary-name-or-command'], run)

    def test_docker_confirmed_absence_and_timeout_have_different_outcomes(self):
        identifier = 'c' * 64
        missing = monitor.docker_snapshots([identifier], lambda *_a, **_k:
            SimpleNamespace(returncode=1, stdout='\n', stderr='error: no such object: ' + identifier + '\n'))
        self.assertEqual(missing[0]['state'], 'REMOVED')
        def timeout(*_args, **_kwargs):
            raise subprocess.TimeoutExpired('docker', 3)
        self.assertEqual(monitor.docker_snapshots([identifier], timeout)[0]['state'], 'UNKNOWN')


if __name__ == '__main__':
    unittest.main()
