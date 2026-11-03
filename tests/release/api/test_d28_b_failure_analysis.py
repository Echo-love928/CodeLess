"""Evidence interpretation controls, not a product acceptance substitute."""
import unittest
import json
from d28_b_failure_analysis import download_timeline, sampled_worker, junit_counts, cleanup_timeouts


class OriginalAnalysisTests(unittest.TestCase):
    def fixture(self):
        rows = [{'type': 'before', 'callId': 'wait', 'startTime': 100, 'method': 'waitForEventInfo'},
                {'type': 'after', 'callId': 'wait', 'endTime': 10100, 'error': {'message': 'Timeout waiting for download'}},
                {'type': 'before', 'callId': 'click', 'startTime': 101, 'method': 'click', 'params': {'selector': '下载源码'}},
                {'type': 'log', 'callId': 'click', 'time': 7200, 'message': 'locator resolved to button'},
                {'type': 'log', 'callId': 'click', 'time': 7210, 'message': '  performing click action'},
                {'type': 'after', 'callId': 'click', 'endTime': 7220, 'error': None}]
        network = [{'request': {'url': 'https://fixture.invalid/api/v0/versions/selected/export?PRIVATE_FIXTURE'},
                    'response': {'status': -1}, '_monotonicTime': 7215, 'time': -1}]
        return rows, network

    def test_listener_time_is_not_backend_time_and_pending_is_not_success(self):
        rows, network = self.fixture()
        result = download_timeline(rows, network, 'selected')
        self.assertEqual(result['listenerToLocatorMs'], 7100)
        self.assertEqual(result['exportObservationBeforeFailureMs'], 2885)
        self.assertIsNone(result['exportHttpStatus']); self.assertIsNone(result['exportDurationMs'])
        self.assertFalse(result['exportCompleted']); self.assertIsNone(result['backendRootCause'])
        self.assertNotIn('PRIVATE_FIXTURE', str(result))

    def test_foreign_version_or_ambiguous_request_cannot_fill_missing_evidence(self):
        rows, network = self.fixture()
        with self.assertRaisesRegex(ValueError, 'ONE_SAME_VERSION'):
            download_timeline(rows, network, 'another-version')
        with self.assertRaisesRegex(ValueError, 'ONE_SAME_VERSION'):
            download_timeline(rows, network * 2, 'selected')
        result = download_timeline([r for r in rows if r['type'] != 'log'], network, 'selected')
        self.assertIsNone(result['locatorResolvedMs']); self.assertIsNone(result['clickPerformedMs'])

    def test_pid_reuse_and_missing_kill_proof_are_not_termination_success(self):
        rows = [{'at': '2026-11-02T11:07:53Z', 'processes': [
            {'ProcessId': 42, 'CreationDate': '2026-11-02T10:07:46Z', 'ParentProcessId': 7},
            {'ProcessId': 42, 'CreationDate': '2026-11-02T20:07:46.214+09:00', 'ParentProcessId': 8}]}]
        result = sampled_worker(rows, 42, '2026-11-02T11:07:46Z', '2026-11-02T11:07:55Z')
        self.assertEqual(result['excludedTemporalIdentities'], 1); self.assertEqual(len(result['samples']), 1)
        self.assertIsNone(result['nativeKillExitCode']); self.assertIsNone(result['kernelHandles'])

    def test_missing_junit_or_attributes_remain_unknown(self):
        self.assertIsNone(junit_counts([])['tests'])
        self.assertIsNone(junit_counts([('fixture.xml', b'<testsuite tests="1"/>')])['failures'])
        self.assertEqual(junit_counts([('fixture.xml', b'<testsuite tests="1" failures="1" errors="0" skipped="0"/>')])['failures'], 1)
        with self.assertRaisesRegex(ValueError, 'INVALID_JUNIT_COUNT'):
            junit_counts([('fixture.xml', b'<testsuite tests="-1"/>')])

    def test_other_stage_timeout_cannot_be_substituted_for_runner_failure(self):
        stage = {'stage': 'verify:runner', 'startedAt': '2026-11-02T11:06:00Z', 'completedAt': '2026-11-02T11:15:00Z'}
        own = {'id': 'runner', 'failure': 'CLEANUP_TIMEOUT', 'startedAt': '2026-11-02T11:07:46Z', 'completedAt': '2026-11-02T11:07:55Z'}
        other = {**own, 'id': 'e2e', 'startedAt': '2026-11-02T11:16:00Z', 'completedAt': '2026-11-02T11:16:09Z'}
        log = '\n'.join('AssertionError: ' + json.dumps(r, separators=(',', ':')) for r in [own, other])
        result, excluded = cleanup_timeouts(log, stage)
        self.assertEqual(result['id'], 'runner'); self.assertEqual(excluded[0]['id'], 'e2e')
        with self.assertRaisesRegex(ValueError, 'ONE_ORIGINAL_RUNNER'):
            cleanup_timeouts(json.dumps(other, separators=(',', ':')), stage)


if __name__ == '__main__':
    unittest.main(verbosity=2)
