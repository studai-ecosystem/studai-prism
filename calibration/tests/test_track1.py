"""Track 1 gate — cohort growth job math; plus the logistic DIF addition.

    cd calibration
    python -m pytest tests/test_track1.py
"""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs import dif_audit, growth_curve  # noqa: E402


class TestGrowthCurve(unittest.TestCase):
    def test_weighted_growth_recovers_slope(self):
        pts = [(n, 1.0 + 0.5 * n, 0.3) for n in range(1, 5)]
        slope, slope_se, n = growth_curve.weighted_growth(pts)
        self.assertAlmostEqual(slope, 0.5, places=6)
        self.assertEqual(n, 4)
        self.assertGreater(slope_se, 0)

    def test_high_se_point_downweighted(self):
        base = [(n, 1.0 + 0.5 * n, 0.3) for n in range(1, 4)]
        trusted = growth_curve.weighted_growth(base + [(4, 0.2, 0.3)])[0]
        distrusted = growth_curve.weighted_growth(base + [(4, 0.2, 5.0)])[0]
        self.assertLess(abs(distrusted - 0.5), abs(trusted - 0.5))

    def test_degenerate_inputs(self):
        self.assertIsNone(growth_curve.weighted_growth([(1, 2.0, 0.3)]))
        self.assertIsNone(growth_curve.weighted_growth([(1, 2.0, 0.0), (2, 2.5, 0.0)]))

    def test_no_db_is_insufficient(self):
        env = os.environ.pop("DATABASE_URL", None)
        try:
            self.assertEqual(growth_curve.run()["status"], "insufficient_data")
        finally:
            if env is not None:
                os.environ["DATABASE_URL"] = env

    def test_thresholds_match_growth_md(self):
        # GROWTH.md promises these exact numbers; the job must agree.
        self.assertEqual(growth_curve.MIN_POINTS, 3)
        self.assertEqual(growth_curve.COHORT_MIN, 20)
        self.assertEqual(growth_curve.ANALYSIS_VERSION, "growth-v1")


class TestLogisticDif(unittest.TestCase):
    def test_uniform_dif_detected(self):
        rng = np.random.default_rng(42)
        n = 400
        ability = rng.normal(0, 1, n)
        group = (rng.random(n) < 0.5).astype(float)
        # Focal group systematically disadvantaged on this item (uniform DIF).
        logit = 1.2 * ability - 1.5 * group
        correct = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(float)
        out = dif_audit.logistic_dif(ability, group, correct)
        self.assertTrue(out["uniform_flag"], out)

    def test_clean_item_not_flagged(self):
        rng = np.random.default_rng(42)
        n = 400
        ability = rng.normal(0, 1, n)
        group = (rng.random(n) < 0.5).astype(float)
        logit = 1.2 * ability  # no group effect at all
        correct = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(float)
        out = dif_audit.logistic_dif(ability, group, correct)
        self.assertFalse(out["uniform_flag"], out)

    def test_findings_carry_logistic_block(self):
        # Reuse the planted-DIF synthetic dataset from the track4 tests.
        from tests.test_track4 import TestDifLanguage
        rows, demo, items = TestDifLanguage()._synthetic(biased=True)
        findings = dif_audit.compute_dif(rows, demo)
        flagged = [f for f in findings if f["group"] == "language" and f["item_id"] == items[0]]
        self.assertTrue(flagged)
        self.assertIn("logistic", flagged[0])
        self.assertIn("z_uniform", flagged[0]["logistic"])


if __name__ == "__main__":
    unittest.main()
