"""Study 2 analysis — human–LLM vs human–human agreement (Vantage replication B).

Protocol: docs/studies/HUMAN_LLM_AGREEMENT_PROTOCOL.md. Preregistered metric:
quadratically-weighted Cohen's κ per dimension —
  κ_HH: between the two qualified human raters on shared sessions;
  κ_HL: between judge-panel modal levels (judge_votes) and each human rater.
Success criterion (stated in advance): κ_HL ≥ κ_HH − 0.05 on EVERY dimension.

Exclusions: synthetic sessions; ratings from raters below the IRR gate
(excluded at the API already — re-filtered here defensively).
Exits insufficient_data below the protocol's 100 double-rated sessions.
Writes the result append-only to study_results + a results memo that states
what the result does NOT support (RULE 3 discipline).
"""
from __future__ import annotations

import json
import uuid
from collections import defaultdict

import numpy as np

from ._base import connect, fetch_all, insufficient, seed_everything, summarize, write_run

DIMENSIONS = ["criticalThinking", "communication", "collaboration", "problemSolving", "aiDigitalFluency"]
MIN_DOUBLE_RATED = 100
NON_INFERIORITY_MARGIN = 0.05
ANALYSIS_VERSION = "s2-agreement-v1"
LEVELS = 5  # 0..4


def weighted_kappa(a: list[int], b: list[int], levels: int = LEVELS) -> float:
    """Quadratically-weighted Cohen's κ (mirrors server/lib/kappa.js)."""
    if len(a) != len(b) or not a:
        return float("nan")
    n = len(a)
    obs = np.zeros((levels, levels))
    for x, y in zip(a, b):
        obs[x, y] += 1
    obs /= n
    pa = obs.sum(axis=1)
    pb = obs.sum(axis=0)
    exp = np.outer(pa, pb)
    w = np.array([[((i - j) ** 2) / ((levels - 1) ** 2) for j in range(levels)] for i in range(levels)])
    do = (w * obs).sum()
    de = (w * exp).sum()
    if de == 0:
        return 1.0
    return round(float(1 - do / de), 4)


def modal_level(levels: list[int]) -> int:
    """Panel modal level for one session×dimension (ties -> median-ish lower)."""
    if not levels:
        return -1
    vals, counts = np.unique(levels, return_counts=True)
    return int(vals[np.argmax(counts)])


def compute_agreement(human_rows: list[dict], panel_rows: list[dict]) -> dict:
    """Pure core. human_rows: {session_id, rater_id, dimension, level};
    panel_rows: {session_id, dimension, level} (one modal level per pair)."""
    # Human-human: sessions with exactly >=2 raters; pair the first two by id.
    by_session: dict[str, dict[str, dict[str, int]]] = defaultdict(dict)
    for r in human_rows:
        by_session[str(r["session_id"])].setdefault(str(r["rater_id"]), {})[r["dimension"]] = int(r["level"])
    panel: dict[tuple, int] = {(str(p["session_id"]), p["dimension"]): int(p["level"]) for p in panel_rows}

    hh_pairs: dict[str, tuple[list, list]] = {d: ([], []) for d in DIMENSIONS}
    hl_pairs: dict[str, tuple[list, list]] = {d: ([], []) for d in DIMENSIONS}
    double_rated = 0
    for sid, raters in by_session.items():
        rids = sorted(raters.keys())
        if len(rids) >= 2:
            double_rated += 1
            a, b = raters[rids[0]], raters[rids[1]]
            for d in DIMENSIONS:
                if d in a and d in b:
                    hh_pairs[d][0].append(a[d])
                    hh_pairs[d][1].append(b[d])
        for rid in rids:
            for d in DIMENSIONS:
                key = (sid, d)
                if d in raters[rid] and key in panel:
                    hl_pairs[d][0].append(panel[key])
                    hl_pairs[d][1].append(raters[rid][d])

    per_dimension = {}
    non_inferior_all = True
    for d in DIMENSIONS:
        k_hh = weighted_kappa(*hh_pairs[d]) if hh_pairs[d][0] else float("nan")
        k_hl = weighted_kappa(*hl_pairs[d]) if hl_pairs[d][0] else float("nan")
        ok = (not np.isnan(k_hh)) and (not np.isnan(k_hl)) and (k_hl >= k_hh - NON_INFERIORITY_MARGIN)
        if not ok:
            non_inferior_all = False
        per_dimension[d] = {
            "kappa_hh": None if np.isnan(k_hh) else k_hh,
            "kappa_hl": None if np.isnan(k_hl) else k_hl,
            "n_hh_pairs": len(hh_pairs[d][0]),
            "n_hl_pairs": len(hl_pairs[d][0]),
            "non_inferior": bool(ok),
        }
    return {"double_rated_sessions": double_rated, "per_dimension": per_dimension,
            "non_inferior_all_dimensions": bool(non_inferior_all),
            "margin": NON_INFERIORITY_MARGIN}


