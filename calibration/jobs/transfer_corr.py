"""Transferability (sim-to-reality) correlation — Track 4.3.

Correlates Prism overall scores with independent HUMAN-rated live-exercise
scores for the same candidates (``external_ratings``, entered by partner
colleges via the gated admin flow). This is the study named in
``docs/studies/TRANSFER_PROTOCOL.md`` — the single hardest evidence in the
field and unclaimed by anyone.

Prism scores come from the ``scoring_complete`` audit event (server-clamped
overall). Synthetic sessions are excluded via ``assessment_timeline``.
Writes run_type='transfer_corr'. Exits ``insufficient_data`` below n=30 pairs —
a correlation on a handful of points is noise, not evidence.
"""
from __future__ import annotations

import json
import sys

import numpy as np

from ._base import connect, fetch_all, insufficient, seed_everything, summarize, write_run

MIN_PAIRS = 30


def pearson(x: np.ndarray, y: np.ndarray) -> float:
    if len(x) < 2 or np.std(x) == 0 or np.std(y) == 0:
        return float("nan")
    return round(float(np.corrcoef(x, y)[0, 1]), 4)


def spearman(x: np.ndarray, y: np.ndarray) -> float:
    rx = np.argsort(np.argsort(x)).astype(float)
    ry = np.argsort(np.argsort(y)).astype(float)
    return pearson(rx, ry)


def correlate(pairs: list[tuple[float, float]]) -> dict:
    """Pure core — testable without a database. pairs = [(prism, external)]."""
    x = np.array([p[0] for p in pairs], dtype=float)
    y = np.array([p[1] for p in pairs], dtype=float)
    return {
        "n": len(pairs),
        "pearson_r": pearson(x, y),
        "spearman_rho": spearman(x, y),
        "prism_mean": round(float(x.mean()), 2) if len(x) else None,
        "external_mean": round(float(y.mean()), 2) if len(y) else None,
    }


def run(conn=None, seed: int = 42) -> dict:
    seed_everything(seed)
    own = conn is None
    if own:
        conn = connect()
    if conn is None:
        return summarize("transfer_corr", None, "insufficient_data", reason="no database configured")

    rows = fetch_all(conn, """
        WITH latest AS (
          SELECT DISTINCT ON (session_id) session_id, score
            FROM external_ratings
           ORDER BY session_id, created_at DESC
        )
        SELECT al.session_id,
               (al.payload->>'overall')::numeric AS prism_overall,
               l.score AS external_score
          FROM audit_log al
          JOIN latest l ON l.session_id = al.session_id
          JOIN assessment_timeline t ON t.session_id = al.session_id AND t.is_synthetic = false
         WHERE al.event_type = 'scoring_complete'
           AND al.payload->>'overall' IS NOT NULL
    """)
    inputs = {"pairs": len(rows), "min_pairs": MIN_PAIRS}
    if len(rows) < MIN_PAIRS:
        res = insufficient("transfer_corr", conn, inputs,
                           f"need >= {MIN_PAIRS} prism-external score pairs (have {len(rows)})")
        if own and conn:
            conn.close()
        return res

    metrics = correlate([(float(r["prism_overall"]), float(r["external_score"])) for r in rows])
    run_id = write_run(conn, "transfer_corr", inputs, {"metrics": metrics})
    # Stage 2 registry write: the preregistered S5 metric row.
    import uuid as _uuid
    import json as _json
    with conn.cursor() as cur:
        cur.execute("SELECT study_id FROM studies WHERE study_key = 'sim_to_real_transfer'")
        s_row = cur.fetchone()
        if s_row and metrics.get("pearson_r") is not None:
            cur.execute(
                """INSERT INTO study_results (result_id, study_id, metric_name, value, detail, n, analysis_version)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (str(_uuid.uuid4()), s_row[0], "transfer_pearson_r", metrics["pearson_r"],
                 _json.dumps(metrics), metrics["n"], "transfer-v1"),
            )
    res = summarize("transfer_corr", run_id, "ok", **metrics)
    if own and conn:
        conn.close()
    return res


if __name__ == "__main__":
    print(json.dumps(run(), indent=2, default=str))
