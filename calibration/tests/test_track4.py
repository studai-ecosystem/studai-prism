"""Track 4 gate — DIF language groups on synthetic data, transfer correlation
math, and the Technical Manual's honesty guarantees.

    cd calibration
    python -m pytest tests/test_track4.py
"""
import os
import sys
import unittest
import uuid

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs import dif_audit, tech_manual, transfer_corr  # noqa: E402


def _sid():
    return str(uuid.uuid4())


class TestDifLanguage(unittest.TestCase):
    """T4.2 gate: the DIF job accepts language-group input and runs end-to-end
    on SYNTHETIC data (never persisted; labels marked synthetic here)."""

    def _synthetic(self, biased: bool):
        rng = np.random.default_rng(42)
        items = [str(uuid.uuid4()) for _ in range(5)]  # item[0] carries the planted DIF
        rows, demo = [], {}
        for lang in ("en", "hi"):
            for _ in range(60):
                sid = _sid()
                demo[sid] = {"language": lang}  # synthetic-labeled group membership
                ability = int(rng.integers(1, 4))  # 1..3, same distribution per group
                for i, item in enumerate(items):
                    lv = max(0, min(4, ability + int(rng.integers(-1, 2))))
                    if biased and i == 0 and lang == "hi":
                        lv = max(0, ability - 2)  # planted uniform DIF on ONE item
                    rows.append({
                        "session_id": sid, "item_id": item,
                        "micro_levels": {"criticalThinking": lv},
                    })
        return rows, demo, items

    def test_language_group_is_audited(self):
        self.assertIn("language", dif_audit.GROUPS)

    def test_planted_language_dif_is_flagged(self):
        rows, demo, items = self._synthetic(biased=True)
        findings = dif_audit.compute_dif(rows, demo)
        lang_flags = [f for f in findings if f["group"] == "language"]
        self.assertTrue(lang_flags, "planted DIF must be flagged")
        self.assertIn(items[0], [f["item_id"] for f in lang_flags], "the biased item is the one flagged")
        self.assertIn(lang_flags[0]["ets_class"], ("B", "C"))
        self.assertEqual({lang_flags[0]["focal"], lang_flags[0]["reference"]}, {"en", "hi"})

    def test_unbiased_synthetic_is_clean(self):
        rows, demo, _items = self._synthetic(biased=False)
        findings = dif_audit.compute_dif(rows, demo)
        self.assertEqual([f for f in findings if f["group"] == "language"], [])

    def test_no_db_is_insufficient(self):
        env = os.environ.pop("DATABASE_URL", None)
        try:
            self.assertEqual(dif_audit.run()["status"], "insufficient_data")
        finally:
            if env is not None:
                os.environ["DATABASE_URL"] = env


class TestTransferCorr(unittest.TestCase):
    """T4.3: correlation math + refusal to correlate noise."""

    def test_perfect_correlation(self):
        pairs = [(float(i), float(i) * 0.8 + 10) for i in range(40)]
        m = transfer_corr.correlate(pairs)
        self.assertEqual(m["n"], 40)
        self.assertAlmostEqual(m["pearson_r"], 1.0, places=3)
        self.assertAlmostEqual(m["spearman_rho"], 1.0, places=3)

    def test_monotone_nonlinear_spearman(self):
        pairs = [(float(i), float(i ** 3)) for i in range(1, 41)]
        m = transfer_corr.correlate(pairs)
        self.assertAlmostEqual(m["spearman_rho"], 1.0, places=3)
        self.assertLess(m["pearson_r"], 1.0)

    def test_no_db_is_insufficient(self):
        env = os.environ.pop("DATABASE_URL", None)
        try:
            self.assertEqual(transfer_corr.run()["status"], "insufficient_data")
        finally:
            if env is not None:
                os.environ["DATABASE_URL"] = env


class TestTechManual(unittest.TestCase):
    """T4.4: the manual renders from data and shows unrun studies as PENDING."""

    def test_empty_db_renders_all_pending(self):
        data = tech_manual.gather(None)
        manual = tech_manual.render(data, "2026-07-05")
        for _, title in tech_manual.STUDIES:
            self.assertIn(title, manual)
        # Every study section is PENDING; no fabricated numbers anywhere.
        self.assertGreaterEqual(manual.count("**PENDING**"), len(tech_manual.STUDIES))
        self.assertIn("content-hash", manual)
        self.assertIn("provisional/uncalibrated", manual)
        self.assertIn("advisory only", manual)

    def test_results_render_only_from_data(self):
        data = tech_manual.gather(None)
        data["studies"]["multilingual_dif"] = {
            "registered": {"study_key": "multilingual_dif", "status": "complete", "title": "x"},
            "results": [{"metric_name": "flagged_fraction", "value": 0.02, "n": 300,
                         "analysis_version": "dif-v1", "created_at": "2026-09-01"}],
        }
        manual = tech_manual.render(data, "2026-07-05")
        self.assertIn("`flagged_fraction` = **0.02**", manual)
        # The other five studies remain PENDING — a result for one study can
        # never soften the honesty of the rest.
        self.assertGreaterEqual(manual.count("**PENDING**"), len(tech_manual.STUDIES) - 1)

    def test_hand_edit_is_detectable(self):
        manual = tech_manual.render(tech_manual.gather(None), "2026-07-05")
        body, tail = manual.rsplit("\n---\ncontent-hash:", 1)
        import hashlib
        digest = hashlib.sha256(body.encode("utf-8")).hexdigest()[:16]
        self.assertIn(digest, tail)
        edited = body.replace("**PENDING**", "**VALIDATED**", 1)
        self.assertNotEqual(hashlib.sha256(edited.encode("utf-8")).hexdigest()[:16], digest)


if __name__ == "__main__":
    unittest.main()
