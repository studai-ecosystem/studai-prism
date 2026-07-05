"""Track 3.3 gate — the relay-detection pipeline runs END-TO-END on
synthetic-labeled data (is_synthetic=true) and ships nothing.

    cd calibration
    python -m pytest tests/test_relay_detect.py
"""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs import relay_detect  # noqa: E402


class TestRelayDetect(unittest.TestCase):
    def test_synthetic_pipeline_end_to_end(self):
        out = relay_detect.run(synthetic=True, seed=42)
        self.assertEqual(out["status"], "synthetic_selftest_ok")
        # RULE 3: the output is explicitly marked synthetic and never persisted.
        self.assertTrue(out["is_synthetic"])
        self.assertIsNone(out.get("run_id"))
        # The pipeline learned SOMETHING from separable synthetic arms —
        # this asserts plumbing, not a real-world detection claim.
        self.assertGreater(out["roc_auc"], 0.8)
        self.assertIsNotNone(out["evasion_rate_at_5fpr"])
        self.assertLessEqual(out["evasion_rate_at_5fpr"], 1.0)
        # FPR budget respected on the honest arm.
        self.assertLessEqual(out["honest_flagged"], max(1, int(0.05 * out["honest_total"]) + 1))

    def test_deterministic(self):
        a = relay_detect.run(synthetic=True, seed=42)
        b = relay_detect.run(synthetic=True, seed=42)
        self.assertEqual(a["roc_auc"], b["roc_auc"])
        self.assertEqual(a["evasion_rate_at_5fpr"], b["evasion_rate_at_5fpr"])

    def test_no_db_is_insufficient_not_fabricated(self):
        env = os.environ.pop("DATABASE_URL", None)
        try:
            out = relay_detect.run(synthetic=False)
            self.assertEqual(out["status"], "insufficient_data")
        finally:
            if env is not None:
                os.environ["DATABASE_URL"] = env

    def test_evasion_metric_math(self):
        # 10 honest (scores 0.0..0.09), 10 assisted (0.5..0.59): perfectly
        # separable -> zero evasion at any sane FPR budget.
        y = np.array([0] * 10 + [1] * 10)
        s = np.array([i / 100 for i in range(10)] + [0.5 + i / 100 for i in range(10)])
        m = relay_detect.evasion_at_fpr(y, s)
        self.assertEqual(m["evasion_rate_at_5fpr"], 0.0)
        self.assertEqual(m["honest_flagged"], 0)
        self.assertEqual(relay_detect.roc_auc(y, s), 1.0)


if __name__ == "__main__":
    unittest.main()
