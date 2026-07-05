"""Phase 3 — evidence one-pager honesty guarantees."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs import evidence_onepager, tech_manual  # noqa: E402


class TestOnePager(unittest.TestCase):
    def test_empty_registry_renders_all_pending(self):
        page = evidence_onepager.render(tech_manual.gather(None), "2026-07-05")
        self.assertEqual(page.count("PENDING — no claim is made"), len(evidence_onepager.ROWS))
        self.assertIn("nothing stronger", page)
        self.assertIn("content-hash", page)
        # No fabricated numbers: the only digits are dates/hash, no metric values.
        self.assertNotIn("κ=0", page)

    def test_result_renders_only_from_registry(self):
        data = tech_manual.gather(None)
        data["studies"]["test_retest"] = {
            "registered": {"study_key": "test_retest", "status": "complete", "title": "x"},
            "results": [{"metric_name": "reliability_r", "value": 0.81, "n": 45,
                         "analysis_version": "s3-v1", "created_at": "2026-11-01"}],
        }
        page = evidence_onepager.render(data, "2026-07-05")
        self.assertIn("reliability_r = 0.81", page)
        self.assertEqual(page.count("PENDING — no claim is made"), len(evidence_onepager.ROWS) - 1)


if __name__ == "__main__":
    unittest.main()