def results_memo(m: dict) -> str:
    lines = [
        "# S2 results memo — human–LLM agreement",
        "",
        f"Double-rated sessions: {m['double_rated_sessions']} · non-inferiority margin: {m['margin']}",
        "",
        "| Dimension | κ human-human | κ AI-human | non-inferior |",
        "| --- | --- | --- | --- |",
    ]
    for d, v in m["per_dimension"].items():
        lines.append(f"| {d} | {v['kappa_hh']} | {v['kappa_hl']} | {'YES' if v['non_inferior'] else 'NO — certified status BLOCKED for this dimension'} |")
    lines += [
        "",
        f"Overall: κ_HL ≥ κ_HH − {m['margin']} on all dimensions: **{'YES' if m['non_inferior_all_dimensions'] else 'NO'}**",
        "",
        "## What this result does NOT support",
        "- It does not validate scoring in any non-English language (S6 governs that).",
        "- It does not validate transfer to live workplace performance (S5 governs that).",
        "- It is agreement with trained human raters on THIS rubric and cohort — not a general claim of measurement validity.",
        "- Dimensions failing non-inferiority are BLOCKED from certified status until the scorer improves and the study re-runs on held-out data (never re-fit on the same data).",
    ]
    return "\n".join(lines)


def run(conn=None, seed: int = 42) -> dict:
    seed_everything(seed)
    own = conn is None
    if own:
        conn = connect()
    if conn is None:
        return summarize("agreement_s2", None, "insufficient_data", reason="no database configured")

    human = fetch_all(conn, """
        SELECT hr.session_id, hr.rater_id, hr.dimension, ROUND(hr.score/25.0)::int AS level
          FROM human_ratings hr
          JOIN assessment_timeline t ON t.session_id = hr.session_id AND t.is_synthetic = FALSE
          JOIN raters r ON r.rater_id::text = hr.rater_id AND r.status = 'qualified'
    """)
    panel = fetch_all(conn, """
        WITH votes AS (
          SELECT ir.session_id, key AS dimension, (value)::text AS lvl
            FROM judge_votes jv
            JOIN item_responses ir ON ir.response_id = jv.response_id
            JOIN assessment_timeline t ON t.session_id = ir.session_id AND t.is_synthetic = FALSE,
            jsonb_each_text(jv.levels)
           WHERE value ~ '^[0-4]$')
        SELECT session_id, dimension, MODE() WITHIN GROUP (ORDER BY lvl::int) AS level
          FROM votes GROUP BY session_id, dimension
    """)

    metrics = compute_agreement(human, panel)
    inputs = {"human_ratings": len(human), "panel_cells": len(panel),
              "double_rated": metrics["double_rated_sessions"], "min_required": MIN_DOUBLE_RATED}
    if metrics["double_rated_sessions"] < MIN_DOUBLE_RATED:
        res = insufficient("agreement_s2", conn, inputs,
                           f"need >= {MIN_DOUBLE_RATED} double-rated real sessions (have {metrics['double_rated_sessions']})")
        if own and conn:
            conn.close()
        return res

    # Append-only registry write (study_results) + calibration_runs record.
    with conn.cursor() as cur:
        cur.execute("SELECT study_id FROM studies WHERE study_key = 'human_llm_agreement'")
        row = cur.fetchone()
        if row:
            cur.execute(
                """INSERT INTO study_results (result_id, study_id, metric_name, value, detail, n, analysis_version)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (str(uuid.uuid4()), row[0], "weighted_kappa_by_dimension", None,
                 json.dumps(metrics), metrics["double_rated_sessions"], ANALYSIS_VERSION),
            )
    run_id = write_run(conn, "agreement_s2", inputs, {"metrics": metrics, "memo": results_memo(metrics)})
    res = summarize("agreement_s2", run_id, "ok",
                    non_inferior_all_dimensions=metrics["non_inferior_all_dimensions"],
                    double_rated=metrics["double_rated_sessions"])
    if own and conn:
        conn.close()
    return res


if __name__ == "__main__":
    print(json.dumps(run(), indent=2, default=str))
