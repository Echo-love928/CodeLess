"""Linux-only tests of the production deployment privilege boundary."""
import base64
import datetime
import importlib.util
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('codeless_public_worker', Path(__file__).parents[2] / 'infra/public/worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


@unittest.skipUnless(sys.platform == 'linux', 'Production worker requires Linux process ownership')
class WorkerBoundaryTest(unittest.TestCase):
    def envelope(self, argv, payload):
        return {'argv': argv, 'input': base64.b64encode(json.dumps(payload).encode()).decode()}

    def publication(self, seconds=20):
        return {'action': 'publish', 'payload': {}, 'deadline':
                (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=seconds)).isoformat()}

    def test_no_eval_or_arbitrary_entry(self):
        for args in [['-e', 'process.exit(0)'], ['/tmp/untrusted.mjs'], ['docker', 'run'], []]:
            with self.assertRaises(ValueError):
                worker.binding(self.envelope(args, self.publication()))

    def test_fixed_publication_and_deadline(self):
        args = [str(worker.REPOSITORY / 'services/runner/src/publish/gateway-cli.mjs')]
        self.assertEqual(worker.binding(self.envelope(args, self.publication()))[-1], 'publish')
        for seconds in [-1, 1, 60]:
            with self.assertRaises(ValueError):
                worker.binding(self.envelope(args, self.publication(seconds)))
        malformed = self.publication()
        malformed['command'] = 'arbitrary'
        with self.assertRaises(ValueError):
            worker.binding(self.envelope(args, malformed))

    def test_source_roots_cannot_escape(self):
        previous = worker.PRIVATE
        try:
            with tempfile.TemporaryDirectory() as directory:
                worker.PRIVATE = Path(directory) / 'agent'
                source = worker.PRIVATE / 'versions/v/source'
                source.mkdir(parents=True)
                args = [str(worker.REPOSITORY / 'services/api/agent-runner.mjs'),
                        *[str(worker.PRIVATE / name) for name in ('work', 'artifacts', 'evidence', 'receipts')]]
                job = {'sourceDirectory': str(source), 'sourceDigest': 'sha256:' + 'a' * 64, 'actions': []}
                self.assertEqual(worker.binding(self.envelope(args, job))[-1], 'build')
                escaped = worker.PRIVATE / 'versions/escape'
                escaped.symlink_to(Path(directory), target_is_directory=True)
                for candidate in [str(Path(directory)), str(escaped), '/etc']:
                    with self.assertRaises(ValueError):
                        worker.binding(self.envelope(args, {**job, 'sourceDirectory': candidate}))
        finally:
            worker.PRIVATE = previous

    def test_environment_never_inherits_secrets(self):
        config = {key: 'https://app.example.top' for key in
                  ('CODELESS_PLATFORM_ORIGIN', 'CODELESS_PREVIEW_ORIGIN', 'CODELESS_PUBLICATION_ORIGIN')}
        config.update({'CODELESS_DATABASE_PASSWORD': 'test-secret', 'CODELESS_MODEL_API_KEY': 'test-secret', 'NODE_OPTIONS': '--eval=bad'})
        result = worker.environment(config, 'a' * 32)
        self.assertFalse(set(config).difference(result).isdisjoint({'CODELESS_DATABASE_PASSWORD', 'CODELESS_MODEL_API_KEY', 'NODE_OPTIONS'}))
        for name in ['CODELESS_DATABASE_PASSWORD', 'CODELESS_MODEL_API_KEY', 'NODE_OPTIONS']:
            self.assertNotIn(name, result)

    def test_real_peer_credentials_and_frame_limit(self):
        left, right = socket.socketpair()
        try:
            with self.assertRaises(PermissionError):
                worker.handle(left, {'apiUid': os.getuid() + 10000})
            right.sendall(struct.pack('!I', worker.MAX_FRAME + 1))
            with self.assertRaises(ValueError):
                worker.handle(left, {'apiUid': os.getuid()})
        finally:
            left.close()
            right.close()


    def process_case(self, case):
        repository = Path(__file__).parents[2]
        fixture = repository / 'tests/infra/fixtures/public-worker-process.py'
        result = subprocess.run([sys.executable, str(fixture), '--repository', str(repository),
                                 '--case', case], capture_output=True, text=True, timeout=12)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        proof = json.loads(result.stdout)
        self.assertEqual(proof['kind'], 'UNIT_FIXTURE_ONLY')
        self.assertFalse(proof['publicMilestoneReached'])
        self.assertTrue(proof['exactFixturePidsReaped'])
        self.assertTrue(proof['sameUidSiblingAlive'])

    def test_disconnect_reclaims_detached_sessions_holding_stdout(self):
        self.process_case('disconnect')

    def test_deadline_reclaims_detached_sessions_holding_stdout(self):
        self.process_case('deadline')

    def test_success_reaps_adopted_orphans_before_reporting_clean(self):
        self.process_case('completed')


if __name__ == '__main__':
    unittest.main()
