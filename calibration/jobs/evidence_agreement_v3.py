"""V3 evidence agreement — human-human and human-AI on evidence units (Campus C12.01).

Data: the blinded double-rating queue (0039): ``evidence_rating_items`` (one
per evidence unit; AI level kept, never shown to raters) and append-only
``evidence_unit_ratings`` (rubric level 1-5 or "cannot rate").

Metrics per capability:
  * quadratically-weighted Cohen's kappa, human-human (first two independent
    ratings of an item) and human-AI (first human rating vs the AI level) —
    the same statistic as server/lib/kappa.js and server/domain/validation/agreement.js;
  * ICC(2,1) (two-way random effects, absolute agreement, single rater;
    Shrout & Fleiss 1979) on the human-human pairs.

Exclusions: "cannot rate" ratings; raters who are not 'qualified' (the IRR
gate). Below MIN_PAIRS pairs a capability reports no coefficient
(insufficient_data). The job writes one unfrozen calibration_runs row and
never touches study_results or the claims register — a human reviews and
freezes the run (HA-C008).
"""
from __future__ import annotations

import json
from collections import defaultdict

import numpy as np

from ._base import connect, fetch_all, insufficient, seed_everything, summarize, write_run
from .agreement_s2 import weighted_kappa

MIN_PAIRS = 30
LEVELS = 5  # rubric 1..5 -> categories 0..4
ANALYSIS_VERSION = "evidence-agreement-v3.1"


def icc_2_1(matrix) -> float:
    """ICC(2,1) for an n-targets x k-raters matrix without missing cells."""
    x = np.asarray(matrix, dtype=float)
    if x.ndim != 2 or x.shape[0] < 2 or x.shape[1] < 2:
        return float("nan")
    n, k = x.shape
    grand = x.mean()
    ss_rows = k * ((x.mean(axis=1) - grand) ** 2).sum()
    ss_cols = n * ((x.mean(axis=0) - grand) ** 2).sum()
    ss_total = ((x - grand) ** 2).sum()
    ss_err = ss_total - ss_rows - ss_cols
    msr = ss_rows / (n - 1)
    msc = ss_cols / (k - 1)
    mse = ss_err / ((n - 1) * (k - 1))
    den = msr + (k - 1) * mse + k * (msc - mse) / n
    if den == 0:
        return 1.0 if msr == 0 and mse == 0 else float("nan")
    return round(float((msr - mse) / den), 4)


def compute(items: list[dict], ratings: list[dict], min_pairs: int = MIN_PAIRS) -> dict:
    """Pure core. items: {id, capability_id, ai_level}; ratings:
    {item_id, rater_id, level, cannot_rate, created_at} (qualified raters only)."""
    by_item: dict[str, list[dict]] = defaultdict(list)
    for r in sorted(ratings, key=lambda r: (str(r.get("created_at")), str(r.get("rater_id")))):
        if r.get("cannot_rate") or r.get("level") is None:
            continue
        by_item[str(r["item_id"])].append(r)
    caps: dict[str, dict] = defaultdict(lambda: {"hh": ([], []), "ha": ([], []), "items": 0})
    for it in items:
        c = caps[str(it["capability_id"])]
        c["items"] += 1
        rs = by_item.get(str(it["id"]), [])
        if len(rs) >= 2:
            c["hh"][0].append(int(rs[0]["level"]) - 1)
            c["hh"][1].append(int(rs[1]["level"]) - 1)
        if rs and it.get("ai_level") is not None:
            c["ha"][0].append(int(rs[0]["level"]) - 1)
            c["ha"][1].append(int(it["ai_level"]) - 1)

    out = {}
    for cap_id in sorted(caps):
        c = caps[cap_id]
        n_hh, n_ha = len(c["hh"][0]), len(c["ha"][0])
        hh_ok, ha_ok = n_hh >= min_pairs, n_ha >= min_pairs
        out[cap_id] = {
            "items": c["items"],
            "human_human": {
                "pairs": n_hh,
                "kappa": weighted_kappa(*c["hh"], levels=LEVELS) if hh_ok else None,
                "icc_2_1": icc_2_1(np.column_stack(c["hh"])) if hh_ok else None,
                "status": "computed" if hh_ok else "insufficient_data",
            },
            "human_ai": {
                "pairs": n_ha,
                "kappa": weighted_kappa(*c["ha"], levels=LEVELS) if ha_ok else None,
                "status": "computed" if ha_ok else "insufficient_data",
            },
        }
    return {"min_pairs": min_pairs, "capabilities": out, "claim_status": "PENDING",
            "analysis_version": ANALYSIS_VERSION}


def run(conn=None, seed: int = 42) -> dict:
    seed_everything(seed)
    own = conn is None
    if own:
        conn = connect()
    if conn is None:
        return summarize("evidence_agreement_v3", None, "insufficient_data", reason="no database configured")
    items = fetch_all(conn, "SELECT id::text AS id, capability_id, ai_level FROM evidence_rating_items")
    ratings = fetch_all(conn, """
        SELECT r.item_id::text AS item_id, r.rater_id, r.level, r.cannot_rate, r.created_at
          FROM evidence_unit_ratings r
          JOIN raters q ON q.rater_id::text = r.rater_id AND q.status = 'qualified'
    """)
    metrics = compute(items, ratings)
    inputs = {"items": len(items), "ratings": len(ratings), "min_pairs": MIN_PAIRS}
    if not any(v["human_human"]["status"] == "computed" or v["human_ai"]["status"] == "computed" for v in metrics["capabilities"].values()):
        res = insufficient("evidence_agreement_v3", conn, inputs, f"no capability has >= {MIN_PAIRS} rating pairs yet")
        if own and conn:
            conn.close()
        return res
    run_id = write_run(conn, "evidence_agreement_v3", inputs, {"metrics": metrics})
    res = summarize("evidence_agreement_v3", run_id, "ok", capabilities=len(metrics["capabilities"]))
    if own and conn:
        conn.close()
    return res


if __name__ == "__main__":
    print(json.dumps(run(), indent=2, default=str))
