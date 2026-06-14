"""Per-scenario equating constant kappa.

kappa shifts each scenario onto a common scale so a candidate is not advantaged
or penalised by which scenario they drew::

    equated_score = raw_score + kappa(scenario)

kappa is the grand mean minus the scenario mean (0–100 scale). The Node app only
applies kappa when ``PRISM_V2_EQUATING=true`` AND the run is frozen; until then
kappa is effectively 0 (run_type='equate').
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np

from ._base import connect, fetch_all, insufficient, seed_everything, summarize, write_run

MIN_SESSIONS_PER_SCENARIO = 15
LEVEL_MAX = 4.0


def kappa_table(scenario_means: dict[str, float], grand_mean: float) -> dict[str, float]:
    return {s: round(grand_mean - m, 4) for s, m in scenario_means.items()}


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
            SELECT ir.session_id, ir.micro_levels,
                   COALESCE(i.scenario_key, i.scenario_id::text) AS scenario
            FROM item_responses ir LEFT JOIN items i ON i.item_id = ir.item_id
            WHERE ir.micro_levels IS NOT NULL
            """,
        )
    # session-scenario mean score on a 0–100 scale.
    per_session: dict[tuple, list[float]] = defaultdict(list)
    for r in rows:
        ml = r.get("micro_levels") or {}
        vals = [float(v) for v in ml.values() if isinstance(v, (int, float))]
        if vals:
            key = (str(r["session_id"]), str(r.get("scenario") or "unknown"))
            per_session[key].extend(vals)

    by_scenario: dict[str, list[float]] = defaultdict(list)
    for (sid, scen), vals in per_session.items():
        by_scenario[scen].append(float(np.mean(vals)) / LEVEL_MAX * 100.0)

    eligible = {s: v for s, v in by_scenario.items() if len(v) >= MIN_SESSIONS_PER_SCENARIO}
    inputs = {"scenarios": len(by_scenario), "eligible": len(eligible),
              "min_sessions": MIN_SESSIONS_PER_SCENARIO}
    if len(eligible) < 2:
        res = insufficient("equate", conn, inputs, "fewer than 2 scenarios meet the session minimum")
        if own and conn:
            conn.close()
        return res

    scen_means = {s: float(np.mean(v)) for s, v in eligible.items()}
    grand = float(np.mean([m for m in scen_means.values()]))
    kappa = kappa_table(scen_means, grand)
    outputs = {"kappa": kappa, "scenario_means": {s: round(m, 3) for s, m in scen_means.items()},
               "grand_mean": round(grand, 3)}
    run_id = write_run(conn, "equate", inputs, outputs)
    res = summarize("equate", run_id, "ok", n_scenarios=len(kappa), grand_mean=round(grand, 2))
    if own and conn:
        conn.close()
    return res


if __name__ == "__main__":
    run()
