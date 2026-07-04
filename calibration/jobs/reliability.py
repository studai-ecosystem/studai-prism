"""Generalizability (G-theory) reliability via variance components.

Treats each micro-level as ``person x scenario`` crossed data and decomposes the
total variance into person, scenario, and residual components (ANOVA estimators).
The G-coefficient (relative reliability) is::

    Ep2 = var_person / (var_person + var_residual / n_scenarios)

Writes run_type='reliability' with the variance components and G-coefficient.
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np

from ._base import connect, fetch_all, insufficient, seed_everything, summarize, write_run

MIN_OBS = 30
LEVEL_MAX = 4.0


def variance_components(matrix: dict[tuple, float], persons: list, scenarios: list) -> dict:
    """Two-facet crossed p x s ANOVA variance-component estimators."""
    grand = float(np.mean(list(matrix.values())))
    np_, ns = len(persons), len(scenarios)

    person_means = {p: np.mean([matrix[(p, s)] for s in scenarios if (p, s) in matrix] or [grand]) for p in persons}
    scen_means = {s: np.mean([matrix[(p, s)] for p in persons if (p, s) in matrix] or [grand]) for s in scenarios}

    ss_p = ns * sum((person_means[p] - grand) ** 2 for p in persons)
    ss_s = np_ * sum((scen_means[s] - grand) ** 2 for s in scenarios)
    ss_res = sum((matrix[(p, s)] - person_means[p] - scen_means[s] + grand) ** 2
                 for (p, s) in matrix)

    df_p = max(np_ - 1, 1)
    df_s = max(ns - 1, 1)
    df_res = max((np_ - 1) * (ns - 1), 1)
    ms_p, ms_s, ms_res = ss_p / df_p, ss_s / df_s, ss_res / df_res

    var_res = max(ms_res, 0.0)
    var_p = max((ms_p - ms_res) / ns, 0.0)
    var_s = max((ms_s - ms_res) / np_, 0.0)
    return {"var_person": var_p, "var_scenario": var_s, "var_residual": var_res}


def g_coefficient(vc: dict, n_scenarios: int) -> float:
    denom = vc["var_person"] + vc["var_residual"] / max(n_scenarios, 1)
    return round(vc["var_person"] / denom, 4) if denom > 0 else 0.0


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
    cell: dict[tuple, list[float]] = defaultdict(list)
    for r in rows:
        ml = r.get("micro_levels") or {}
        vals = [float(v) for v in ml.values() if isinstance(v, (int, float))]
        if vals:
            cell[(str(r["session_id"]), str(r.get("scenario") or "unknown"))].append(float(np.mean(vals)))

    matrix = {k: float(np.mean(v)) for k, v in cell.items()}
    inputs = {"observations": len(matrix), "min_obs": MIN_OBS}
    if len(matrix) < MIN_OBS:
        res = insufficient("reliability", conn, inputs, f"only {len(matrix)} person-scenario cells")
        if own and conn:
            conn.close()
        return res

    persons = sorted({p for p, _ in matrix})
    scenarios = sorted({s for _, s in matrix})
    vc = variance_components(matrix, persons, scenarios)
    g = g_coefficient(vc, len(scenarios))
    outputs = {**{k: round(v, 5) for k, v in vc.items()},
               "g_coefficient": g, "n_persons": len(persons), "n_scenarios": len(scenarios)}
    run_id = write_run(conn, "reliability", inputs, outputs)
    res = summarize("reliability", run_id, "ok", g_coefficient=g, n_persons=len(persons))
    if own and conn:
        conn.close()
    return res


if __name__ == "__main__":
    run()
