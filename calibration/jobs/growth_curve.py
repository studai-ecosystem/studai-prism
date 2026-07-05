"""Latent growth-curve job — Track 1.2 (cohort layer).

Fits the SAME measurement-error-weighted linear growth model documented in
``server/psychometrics/GROWTH.md`` (mirrors server/lib/velocity.js — keep in
sync) across every candidate with >=3 non-synthetic measurement points on one
scale_version. Emits per-candidate slope + slope SE and, once the cohort has
>= COHORT_MIN candidates, growth percentiles. Writes run_type='growth_curve'.

Synthetic rows are excluded unconditionally (RULE 3).
"""
from __future__ import annotations

import json
from collections import defaultdict

import numpy as np

from ._base import connect, fetch_all, insufficient, seed_everything, summarize, write_run

MIN_POINTS = 3
COHORT_MIN = 20
ANALYSIS_VERSION = "growth-v1"


def weighted_growth(points: list[tuple[float, float, float]]):
    """points: [(attempt_no, theta, se)]. Returns (slope, slope_se, n) or None."""
    pts = [(x, t, s) for x, t, s in points if s and s > 0]
    if len(pts) < 2:
        return None
    w = np.array([1.0 / (s * s) for _, _, s in pts])
    x = np.array([p[0] for p in pts], dtype=float)
    y = np.array([p[1] for p in pts], dtype=float)
    W = w.sum()
    mx = (w * x).sum() / W
    my = (w * y).sum() / W
    sxx = (w * (x - mx) ** 2).sum()
    if sxx <= 0:
        return None
    slope = float((w * (x - mx) * (y - my)).sum() / sxx)
    slope_se = float(np.sqrt(1.0 / sxx))
    return round(slope, 4), round(slope_se, 4), len(pts)


def run(conn=None, seed: int = 42) -> dict:
    seed_everything(seed)
    own = conn is None
    if own:
        conn = connect()
    if conn is None:
        return summarize("growth_curve", None, "insufficient_data", reason="no database configured")

    rows = fetch_all(conn, """
        SELECT candidate_id, attempt_no, scale_version,
               final_theta->'overall'->>'theta' AS theta,
               final_theta->'overall'->>'se' AS se
          FROM assessment_timeline
         WHERE is_synthetic = false
           AND candidate_id IS NOT NULL
           AND final_theta IS NOT NULL
         ORDER BY candidate_id, attempt_no
    """)
    by_candidate: dict[tuple, list] = defaultdict(list)
    for r in rows:
        try:
            # T1.4: one scale_version per fit — mixed scales never pool.
            key = (str(r["candidate_id"]), r["scale_version"])
            by_candidate[key].append((float(r["attempt_no"]), float(r["theta"]), float(r["se"])))
        except (TypeError, ValueError):
            continue

    fits = []
    for (candidate_id, scale), pts in by_candidate.items():
        if len(pts) < MIN_POINTS:
            continue
        g = weighted_growth(pts)
        if g:
            fits.append({"candidate_id": candidate_id, "scale_version": scale,
                         "slope": g[0], "slope_se": g[1], "n_points": g[2]})

    inputs = {"timeline_rows": len(rows), "candidates_fit": len(fits),
              "min_points": MIN_POINTS, "cohort_min": COHORT_MIN}
    if not fits:
        res = insufficient("growth_curve", conn, inputs,
                           f"need candidates with >= {MIN_POINTS} non-synthetic measurement points")
        if own and conn:
            conn.close()
        return res

    # Growth percentiles only once the cohort is large enough (GROWTH.md).
    if len(fits) >= COHORT_MIN:
        slopes = np.array([f["slope"] for f in fits])
        for f in fits:
            f["growth_percentile"] = int(round(100.0 * (slopes < f["slope"]).mean()))

    outputs = {"fits": fits, "cohort_n": len(fits),
               "percentiles_included": len(fits) >= COHORT_MIN,
               "analysis_version": ANALYSIS_VERSION}
    run_id = write_run(conn, "growth_curve", inputs, outputs)
    res = summarize("growth_curve", run_id, "ok", cohort_n=len(fits),
                    percentiles_included=len(fits) >= COHORT_MIN)
    if own and conn:
        conn.close()
    return res


if __name__ == "__main__":
    print(json.dumps(run(), indent=2, default=str))
