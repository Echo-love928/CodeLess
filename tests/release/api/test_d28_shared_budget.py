"""Financial admission controls only: fixtures never invoke a model or spend money."""
import concurrent.futures
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import d28_shared_budget as budget


class SharedBudgetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        opening = self.directory / 'opening.json'
        opening.write_text(json.dumps({'candidate': budget.CANDIDATE, 'authorizedCapCny': '2',
                                       'modelRequests': 0, 'spentCny': '0'}))
        budget.operate(self.directory, 'init', opening=str(opening))

    def tearDown(self):
        self.temp.cleanup()

    def claim(self):
        inventory = self.directory / 'b-inventory.json'
        inventory.write_text('{"fixture":"B verified no prior paid requests or active jobs"}')
        proof = self.directory / 'b-proof.json'
        proof.write_text(json.dumps({'candidate': budget.CANDIDATE, 'artifactSha256': budget.ARTIFACT,
                                    'priorPaidRequests': 0, 'activePaidJobs': 0, 'priorSpentUpperCny': '0',
                                    'measurementSource': 'NAMED_TEST_FIXTURE_NOT_REAL_ACCOUNT',
                                    'evidence': [{'path': inventory.name, 'sha256': budget.sha(inventory.read_bytes())}]}))
        return budget.operate(self.directory, 'claim-b', evidence=str(proof))

    def settle(self, row, sample, record, native_exit=0):
        record['sampleId'] = sample
        path = self.directory / (sample + '.json')
        path.write_text(json.dumps(record))
        proof = self.directory / (sample + '-native.json')
        proof.write_text(json.dumps({'candidate': budget.CANDIDATE, 'reservationId': row['reservationId'],
                                    'sampleId': sample, 'processEnded': True, 'nativeExitCode': native_exit,
                                    'recordSha256': budget.sha(path.read_bytes())}))
        return budget.operate(self.directory, 'settle', reservation=row['reservationId'], record=str(path), native=str(proof))

    def test_unknown_b_is_not_zero_and_init_cannot_reset(self):
        status = budget.operate(self.directory, 'status')
        self.assertEqual(status['priorBUsage'], 'UNKNOWN')
        self.assertEqual(status['spendableCny'], '0')
        with self.assertRaisesRegex(ValueError, 'RECONCILIATION'):
            budget.operate(self.directory, 'reserve', sample='SHOW-01')
        with self.assertRaises(FileExistsError):
            budget.operate(self.directory, 'init', opening=str(self.directory / 'opening.json'))
        self.assertEqual(self.claim()['spendableCny'], '2')

    def test_cross_process_race_admits_exactly_one(self):
        self.claim()
        script = str(Path(budget.__file__).resolve())
        commands = [[sys.executable, '-B', script, '--directory', str(self.directory), 'reserve', '--sample', name]
                    for name in ('SHOW-01', 'SHOW-02')]
        with concurrent.futures.ThreadPoolExecutor() as pool:
            results = list(pool.map(lambda c: subprocess.run(c, capture_output=True), commands))
        self.assertEqual(sorted(r.returncode for r in results), [0, 2])
        status = budget.operate(self.directory, 'status')
        self.assertEqual(len(status['entries']), 1)
        self.assertEqual(status['reservedUpperCny'], '0.4')
        self.assertEqual(status['spendableCny'], '0')
        self.assertEqual(json.loads((self.directory / 'budget-ledger.json').read_text(encoding='utf-8'))['revision'], status['revision'])

    def test_unknown_failed_calls_exhaust_cap_without_retry(self):
        self.claim()
        for sample in ('SHOW-01', 'SHOW-02', 'SHOW-03', 'TASK-01', 'TASK-02'):
            row = budget.operate(self.directory, 'reserve', sample=sample)
            self.assertTrue(row['admitted'])
            result = self.settle(row, sample, {'mode': 'REAL', 'harnessError': 'FIXTURE_USAGE_UNKNOWN'}, 1)
            self.assertIsNone(result['entries'][-1]['actualCny'])
        self.assertEqual(result['remainingAfterKnownExposureCny'], '0')
        denied = budget.operate(self.directory, 'reserve', sample='TASK-03')
        self.assertFalse(denied['admitted'])
        with self.assertRaisesRegex(ValueError, 'NEVER_RETRY'):
            budget.operate(self.directory, 'reserve', sample='TASK-03')

    def test_failed_known_usage_is_charged_and_tamper_is_rejected(self):
        self.claim()
        row = budget.operate(self.directory, 'reserve', sample='SHOW-01')
        record = {'mode': 'REAL', 'harnessError': None, 'journal': [{'kind': 'model.request'}],
                  'modelCalls': [{'provider': 'deepseek', 'model': 'deepseek-flash', 'status': 'FAILED',
                                  'inputTokens': 1000, 'outputTokens': 100}]}
        result = self.settle(row, 'SHOW-01', record, 1)
        self.assertEqual(result['settledUpperCny'], '0.0028')
        self.assertEqual(result['remainingAfterKnownExposureCny'], '1.9972')
        connection = sqlite3.connect(self.directory / 'budget-ledger.sqlite3')
        try:
            connection.execute("UPDATE ledger SET payload=replace(payload,'KNOWN_ZERO','FALSE_ZERO')")
            connection.commit()
        finally:
            connection.close()
        with self.assertRaisesRegex(ValueError, 'STATE_CHAIN_MISMATCH'):
            budget.operate(self.directory, 'status')

    def test_unconfirmed_process_keeps_active_reservation(self):
        self.claim()
        row = budget.operate(self.directory, 'reserve', sample='SHOW-01')
        record = self.directory / 'record.json'; record.write_text('{"sampleId":"SHOW-01"}')
        proof = self.directory / 'native.json'; proof.write_text('{"processEnded":false}')
        with self.assertRaisesRegex(ValueError, 'NATIVE_TERMINAL'):
            budget.operate(self.directory, 'settle', reservation=row['reservationId'], record=str(record), native=str(proof))
        self.assertEqual(budget.operate(self.directory, 'status')['active'], row['reservationId'])

    def test_projection_omits_private_content_and_preserves_unknown(self):
        source = self.directory / 'private-record.json'
        secret = 'NAMED_TEST_CREDENTIAL_NOT_REAL'
        source.write_text(json.dumps({'sampleId': 'SHOW-01', 'mode': 'REAL', 'harnessError': secret,
                                     'prompt': secret, 'source': secret, 'modelCalls': [], 'journal': []}))
        output = self.directory / 'usage.json'
        budget.project_usage(source, output)
        self.assertNotIn(secret.encode(), output.read_bytes())
        self.assertEqual(budget.exposure(json.loads(output.read_bytes()))['upperNanos'], budget.RESERVATION)
        with self.assertRaises(FileExistsError):
            budget.project_usage(source, output)


if __name__ == '__main__':
    unittest.main(verbosity=2)
