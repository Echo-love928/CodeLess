"""D28-T1: negative controls for evidence acceptance, not product acceptance."""
import unittest
from d28_audit import REQUIRED, all_checks_success


class ExactCandidateChecksTest(unittest.TestCase):
    def checks(self):
        return [{'name': name, 'status': 'completed', 'conclusion': 'success'} for name in sorted(REQUIRED)]

    def test_all_six_real_successes_on_exact_head_are_required(self):
        self.assertTrue(all_checks_success('a' * 40, self.checks(), 'a' * 40))
        self.assertFalse(all_checks_success('b' * 40, self.checks(), 'a' * 40))

    def test_skip_neutral_unknown_failure_and_cancellation_cannot_replace_success(self):
        for result in ('skipped', 'neutral', None, 'failure', 'cancelled', 'timed_out', 'action_required'):
            with self.subTest(result=result):
                checks = self.checks()
                checks[0]['conclusion'] = result
                self.assertFalse(all_checks_success('a' * 40, checks, 'a' * 40))

    def test_pending_or_missing_check_remains_incomplete(self):
        checks = self.checks()
        checks[0]['status'] = 'in_progress'
        self.assertFalse(all_checks_success('a' * 40, checks, 'a' * 40))
        self.assertFalse(all_checks_success('a' * 40, self.checks()[:-1], 'a' * 40))

    def test_duplicate_name_cannot_hide_absent_gate(self):
        checks = self.checks()
        checks[0] = checks[1].copy()
        self.assertFalse(all_checks_success('a' * 40, checks, 'a' * 40))


if __name__ == '__main__':
    unittest.main(verbosity=2)
