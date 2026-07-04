"""Many-facet Rasch (PROX-style marginal estimation).

Decomposes every observed micro-level into additive facets on the logit scale::

    level_logit = theta(candidate) - difficulty(item)
                  - severity(scenario) - severity(judge)

Estimated by centered marginal means (a deterministic PROX-style pass), which is
adequate for monitoring relative severities and candidate ability without a full
JMLE solver. Writes per-facet maps into ``calibration_runs`` (run_type='rasch').
"""
from __future__ import annotations

import math
from collections import defaultdict

import numpy as np

from ._base import connect, fetch_all, insufficient, seed_everything, summarize, write_run

MIN_VOTES = 40
LEVEL_MAX = 4.0


def to_logit(level: float) -> float:
    """0–4 level → logit, clamped away from the asymptotes."""
    p = min(max(level / LEVEL_MAX, 1e-2), 1 - 1e-2)
    return math.log(p / (1 - p))


def estimate_facets(records: list[dict], n_iter: int = 30) -> dict:
    """records: [{candidate, item, scenario, judge, y(logit)}].
    Returns centered facet maps that sum-decompose y."""
    cand = defaultdict(float)
    item = defaultdict(float)
    scen = defaultdict(float)
    judge = defaultdict(float)

    def grouped_resid(key, current_self):
        groups = defaultdict(list)
        for r in records:
            pred = (cand[r["candidate"]] - item[r["item"]]
                    - scen[r["scenario"]] - judge[r["judge"]])
            resid = r["y"] - (pred - current_self[r[key]] * _sign(key))
            groups[r[key]].append(resid)
        return {k: float(np.mean(v)) for k, v in groups.items()}

    def _sign(key):
        return 1.0 if key == "candidate" else -1.0

    for _ in range(n_iter):
        # candidate raises level (+), the others lower it (−); estimate each as
        # the marginal mean holding the rest fixed, then re-center.
        cand.update(grouped_resid("candidate", cand))
        nm = np.mean(list(item.values()) or [0.0])
        for k, v in grouped_resid("item", item).items():
            item[k] = -(v)
        for k, v in grouped_resid("scenario", scen).items():
            scen[k] = -(v)
        for k, v in grouped_resid("judge", judge).items():
            judge[k] = -(v)
        _center(item)
        _center(scen)
        _center(judge)

    return {
        "candidate_theta": {k: round(v, 4) for k, v in cand.items()},
        "item_difficulty": {k: round(v, 4) for k, v in item.items()},
        "scenario_severity": {k: round(v, 4) for k, v in scen.items()},
        "judge_severity": {k: round(v, 4) for k, v in judge.items()},
    }


def _center(d: dict) -> None:
    if not d:
        return
    m = float(np.mean(list(d.values())))
    for k in d:
        d[k] -= m


def run(conn=None, seed: int = 42) -> dict:
    seed_everything(seed)
    own = conn is None
    if own:
        conn = connect()
    rows = []
    if conn is not None:
        rows = fetch_all(
            conn,
            """
            SELECT jv.levels, jv.judge_model, ir.session_id, ir.item_id,
                   COALESCE(i.scenario_key, i.scenario_id::text) AS scenario
            FROM judge_votes jv
            JOIN item_responses ir ON ir.response_id = jv.response_id
            LEFT JOIN items i ON i.item_id = ir.item_id
            WHERE jv.levels IS NOT NULL
            """,
        )
    records = []
    for r in rows:
        levels = r.get("levels") or {}
        for dim, lv in levels.items():
            if isinstance(lv, (int, float)):
                records.append({
                    "candidate": str(r["session_id"]),
                    "item": f"{r['item_id']}:{dim}",
                    "scenario": str(r.get("scenario") or "unknown"),
                    "judge": str(r.get("judge_model") or "unknown"),
                    "y": to_logit(float(lv)),
                })

    inputs = {"votes": len(rows), "facet_records": len(records), "min_votes": MIN_VOTES}
    if len(records) < MIN_VOTES:
        res = insufficient("rasch", conn, inputs, f"only {len(records)} facet records")
        if own and conn:
            conn.close()
        return res

    facets = estimate_facets(records)
    outputs = {
        **facets,
        "n_candidates": len(facets["candidate_theta"]),
        "n_scenarios": len(facets["scenario_severity"]),
        "n_judges": len(facets["judge_severity"]),
    }
    run_id = write_run(conn, "rasch", inputs, outputs)
    res = summarize("rasch", run_id, "ok",
                    n_candidates=outputs["n_candidates"], n_scenarios=outputs["n_scenarios"])
    if own and conn:
        conn.close()
    return res


if __name__ == "__main__":
    run()
