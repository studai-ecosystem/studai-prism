"""Pure-function tests for the calibration jobs (no DB required).

    cd calibration
    python -m pytest        # or: python -m unittest discover -s tests
"""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs import conformal_refresh, dif_audit, equate, irt_fit, rasch_facets, reliability  # noqa: E402


class TestIrt(unittest.TestCase):
    def test_difficulty_monotonic(self):
        easy = irt_fit.item_difficulty([4, 4, 3, 4])   # high levels -> easy -> low b
        hard = irt_fit.item_difficulty([0, 1, 0, 1])   # low levels  -> hard -> high b
        self.assertLess(easy, hard)

    def test_discrimination_bounds(self):
        a = irt_fit.item_discrimination([0, 1, 2, 3, 4], [0, 1, 2, 3, 4])
        self.assertGreaterEqual(a, 0.3)
        self.assertLessEqual(a, 2.5)

    def test_discrimination_flat(self):
        # no variance -> default discrimination
        self.assertEqual(irt_fit.item_discrimination([2, 2, 2], [2, 2, 2]), 1.0)

    def test_infit_perfect(self):
        # responses exactly at the expected level give zero misfit
        f = irt_fit.infit([2, 2, 2, 2], [0, 0, 0, 0], b=0.0, a=1.0)
        self.assertEqual(f, 0.0)

    def test_infit_underfit(self):
        # high-ability candidates the model expects to ace, but who score 0,
        # produce surprising residuals against a small model variance -> infit>1
        f = irt_fit.infit([0, 0, 0], [3, 3, 3], b=0.0, a=2.0)
        self.assertGreater(f, 1.0)


class TestRasch(unittest.TestCase):
    def test_to_logit_monotonic(self):
        self.assertLess(rasch_facets.to_logit(1), rasch_facets.to_logit(3))

    def test_facets_recover_candidate_order(self):
        # two candidates: A always high, B always low, same items/judges
        recs = []
        for scen in ["s1", "s2"]:
            recs.append({"candidate": "A", "item": f"{scen}:d", "scenario": scen, "judge": "j1",
                         "y": rasch_facets.to_logit(4)})
            recs.append({"candidate": "B", "item": f"{scen}:d", "scenario": scen, "judge": "j1",
                         "y": rasch_facets.to_logit(1)})
        facets = rasch_facets.estimate_facets(recs)
        self.assertGreater(facets["candidate_theta"]["A"], facets["candidate_theta"]["B"])


class TestEquate(unittest.TestCase):
    def test_kappa_centers(self):
        means = {"easy": 70.0, "hard": 50.0}
        grand = 60.0
        k = equate.kappa_table(means, grand)
        self.assertAlmostEqual(k["easy"], -10.0)
        self.assertAlmostEqual(k["hard"], 10.0)


class TestDif(unittest.TestCase):
    def test_no_dif_identical_groups(self):
        # identical 2x2 cells -> OR ~ 1 -> class A
        strata = [(10, 10, 10, 10, 40), (8, 8, 8, 8, 32)]
        or_mh, chi = dif_audit.mh_odds_ratio(strata)
        self.assertAlmostEqual(or_mh, 1.0, places=3)
        self.assertEqual(dif_audit.ets_class(or_mh, chi), "A")

    def test_large_dif_flagged(self):
        # focal much more likely correct -> large OR, big strata -> class B/C
        strata = [(45, 5, 5, 45, 100), (40, 5, 5, 40, 90)]
        or_mh, chi = dif_audit.mh_odds_ratio(strata)
        self.assertGreater(or_mh, 1.0)
        self.assertIn(dif_audit.ets_class(or_mh, chi), ("B", "C"))


class TestReliability(unittest.TestCase):
    def test_g_coefficient_high_when_person_dominates(self):
        vc = {"var_person": 1.0, "var_scenario": 0.0, "var_residual": 0.1}
        g = reliability.g_coefficient(vc, n_scenarios=4)
        self.assertGreater(g, 0.9)

    def test_variance_components_nonneg(self):
        matrix = {("p1", "s1"): 4, ("p1", "s2"): 3, ("p2", "s1"): 1, ("p2", "s2"): 2}
        vc = reliability.variance_components(matrix, ["p1", "p2"], ["s1", "s2"])
        for v in vc.values():
            self.assertGreaterEqual(v, 0.0)


class TestConformal(unittest.TestCase):
    def test_quantile_coverage(self):
        nonconf = list(range(0, 100))  # 0..99
        q = conformal_refresh.conformal_quantile(nonconf, coverage=0.9)
        self.assertGreaterEqual(q, 85)
        self.assertLessEqual(q, 99)

    def test_empty_fallback(self):
        self.assertEqual(conformal_refresh.conformal_quantile([]),
                         conformal_refresh.FALLBACK_HALF_WIDTH)


if __name__ == "__main__":
    unittest.main()
