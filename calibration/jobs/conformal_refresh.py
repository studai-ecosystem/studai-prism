"""Conformal CI quantile-table refresh.

Pairs each session's panel overall (from the ``dual_scoring_complete`` audit row)
with the mean human rating for that session, computes the absolute
nonconformity scores, and stores the coverage-level quantile (the CI half-width)
as a frozen table. Mirrors ``server/scoring/conformalStore.js`` so the Node app
can prefer a frozen run over recomputing at request time. Writes
run_type='conformal'.
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np

from ._base import connect, fetch_all, insufficient, seed_everything, summarize, write_run

MIN_PAIRS = 30
COVERAGE = 0.9
FALLBACK_HALF_WIDTH = 6.0


def conformal_quantile(nonconformity: list[float], coverage: float = COVERAGE) -> float:
    if not nonconformity:
        return FALLBACK_HALF_WIDTH
    s = sorted(nonconformity)
    n = len(s)
    # finite-sample adjusted rank for split conformal.
    rank = min(int(np.ceil((n + 1) * coverage)), n) - 1
    return round(float(s[rank]), 4)


def run(conn=None, seed: int = 42) -> dict:
    seed_everything(seed)
    own = conn is None
    if own:
        conn = connect()
    humans = panels = []
    if conn is not None:
        humans = fetch_all(conn, "SELECT session_id, score FROM human_ratings")
        panels = fetch_all(
            conn,
            """
            SELECT session_id, (payload->>'overall')::float AS overall
            FROM audit_log
            WHERE event_type IN ('dual_scoring_complete','scoring_complete')
              AND payload ? 'overall'
            """,
        )
    human_by_session: dict[str, list[float]] = defaultdict(list)
    for h in humans:
        if h.get("score") is not None:
            human_by_session[str(h["session_id"])].append(float(h["score"]))
    panel_by_session = {str(p["session_id"]): float(p["overall"]) for p in panels if p.get("overall") is not None}

    pairs = []
    for sid, scores in human_by_session.items():
        if sid in panel_by_session and scores:
            pairs.append((panel_by_session[sid], float(np.mean(scores))))

    inputs = {"human_sessions": len(human_by_session), "panel_sessions": len(panel_by_session),
              "pairs": len(pairs), "min_pairs": MIN_PAIRS, "coverage": COVERAGE}
    if len(pairs) < MIN_PAIRS:
        outputs = {"half_width": FALLBACK_HALF_WIDTH, "provisional": True,
                   "coverage": COVERAGE, "n_pairs": len(pairs)}
        run_id = write_run(conn, "conformal", inputs, outputs)
        res = summarize("conformal", run_id, "insufficient_data",
                        half_width=FALLBACK_HALF_WIDTH, n_pairs=len(pairs))
        if own and conn:
            conn.close()
        return res

    nonconf = [abs(panel - human) for panel, human in pairs]
    half = conformal_quantile(nonconf, COVERAGE)
    outputs = {"half_width": half, "provisional": False, "coverage": COVERAGE,
               "n_pairs": len(pairs), "mae": round(float(np.mean(nonconf)), 4)}
    run_id = write_run(conn, "conformal", inputs, outputs)
    res = summarize("conformal", run_id, "ok", half_width=half, n_pairs=len(pairs))
    if own and conn:
        conn.close()
    return res


if __name__ == "__main__":
    run()
