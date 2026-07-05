"""Phase 3 Stage 2/6 — analysis-runner math + artifact honesty.

The S2/S3 jobs must compute the preregistered metrics exactly and refuse to
run under-sample. The kappa port must agree with the Node implementation's
golden values (server/test — perfect=1, chance≈0).
"""
import os
import sys
import unittest
import uuid

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs import agreement_s2, bias_audit, retest_s3, review_package, steering_s1  # noqa: E402


def _sid():
    return str(uuid.uuid4())


class TestS1Steering(unittest.TestCase):
    def _sessions(self, effect: float, n=70):
        """Synthetic arms: executive evidence rate = lite + effect."""
        rng = np.random.default_rng(42)
        sessions = {}
        for arm, base in (("executive", 0.5 + effect), ("lite", 0.5)):
            for _ in range(n):
                turns = []
                for _t in range(5):
                    levels = {}
                    for d in steering_s1.DIMENSIONS:
                        levels[d] = int(rng.integers(0, 5)) if rng.random() < base else "NA"
                    turns.append(levels)
                sessions[_sid()] = {"arm": arm, "turns": turns, "fallback": False}
        return sessions

    def test_positive_effect_detected(self):
        m = steering_s1.compute_steering(self._sessions(effect=0.25))
        self.assertEqual(m["conclusion"], "positive")
        self.assertGreater(m["arms"]["executive"]["mean_evidence_rate"], m["arms"]["lite"]["mean_evidence_rate"])
        memo = steering_s1.results_memo(m)
        self.assertIn("POSITIVE", memo)
        self.assertIn("does NOT support", memo)

    def test_null_effect_is_inconclusive_not_negative(self):
        m = steering_s1.compute_steering(self._sessions(effect=0.0))
        self.assertEqual(m["conclusion"], "inconclusive")

    def test_reversed_effect_reported_identically(self):
        m = steering_s1.compute_steering(self._sessions(effect=-0.25))
        self.assertEqual(m["conclusion"], "negative")
        self.assertIn("NEGATIVE", steering_s1.results_memo(m))

    def test_abandoned_sessions_excluded(self):
        sessions = self._sessions(effect=0.2)
        sessions[_sid()] = {"arm": "executive", "turns": [{}, {}], "fallback": False}  # <3 turns
        m = steering_s1.compute_steering(sessions)
        self.assertEqual(m["arms"]["executive"]["sessions"], 70)

    def test_mann_whitney_sane(self):
        _u, p_same = steering_s1.mann_whitney_u([1, 2, 3, 4, 5] * 20, [1, 2, 3, 4, 5] * 20)
        self.assertGreater(p_same, 0.5)
        _u2, p_diff = steering_s1.mann_whitney_u([5, 6, 7] * 30, [1, 2, 3] * 30)
        self.assertLess(p_diff, 0.001)

    def test_no_db_is_insufficient(self):
        env = os.environ.pop("DATABASE_URL", None)
        try:
            self.assertEqual(steering_s1.run()["status"], "insufficient_data")
        finally:
            if env is not None:
                os.environ["DATABASE_URL"] = env


class TestRegistryLoop(unittest.TestCase):
    """The Stage 2 → Stage 3 loop must be closed: every flag-map precondition
    field is written by exactly the job that computes that study."""

    def test_flagmap_fields_have_writers(self):
        import pathlib
        jobs_dir = pathlib.Path(__file__).resolve().parent.parent / "jobs"
        sources = {p.name: p.read_text(encoding="utf-8") for p in jobs_dir.glob("*.py")}
        # (study_key the flag map queries, detail/metric field it reads, writer job)
        loop = [
            ("steering_ab", "conclusion", "steering_s1.py"),
            ("human_llm_agreement", "non_inferior_all_dimensions", "agreement_s2.py"),
            ("test_retest", "all_dimensions_reliable", "retest_s3.py"),
            ("adversarial_evasion", "evasion_rate_at_5fpr", "relay_detect.py"),
            ("multilingual_dif", "adequately_powered", "dif_audit.py"),
            ("sim_to_real_transfer", "transfer_pearson_r", "transfer_corr.py"),
        ]
        for study_key, field, job in loop:
            src = sources[job]
            self.assertIn(study_key, src, f"{job} must target study {study_key}")
            self.assertIn(field, src, f"{job} must write the field {field} the flag map reads")
            self.assertIn("INSERT INTO study_results", src, f"{job} must write the registry")


class TestWeightedKappa(unittest.TestCase):
    def test_perfect_agreement_is_1(self):
        self.assertEqual(agreement_s2.weighted_kappa([0, 1, 2, 3, 4], [0, 1, 2, 3, 4]), 1.0)

    def test_far_disagreement_is_negative(self):
        self.assertLess(agreement_s2.weighted_kappa([0, 0, 0, 4, 4, 4], [4, 4, 4, 0, 0, 0]), 0)

    def test_near_agreement_beats_far(self):
        near = agreement_s2.weighted_kappa([2, 3, 1, 2], [3, 2, 2, 1])
        far = agreement_s2.weighted_kappa([0, 4, 0, 4], [4, 0, 4, 0])
        self.assertGreater(near, far)


