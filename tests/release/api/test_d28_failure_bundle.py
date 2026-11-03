"""Named provenance fixtures; no product execution or historical verdicts."""
import json
from pathlib import Path
import tempfile
import unittest
from d28_failure_bundle import collect, sha


class FailureBundleTests(unittest.TestCase):
    def test_digest_mismatch_stops_before_creating_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            evidence = root / 'tests/release/api/evidence'
            private = root / 'tests/release/api/.private'
            for directory in (evidence / 'd28', evidence / 'd28-followup', private,
                              evidence / '2026-11-01T04-56-43.858254+00-00-gate',
                              evidence / 'd28/2026-11-01T14-32-37.236887+00-00-gate'):
                directory.mkdir(parents=True, exist_ok=True)
            raw = private / 'FIXTURE-original.log'; raw.write_bytes(b'CHANGED_FIXTURE')
            (evidence / 'd28/api-failure.json').write_text(json.dumps({'rawEvidence': [{
                'privateCopy': raw.relative_to(root).as_posix(), 'sha256': sha(b'ORIGINAL_FIXTURE')}]}))
            (evidence / 'd28-followup/original-failure-chain.json').write_text('{}')
            for path in (evidence / '2026-11-01T04-56-43.858254+00-00-gate/command.json',
                         evidence / 'd28/2026-11-01T14-32-37.236887+00-00-gate/command.json'):
                path.write_text('{}')
            output = private / 'new.tar'
            with self.assertRaisesRegex(ValueError, 'ORIGINAL_DIGEST_MISMATCH'):
                collect(root, output)
            self.assertFalse(output.exists()); self.assertEqual(raw.read_bytes(), b'CHANGED_FIXTURE')

    def test_output_must_be_new_and_task_private(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); private = root / 'tests/release/api/.private'; private.mkdir(parents=True)
            output = private / 'existing.tar'; output.write_bytes(b'ORIGINAL_FIXTURE')
            for target in (output, root / 'outside.tar'):
                with self.assertRaisesRegex(ValueError, 'FRESH_TASK_PRIVATE'):
                    collect(root, target)
            self.assertEqual(output.read_bytes(), b'ORIGINAL_FIXTURE')


if __name__ == '__main__':
    unittest.main(verbosity=2)
