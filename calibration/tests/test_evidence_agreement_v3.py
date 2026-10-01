"""Campus C12.01 — V3 evidence agreement job on SYNTHETIC fixtures only.

Every rating below is generated in this file; none describes a real person.
"""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs import evidence_agreement_v3 as job  # noqa: E402


def synthetic(n_items, levels_a, levels_b=None, ai=None, cap="CAP-L1-REASONING"):
    items, ratings = [], []
    for i in range(n_items):
        iid = f"syn-item-{cap}-{i}"
        items.append({"id": iid, "capability_id": cap, "ai_level": None if ai is None else ai[i]})
        ratings.append({"item_id": iid, "rater_id": "syn-rater-a", "level": levels_a[i], "cannot_rate": False, "created_at": f"2026-10-01T00:00:{i % 60:02d}Z"})
        if levels_b is not None:
            ratings.append({"item_id": iid, "rater_id": "syn-rater-b", "level": levels_b[i], "cannot_rate": False, "created_at": f"2026-10-02T00:00:{i % 60:02d}Z"})
    return items, ratings


class TestIcc(unittest.TestCase):
    def test_shrout_fleiss_reference(self):
        # Shrout & Fleiss (1979) Table 2: 6 targets x 4 judges, ICC(2,1) = .29.
        data = [[9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8], [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7]]
        self.assertAlmostEqual(job.icc_2_1(data), 0.29, places=2)

    def test_perfect_and_degenerate(self):
        self.assertEqual(job.icc_2_1([[1, 1], [3, 3], [5, 5]]), 1.0)
        self.assertTrue(np.isnan(job.icc_2_1([[1, 2]])))


class TestCompute(unittest.TestCase):
    def test_perfect_agreement(self):
        rng = np.random.default_rng(1)
        a = [int(x) for x in rng.integers(1, 6, 40)]
        items, ratings = synthetic(40, a, a, ai=a)
        m = job.compute(items, ratings)["capabilities"]["CAP-L1-REASONING"]
        self.assertEqual(m["human_human"]["kappa"], 1.0)
        self.assertEqual(m["human_human"]["icc_2_1"], 1.0)
        self.assertEqual(m["human_ai"]["kappa"], 1.0)

    def test_independent_raters_near_zero(self):
        rng = np.random.default_rng(7)
        a = [int(x) for x in rng.integers(1, 6, 400)]
        b = [int(x) for x in rng.integers(1, 6, 400)]
        m = job.compute(*synthetic(400, a, b))["capabilities"]["CAP-L1-REASONING"]
        self.assertLess(abs(m["human_human"]["kappa"]), 0.15)

    def test_fails_closed_below_minimum(self):
        a = [3] * 29
        m = job.compute(*synthetic(29, a, a, ai=a))
        cap = m["capabilities"]["CAP-L1-REASONING"]
        self.assertIsNone(cap["human_human"]["kappa"])
        self.assertIsNone(cap["human_human"]["icc_2_1"])
        self.assertEqual(cap["human_human"]["status"], "insufficient_data")
        self.assertEqual(m["claim_status"], "PENDING")

    def test_cannot_rate_excluded_and_single_rating_not_a_pair(self):
        items, ratings = synthetic(35, [4] * 35, [4] * 35, ai=[4] * 35)
        for r in ratings:
            if r["rater_id"] == "syn-rater-b" and r["item_id"].endswith(("-0", "-1")):
                r["cannot_rate"], r["level"] = True, None
        cap = job.compute(items, ratings)["capabilities"]["CAP-L1-REASONING"]
        self.assertEqual(cap["human_human"]["pairs"], 33)
        self.assertEqual(cap["human_ai"]["pairs"], 35)

    def test_no_database_is_insufficient(self):
        saved = os.environ.pop("DATABASE_URL", None)
        try:
            self.assertEqual(job.run()["status"], "insufficient_data")
        finally:
            if saved is not None:
                os.environ["DATABASE_URL"] = saved


if __name__ == "__main__":
    unittest.main()