class TestS2Agreement(unittest.TestCase):
    def _corpus(self, ai_quality: str):
        """60 sessions, 2 raters + panel. ai_quality: 'match' or 'noise'."""
        rng = np.random.default_rng(42)
        human, panel = [], []
        for _ in range(60):
            sid = _sid()
            for dim in agreement_s2.DIMENSIONS:
                truth = int(rng.integers(0, 5))
                r1 = truth
                r2 = int(np.clip(truth + rng.integers(-1, 2), 0, 4))
                human.append({"session_id": sid, "rater_id": "r1", "dimension": dim, "level": r1})
                human.append({"session_id": sid, "rater_id": "r2", "dimension": dim, "level": r2})
                ai = truth if ai_quality == "match" else int(rng.integers(0, 5))
                panel.append({"session_id": sid, "dimension": dim, "level": ai})
        return human, panel

    def test_matching_ai_is_non_inferior(self):
        m = agreement_s2.compute_agreement(*self._corpus("match"))
        self.assertEqual(m["double_rated_sessions"], 60)
        self.assertTrue(m["non_inferior_all_dimensions"], m["per_dimension"])

    def test_noise_ai_fails_non_inferiority(self):
        m = agreement_s2.compute_agreement(*self._corpus("noise"))
        self.assertFalse(m["non_inferior_all_dimensions"])
        # The memo names the blocked-dimension consequence.
        memo = agreement_s2.results_memo(m)
        self.assertIn("BLOCKED", memo)
        self.assertIn("does NOT support", memo)

    def test_no_db_is_insufficient(self):
        env = os.environ.pop("DATABASE_URL", None)
        try:
            self.assertEqual(agreement_s2.run()["status"], "insufficient_data")
        finally:
            if env is not None:
                os.environ["DATABASE_URL"] = env


class TestS3Retest(unittest.TestCase):
    def _pairs(self, r_high: bool, n=45):
        rng = np.random.default_rng(42)
        pairs = {}
        for _ in range(n):
            base = {d: float(rng.uniform(0.5, 3.5)) for d in retest_s3.DIMENSIONS}
            noise = 0.15 if r_high else 1.5
            second = {d: float(np.clip(v + rng.normal(0.1, noise), 0, 4)) for d, v in base.items()}
            pairs[_sid()] = [(1, base), (2, second)]
        return pairs

    def test_stable_scores_are_reliable(self):
        m = retest_s3.compute_retest(self._pairs(r_high=True))
        self.assertTrue(m["all_dimensions_reliable"], m["per_dimension"])
        for v in m["per_dimension"].values():
            self.assertGreaterEqual(v["r"], 0.7)
            self.assertIsNotNone(v["sem"])
            self.assertAlmostEqual(v["practice_shift"], 0.1, delta=0.15)

    def test_noisy_scores_fail_reliability(self):
        m = retest_s3.compute_retest(self._pairs(r_high=False))
        self.assertFalse(m["all_dimensions_reliable"])
        self.assertIn("does NOT support", retest_s3.results_memo(m))

    def test_no_db_is_insufficient(self):
        env = os.environ.pop("DATABASE_URL", None)
        try:
            self.assertEqual(retest_s3.run()["status"], "insufficient_data")
        finally:
            if env is not None:
                os.environ["DATABASE_URL"] = env


class TestArtifacts(unittest.TestCase):
    def test_bias_audit_pending_makes_no_claim(self):
        page = bias_audit.render(None, "2026-07-05")
        self.assertIn("PENDING", page)
        self.assertIn("No fairness claim is made", page)
        self.assertIn("default-off", page)

    def test_bias_audit_renders_flags_from_run(self):
        run = {"run_id": "abc", "created_at": "2026-11-01", "frozen": True,
               "inputs_summary": {"responses": 900},
               "outputs": {"groups_audited": ["language"], "flags": [{
                   "group": "language", "focal": "hi", "reference": "en",
                   "item_id": "11111111-2222", "dimension": "communication",
                   "ets_class": "B", "logistic": {"z_uniform": 2.4, "z_nonuniform": 0.3}}]}}
        page = bias_audit.render(run, "2026-11-02")
        self.assertIn("Items flagged (ETS B/C): **1**", page)
        self.assertIn("UNDERPOWERED", page)

    def test_review_package_pending_state(self):
        from jobs import tech_manual
        page = review_package.render(tech_manual.gather(None), [], "2026-07-05")
        self.assertIn("audit-export", page)
        self.assertGreaterEqual(page.count("PENDING"), 6)
        self.assertIn("content-hash", page)


if __name__ == "__main__":
    unittest.main()
