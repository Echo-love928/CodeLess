"""D30 release evidence guards; no network, models, deployment or credentials."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class CiEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.head = 'a' * 40
        self.rows = [{'name': n, 'head_sha': self.head, 'status': 'completed', 'conclusion': 'success'}
                     for n in audit.REQUIRED]

    def test_exact_complete_success(self):
        self.assertTrue(audit.check_ci(self.head, self.rows, len(self.rows)))

    def test_missing_required_check(self):
        self.assertFalse(audit.check_ci(self.head, self.rows[:-1], len(self.rows) - 1))

    def test_old_commit_success_is_not_current(self):
        self.rows[0]['head_sha'] = 'b' * 40
        self.assertFalse(audit.check_ci(self.head, self.rows, len(self.rows)))

    def test_every_non_success_conclusion_rejected(self):
        for conclusion in ['failure', 'cancelled', 'skipped', 'neutral', 'timed_out', None]:
            with self.subTest(conclusion=conclusion):
                self.rows[0]['conclusion'] = conclusion
                self.assertFalse(audit.check_ci(self.head, self.rows, len(self.rows)))

    def test_running_is_not_success(self):
        self.rows[0]['status'] = 'in_progress'
        self.assertFalse(audit.check_ci(self.head, self.rows, len(self.rows)))

    def test_success_cannot_hide_failed_duplicate(self):
        rows = self.rows + [{**self.rows[0], 'conclusion': 'failure'}]
        self.assertFalse(audit.check_ci(self.head, rows, len(rows)))

    def test_truncated_page_is_not_complete(self):
        self.assertFalse(audit.check_ci(self.head, self.rows, 101))

    def test_empty_response_is_not_zero_success(self):
        self.assertFalse(audit.check_ci(self.head, [], 0))

    def test_count_mismatch_is_not_complete(self):
        self.assertFalse(audit.check_ci(self.head, self.rows, 0))


if __name__ == '__main__':
    unittest.main(verbosity=2)
