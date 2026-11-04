import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('client_audit', Path(__file__).with_name('audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class LinkChecks(unittest.TestCase):
    def test_delivery_preserves_failed_quality_and_all_task_ids(self):
        import json
        import re
        text = (audit.ROOT / 'docs/delivery/index.md').read_text(encoding='utf-8')
        quality = json.loads((audit.ROOT / audit.FINAL / 'quality.json').read_text(encoding='utf-8'))
        score = quality['incrementalRequirements']
        self.assertIn(f"增量组合{score['passed']}/{score['denominator']}", text)
        for failed in quality['retainedFailedRequirementIds']:
            self.assertIn(failed, text)
        ids = set(re.findall(r'D\d{2}-[AB]', text))
        self.assertEqual(ids, {f'D{d:02}-{m}' for d in range(1, 31) for m in 'AB'})
        self.assertIn('完成率保持UNKNOWN', text)
        self.assertIn('不计未完成或阻塞', text)

    def test_missing_file_is_failure(self):
        with tempfile.TemporaryDirectory(dir=audit.ROOT / '.local-data') as folder:
            root = Path(folder)
            (root / 'doc.md').write_text('[missing](absent.md)', encoding='utf-8')
            self.assertFalse(all(c['passed'] for c in audit.inspect_links(root, ['doc.md'])))

    def test_existing_file_and_fragment(self):
        with tempfile.TemporaryDirectory(dir=audit.ROOT / '.local-data') as folder:
            root = Path(folder)
            (root / 'doc.md').write_text('[ok](target.md#section) [web](https://example.com)', encoding='utf-8')
            (root / 'target.md').write_text('# section', encoding='utf-8')
            result = audit.inspect_links(root, ['doc.md'])
            self.assertEqual(len(result), 1)
            self.assertTrue(result[0]['passed'])


if __name__ == '__main__':
    unittest.main()
