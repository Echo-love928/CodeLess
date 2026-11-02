"""Financial admission controls only: fixtures never invoke a model or spend money."""
import concurrent.futures
import json
import io
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import tarfile
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

    def binding_fixture(self):
        """Named synthetic group, never a real release or CI claim."""
        candidate = '7' * 40
        pieces = {'release/api/release.json': b'FIXTURE_API_MANIFEST',
                  'release/client/manifest.json': b'FIXTURE_CLIENT_MANIFEST',
                  'release/api/api.jar': b'FIXTURE_JAR',
                  'release/api/repository/infra/public/worker.py': b'FIXTURE_WORKER',
                  'release/image/runner-build-image.tar': b'FIXTURE_IMAGE'}
        selection = {'sourceCommit': candidate, 'manifestSha256': budget.sha(pieces['release/api/release.json']),
                     'clientManifestSha256': budget.sha(pieces['release/client/manifest.json']),
                     'apiJarSha256': budget.sha(pieces['release/api/api.jar']),
                     'worker': {'sha256': budget.sha(pieces['release/api/repository/infra/public/worker.py'])},
                     'image': {'id': 'sha256:' + 'a' * 64, 'sourceRevision': candidate, 'archive': {'sha256': budget.sha(pieces['release/image/runner-build-image.tar'])}},
                     'sharedSourceMismatches': []}
        def save(name, data):
            path = self.directory / name
            path.write_bytes(json.dumps(data).encode() if not isinstance(data, bytes) else data)
            return {'path': name, 'sha256': budget.sha(path.read_bytes())}
        selection_ref = save('FIXTURE-selection.json', selection)
        pieces['release/selection.json'] = (self.directory / selection_ref['path']).read_bytes()
        archive = self.directory / 'FIXTURE-group.tar'
        with tarfile.open(archive, 'w') as tar:
            for name, raw in pieces.items():
                member = tarfile.TarInfo(name); member.size = len(raw); tar.addfile(member, io.BytesIO(raw))
        archive_ref = {'path': archive.name, 'sha256': budget.sha(archive.read_bytes())}
        group = {'candidate': candidate, 'nativeExitCode': 0, 'mismatches': [], 'missing': [],
                 'archiveSha256': archive_ref['sha256'], 'membersVerified': len(pieces)}
        checks = [{'name': name, 'head_sha': candidate, 'status': 'completed', 'conclusion': 'success'} for name in
                  ('ci-gate', 'verify:static', 'verify:api', 'verify:runner', 'verify:e2e', 'infra-preflight')]
        state = budget.operate(self.directory, 'status')
        proof = {'ledgerId': state['ledgerId'], 'expectedRevision': state['revision'], 'expectedEventHead': state['eventHeadSha256'],
                 'fromCandidate': state['candidate'], 'fromArtifactSha256': state['artifactSha256'],
                 'selection': selection_ref, 'archive': archive_ref,
                 'groupVerification': save('FIXTURE-group-verification.json', group), 'checks': save('FIXTURE-checks.json', checks)}
        path = self.directory / 'FIXTURE-rebind.json'; path.write_text(json.dumps(proof))
        return path, proof

    def test_rebind_retains_unknown_spend_cap_claim_and_audit_history(self):
        self.claim()
        row = budget.operate(self.directory, 'reserve', sample='SHOW-01')
        before = self.settle(row, 'SHOW-01', {'mode': 'REAL', 'harnessError': 'FIXTURE_UNKNOWN_USAGE'}, 1)
        path, proof = self.binding_fixture()
        after = budget.operate(self.directory, 'rebind-candidate', evidence=str(path))
        for key in ('ledgerId', 'authorizationId', 'authorizedCapCny', 'entries', 'settledUpperCny', 'remainingAfterKnownExposureCny', 'bReconciled'):
            self.assertEqual(before[key], after[key], key)
        self.assertEqual(after['revision'], before['revision'] + 1)
        self.assertEqual(after['bindingHistory'][0]['eventHead'], before['eventHeadSha256'])
        self.assertEqual(after['candidate'], '7' * 40); self.assertFalse(after['releaseApproved'])
        with self.assertRaisesRegex(ValueError, 'NEVER_RETRY'):
            budget.operate(self.directory, 'reserve', sample='SHOW-01')
        new = budget.operate(self.directory, 'reserve', sample='SHOW-02')
        self.assertEqual(new['entries'][-1]['candidate'], '7' * 40)
        with self.assertRaisesRegex(ValueError, 'NATIVE_TERMINAL'):
            self.settle(new, 'SHOW-02', {'mode': 'REAL', 'harnessError': 'FIXTURE_UNKNOWN'}, 1)
        self.assertEqual(budget.operate(self.directory, 'status')['active'], new['reservationId'])
        native_path = self.directory / 'SHOW-02-native.json'
        native = json.loads(native_path.read_bytes()); native['candidate'] = '7' * 40
        native_path.write_text(json.dumps(native))
        settled = budget.operate(self.directory, 'settle', reservation=new['reservationId'],
                                 record=str(self.directory / 'SHOW-02.json'), native=str(native_path))
        self.assertEqual(settled['settledUpperCny'], '0.8')
        self.assertEqual(settled['remainingAfterKnownExposureCny'], '1.2')

    def test_rebind_rejects_active_and_stale_events_without_mutation(self):
        self.claim()
        path, proof = self.binding_fixture()
        row = budget.operate(self.directory, 'reserve', sample='SHOW-01')
        with self.assertRaisesRegex(ValueError, 'ACTIVE_PROCESS'):
            budget.operate(self.directory, 'rebind-candidate', evidence=str(path))
        self.settle(row, 'SHOW-01', {'mode': 'REAL', 'harnessError': 'FIXTURE_UNKNOWN'}, 1)
        before = budget.operate(self.directory, 'status')
        with self.assertRaisesRegex(ValueError, 'COMPARE_AND_SWAP'):
            budget.operate(self.directory, 'rebind-candidate', evidence=str(path))
        self.assertEqual(before, budget.operate(self.directory, 'status'))

    def test_rebind_rejects_corruption_and_neutral_checks_without_mutation(self):
        self.claim(); path, proof = self.binding_fixture()
        before = budget.operate(self.directory, 'status')
        archive = self.directory / proof['archive']['path']; original = archive.read_bytes(); archive.write_bytes(original + b'TAMPER')
        with self.assertRaisesRegex(ValueError, 'DIGEST_MISMATCH'):
            budget.operate(self.directory, 'rebind-candidate', evidence=str(path))
        archive.write_bytes(original)
        checks_path = self.directory / proof['checks']['path']; checks = json.loads(checks_path.read_bytes()); checks[0]['conclusion'] = 'neutral'
        checks_path.write_text(json.dumps(checks)); proof['checks']['sha256'] = budget.sha(checks_path.read_bytes()); path.write_text(json.dumps(proof))
        with self.assertRaisesRegex(ValueError, 'SIX_SUCCESS'):
            budget.operate(self.directory, 'rebind-candidate', evidence=str(path))
        self.assertEqual(before, budget.operate(self.directory, 'status'))

    def test_rebind_rejects_relabelled_archive(self):
        self.claim(); path, proof = self.binding_fixture()
        before = budget.operate(self.directory, 'status')
        selection_path = self.directory / proof['selection']['path']
        selection = json.loads(selection_path.read_bytes())
        selection['apiJarSha256'] = '0' * 64
        selection_path.write_text(json.dumps(selection))
        proof['selection']['sha256'] = budget.sha(selection_path.read_bytes()); path.write_text(json.dumps(proof))
        with self.assertRaisesRegex(ValueError, 'COMPONENT_MISMATCH'):
            budget.operate(self.directory, 'rebind-candidate', evidence=str(path))
        self.assertEqual(before, budget.operate(self.directory, 'status'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
